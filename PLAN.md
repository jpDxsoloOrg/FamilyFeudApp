# Family Feud App — Product & Architecture Plan

## Product overview

A serverless, real-time Family Feud style party game for casual groups (in person, with a shared
TV/projector, or over a video call). No accounts: players join a game with a join code and a
display name. One person is the **host** who creates the game, authors survey questions, runs the
face-offs, reveals answers, awards strikes, and runs Fast Money.

Sister project of **Know It Owl** — same stack, same "one game, one subscription" real-time
model, same monorepo layout. Differences that drive the design:

- Exactly **two teams** (Family Feud format).
- **Turn order matters.** Each team has an ordered roster; contestants are pulled top-to-bottom.
- **Buzzers.** First-to-buzz must be arbitrated server-side, not on the client.
- **A shared display screen** (TV) that shows the same board players see on their phones.
- **Private per-player content** (Fast Money questions must be visible only to the answering
  player) alongside public broadcast content.
- **Server-authoritative timers** for Fast Money.

## Roles & screens

| Role | Route | What they see |
|------|-------|---------------|
| Host | `/host/:gameId` | Host console: full survey answers, buzz status, action buttons (reveal / strike / skip / pass-play / etc.), roster management, Fast Money controls. Requires `hostToken` (stored in localStorage at creation). |
| Host setup | `/host/:gameId/setup` | Game config, survey question authoring, Fast Money question authoring. |
| Display | `/display/:gameId` | The big-screen board: survey board (hidden answers), strikes, scores, face-off contestants, current guesser, Fast Money board + timer. Public, read-only. |
| Player | `/play/:gameId` | The **same board component as the display**, sized for a phone, plus role-specific controls: the **BUZZ** button (face-off contestants only), "You're up!" banner (current guesser), Fast Money answer form (selected Fast Money player only). |
| Join | `/` | Enter join code + display name, or "Host a new game". |

The board is a single shared React component (`SurveyBoard`, `Scoreboard`, `Strikes`,
`FastMoneyBoard`, `Timer`) rendered by both the display and player screens, so they never drift.
Mobile-first CSS: one-column board on phones, two-column on wide screens, `clamp()` type sizes,
full-width buzz button with a large hit area.

## Game flow

### 1. Lobby & teams
1. Host creates a game → gets a join code (share) and a secret `hostToken` (keep).
2. Players join with a display name; the lobby fills up in real time.
3. Host **randomizes teams** (2 teams, sizes differ by at most one, Fisher–Yates + round-robin
   deal — same algorithm as Know It Owl). Team order = roster order after the shuffle.
4. **Late joiners**: players can still join after teams are set. They land in an
   "unassigned" bucket; the host **manually assigns** them to a team (`assignPlayer`), which
   appends them to the bottom of that team's order. Host can also move a player between teams
   or reorder within a team.
5. **Skip / remove**: the host can `skipPlayer` (the contestant slot advances past them once) or
   `removePlayer` (deactivates them; they drop out of the rotation and the roster display;
   they can be re-activated).

### 2. Rounds (configurable count, default 4; optional per-round point multiplier)
Each round is driven by a state machine (`packages/core/src/round.ts`, pure & unit-tested).

| State | What happens | Host actions |
|-------|--------------|--------------|
| `PICK_CONTESTANTS` | Server auto-picks the next contestant from each team (top-to-bottom, wrapping). Display shows the two names at the podium. Question is **not** shown yet. | `skipContestant(teamId)`, `armBuzzers` |
| `FACE_OFF_ARMED` | Buzzers live on the two contestants' phones. Host reads the question aloud. Display shows the question text and an empty board. | `resolveBuzz` happens via player `buzz` |
| `FACE_OFF_ANSWERING` | Buzz winner shown on display (and their phone lights up). Host listens to the answer and either reveals a board answer or gives a strike (red X). If the reveal is the #1 answer, host can immediately award the face-off. Otherwise the other contestant answers; host reveals/strikes again. | `revealAnswer(index)`, `strike`, `setFaceOffWinner(teamId)`, `resetBuzzers` |
| `PASS_OR_PLAY` | Winning team chooses. | `choosePassOrPlay(playingTeamId)` |
| `PLAYING` | Playing team guesses in roster order **starting after that team's face-off contestant**. Display shows the current guesser; their phone shows "You're up!". Each reveal adds `points × multiplier` to the round pot. Each miss adds a strike (big red X animation). Three strikes → `STEAL`. All answers revealed → pot awarded. | `revealAnswer(index)`, `strike`, `skipGuesser` |
| `STEAL` | Other team gets one guess (they confer; host listens). Reveal → pot goes to the stealing team. Strike → pot goes to the original playing team. | `revealAnswer(index)`, `strike` |
| `REVEAL_REMAINING` | Pot has been awarded. Host reveals any unguessed answers one at a time (no points). | `revealAnswer(index)`, `endRound` |

Face-off contestants count as "having gone", so the rotation cursor advances past them for
the next round.

### 3. Fast Money (after the last round)
1. `FAST_MONEY_SETUP`: the leading team is preselected (host can override). Host picks 2
   players from that team (`selectFastMoneyPlayers`). Display shows the Fast Money board with
   `fastMoneyQuestionCount` empty rows (default 5).
2. `FAST_MONEY_P1`: host starts the timer (`startFastMoneyTurn`, default 20 s). The server
   stores `timerEndsAt`; every screen shows a countdown derived from it (client clock skew is
   corrected with a `serverTime` field). **Only player 1's phone** shows the questions, one at a
   time, with **Submit** and **Skip**. Skipped questions go to the back of the queue and come
   around again while time remains. Submissions after the deadline (+1.5 s grace) are rejected.
   Display shows only the timer and "Player 1 is answering". Player 2's phone shows a
   "look away / wait" screen.
3. `FAST_MONEY_P2`: same for player 2 with a longer timer (default 25 s). The host console
   shows player 1's answers alongside player 2's live answers; the server also flags a likely
   duplicate (normalized string match). The host presses **Buzz duplicate** on that question →
   player 2's phone gets a private message, the answer is cleared and they must enter another.
4. `FAST_MONEY_REVEAL`: host reveals player 1's answers one at a time, picking the matching
   survey answer (or "not on the board" = 0); the running total animates on the display. Then
   player 2's. Reaching `fastMoneyTarget` (default 200) → **WIN** celebration.
5. `FINISHED`.

### Configurable settings (`GameConfig`)
| Key | Default |
|-----|---------|
| `roundCount` | 4 |
| `roundMultipliers` | `[1,1,2,3]` (length = roundCount; host-editable) |
| `strikesToSteal` | 3 |
| `fastMoneyQuestionCount` | 5 |
| `fastMoneyP1Seconds` | 20 |
| `fastMoneyP2Seconds` | 25 |
| `fastMoneyTarget` | 200 |

## Architecture (mirrors Know It Owl)

- **AppSync GraphQL API** (`sst.aws.AppSync`) — queries, mutations, subscriptions. API-key auth
  for v1. One Lambda data source; a TypeScript resolver routes by field name.
- **DynamoDB** (`sst.aws.Dynamo`) — single table, `pk`/`sk`.
- **Frontend** — React SPA (Vite + TypeScript) via `sst.aws.StaticSite` (S3 + CloudFront).
- **`packages/core`** — pure domain logic shared by Lambda and the browser: team split,
  rotation, round state machine, Fast Money queue/scoring, answer normalization. Fully unit
  tested with vitest; the Lambda handlers are thin persistence wrappers around it.

No S3 bucket in v1 (no images). Adding one later is a one-liner in `sst.config.ts`.

### Real-time model

Two subscriptions:

1. **`onGameUpdated(gameId)`** — coarse-grained, public. Every state-changing mutation returns a
   `GameUpdate { event, serverTime, game }` and AppSync fans it out. The `game` payload is
   the **public view**: unrevealed board answers carry only their slot number, no text or
   points; Fast Money questions and unrevealed Fast Money answers are omitted. Display and
   players render straight from this payload — no re-query needed.
2. **`onPlayerMessage(gameId, playerId)`** — private channel. AppSync filters subscription
   delivery on the payload's `gameId` and `playerId`, so only that player's device receives it.
   Used for: `YOU_ARE_UP`, `BUZZ_RESULT`, `FAST_MONEY_DUPLICATE`, `REMOVED`.

Private messages are published by the Lambda calling its own API's `sendPlayerMessage`
mutation (authorised by a deploy-time `INTERNAL_SECRET`; the API URL and key are read from an
SSM parameter because the Lambda cannot be handed its own API's URL at deploy time).

Private *content* (host's full board, Fast Money questions for the active player) is fetched by
authenticated **queries** (`hostGame(gameId, hostToken)`, `fastMoneyView(gameId, playerId)`)
triggered by the public update's `event`, never pushed through the broadcast subscription.

### Buzzer arbitration

`buzz(gameId, playerId)` performs a single DynamoDB `UpdateItem` on the round record with
`ConditionExpression: state = FACE_OFF_ARMED AND attribute_not_exists(buzzWinnerPlayerId)` and a
check that `playerId` is one of the two contestants. The first write wins; the loser's
conditional-check failure is swallowed and the current state returned. Host `resetBuzzers`
clears the winner. Latency fairness on a shared Wi-Fi is good enough for a party game; the host
always has the final say via `setFaceOffWinner`.

### Timers

The server stores `timerEndsAt` (epoch ms) and includes `serverTime` in every payload. Clients
compute `offset = serverTime - Date.now()` and count down to `timerEndsAt - offset`. Fast Money
submissions are validated server-side against `timerEndsAt` with a 1.5 s grace. The host can
end a turn early (`endFastMoneyTurn`).

### Auth

Same as Know It Owl v1: client-generated `playerId` (UUID in localStorage); host gets a
`hostToken` at creation (hash stored on the game record; required by host mutations/queries).
Cognito can be added later as a second AppSync auth mode without restructuring.

## Data model (DynamoDB single table)

| pk          | sk                        | Attributes |
|-------------|---------------------------|------------|
| `GAME#<id>` | `META`                    | status, hostTokenHash, joinCode, config, currentRound, fastMoneyTeamId, fastMoneyPlayerIds[2], fastMoneyStage, timerEndsAt, createdAt |
| `GAME#<id>` | `PLAYER#<playerId>`       | displayName, teamId (null = unassigned), order (position within team), active |
| `GAME#<id>` | `TEAM#<teamId>`           | name, order, score, nextContestantCursor |
| `GAME#<id>` | `SURVEY#<n>`              | text, answers[{ text, points }] (sorted desc), used |
| `GAME#<id>` | `ROUND#<n>`               | surveyNumber, multiplier, state, contestants{teamId→playerId}, buzzWinnerPlayerId, faceOffWinnerTeamId, playingTeamId, currentGuesserPlayerId, strikes, pot, revealed[bool], awardedTo |
| `GAME#<id>` | `FMQ#<n>`                 | text, answers[{ text, points }] |
| `GAME#<id>` | `FMRESP#<slot>#<n>`       | slot 1\|2, answer, skipped, submittedAt, matchedIndex, points, revealed |
| `JOIN#<code>` | `GAME`                  | gameId (lookup for joinGame) |

All reads are `Query pk = GAME#<id>` with `begins_with(sk, ...)`; no GSIs.

## GraphQL schema outline (see `graphql/schema.graphql`)

- **Lobby/roster mutations:** `createGame`, `joinGame`, `randomizeTeams`, `setTeamName`,
  `assignPlayer`, `reorderPlayer`, `removePlayer`, `restorePlayer`, `updateConfig`.
  `joinGame` returns a `GameUpdate` (not its own payload): AppSync only fans out a
  mutation's own return type, and the lobby has to see players arrive. The joiner finds
  its seat in `game.players` by its own `playerId`.
- **Authoring:** `upsertSurvey`, `deleteSurvey`, `upsertFastMoneyQuestion`
- **Round mutations (host):** `startRound`, `skipContestant`, `armBuzzers`, `resetBuzzers`,
  `revealAnswer`, `strike`, `setFaceOffWinner`, `choosePassOrPlay`, `skipGuesser`, `endRound`
- **Round mutations (player):** `buzz`
- **Fast Money:** `selectFastMoneyPlayers`, `startFastMoneyTurn`, `endFastMoneyTurn`,
  `submitFastMoneyAnswer`, `skipFastMoneyQuestion`, `buzzDuplicate`, `revealFastMoneyAnswer`,
  `finishGame`
- **Queries:** `game` (public view), `hostGame` (host token), `fastMoneyView` (active FM player)
- **Subscriptions:** `onGameUpdated(gameId)`, `onPlayerMessage(gameId, playerId)`

## Core algorithms (`packages/core`)

- `teams.ts` — `randomizeTeams` (from Know It Owl).
- `rotation.ts` — ordered roster per team; `nextContestant(team)` advances a cursor past
  inactive players; `guesserOrderAfter(team, contestantId)` yields the play order starting
  after the face-off contestant; append/remove/reorder helpers.
- `round.ts` — `roundReducer(state, action)`: the state table above, strikes, pot, steal
  resolution, awarding. Pure and exhaustively tested.
- `fastMoney.ts` — question queue with skip-to-back semantics, `normalizeAnswer`,
  `isDuplicate`, `totalPoints`, `hasWon(target)`.
- `publicView.ts` — strips hidden data from the full game for the broadcast payload.

## Task list

Work these one at a time, in order within a milestone. Each task should end with passing
`npm run typecheck` (and `npm test` where core logic is touched) and a commit. Stubs in the
code reference these task numbers in their `Not implemented` errors.

### Milestone 1 — Skeleton ✅ (this commit)
- [x] 1.1 Monorepo scaffold (`packages/core`, `packages/functions`, `packages/frontend`), SST config
- [x] 1.2 GraphQL schema draft covering every mutation/query/subscription in this plan
- [x] 1.3 Core types + `randomizeTeams` (ported from Know It Owl with tests)
- [x] 1.4 Stubbed core modules (`rotation`, `round`, `fastMoney`, `publicView`), resolver + handler stubs
- [x] 1.5 Routed placeholder screens and shared `SurveyBoard` component with mobile-first CSS

### Milestone 2 — Lobby, roster & authoring ✅
- [x] 2.1 `functions/lib`: DynamoDB document client, `keys` helpers (done), `hashHostToken` / `requireHost`, `serverTime`, and a `loadGame(gameId)` that reads every `GAME#<id>` item into one in-memory `FullGame` object
- [x] 2.2 `createGame` / `joinGame` (join-code lookup, duplicate-name handling, `JOIN#<code>` record), `updateConfig`, `randomizeTeams` (2 teams, `TEAMS_SET`), `setTeamName`; `game` public query
- [x] 2.3 `core/rotation.ts`: `activeRoster`, `nextContestant`, `guesserOrderAfter`, `assignToTeam`, `reorderWithinTeam` + vitest coverage (wrap-around, inactive skipping, contestant-goes-last)
- [x] 2.4 `hostGame` query (full surveys, full board, Fast Money answers) gated by `requireHost`
- [x] 2.5 Roster mutations: `assignPlayer` (late joiners appended to bottom), `reorderPlayer`, `removePlayer`, `restorePlayer`; joining after `TEAMS_SET` lands in the unassigned bucket
- [x] 2.6 Authoring mutations: `upsertSurvey` (answers sorted desc, validate ≤ 8 answers), `deleteSurvey`, `upsertFastMoneyQuestion`
- [x] 2.7 Frontend `lib/api.ts`: fetch-based `gql`, AppSync realtime websocket subscription helper (`subscribe(query, vars, onData)`), `useGame(gameId)` hook driven by `onGameUpdated`; Join screen (join / host) with localStorage identity
- [x] 2.8 Host Setup screen: config form, survey editor (question + up to 8 answers with points), Fast Money question editor
- [x] 2.9 Lobby views: Display shows join code + players arriving live; Host shows Randomize, rename teams, drag/reorder roster, assign unassigned, remove/restore

### Milestone 3 — Round loop ✅
- [x] 3.1 `core/round.ts`: `makeBoard`, `createRound`, `currentGuesser`, `roundReducer` for the full state table (arm → buzz → face-off reveal/strike → winner → pass/play → playing with strikes → steal → award → reveal remaining → end) + exhaustive vitest (illegal transitions throw, pot math with multipliers, three-strike steal both outcomes, all-answers-revealed awards immediately)
- [x] 3.2 `core/publicView.ts`: `toPublicBoard`, `toPublicRound` (question hidden until armed), `toPublicFastMoneyRows` + tests asserting no hidden text/points leak
- [x] 3.3 Round host mutations wired to DynamoDB: `startRound` (auto-picks contestants via cursor, marks survey used, applies `roundMultipliers[n]`), `skipContestant`, `armBuzzers`, `resetBuzzers`, `revealAnswer`, `strike`, `setFaceOffWinner`, `choosePassOrPlay`, `skipGuesser`, `endRound` (adds awarded pot to team score; after last round → `FAST_MONEY`)
- [x] 3.4 `buzz` mutation with conditional `UpdateItem` arbitration (first write wins, losers get current state); test against DynamoDB Local or a mocked client
- [x] 3.5 Private channel: `sendPlayerMessage` internal mutation invoked by the Lambda (self-call to AppSync) for `YOU_ARE_UP`, `BUZZ_RESULT`, `REMOVED`; frontend `usePlayerMessages(gameId, playerId)` hook
- [x] 3.6 Host console round UI: contestant podium with skip, Arm/Reset buzzers, buzz winner banner, full board with per-answer Reveal buttons, Strike button, Face-off winner picker, Pass/Play picker, current guesser + Skip, End round; keyboard shortcuts (1–8 reveal, X strike)
- [x] 3.7 Display round UI: shared `SurveyBoard`, `Scoreboard`, `Strikes` (big red X animation), contestant podium, current guesser highlight, pot; large-screen layout
- [x] 3.8 Player round UI: same board components sized for phone; full-screen `BUZZ` button for contestants when armed; "You're up!" banner; team roster with your position highlighted
- [x] 3.9 Sound effects (buzz, ding, strike) with a mute toggle; respect autoplay rules (unlock on first tap)

### Milestone 4 — Fast Money
- [ ] 4.1 `core/fastMoney.ts`: `emptyResponses`, `buildQueue` (skips come back in skip order), `skipQuestion`, `answerQuestion`, `clearAnswer`, `normalizeAnswer`, `isDuplicate`, `suggestMatch`, `totalPoints`, `isWithinDeadline` + vitest
- [ ] 4.2 `selectFastMoneyPlayers` (leading team preselected, host override), `startFastMoneyTurn` (sets `timerEndsAt` from config), `endFastMoneyTurn`
- [ ] 4.3 `fastMoneyView` query (only the active slot's player receives questions) and player mutations `submitFastMoneyAnswer` / `skipFastMoneyQuestion` validated against `timerEndsAt` + grace
- [ ] 4.4 `buzzDuplicate` → `FAST_MONEY_DUPLICATE` private message, clears player 2's answer; host console shows P1 vs P2 side by side with `likelyDuplicate` hint
- [ ] 4.5 `revealFastMoneyAnswer` (host picks matched board answer or "not on board"), running total, `finishGame`; win at `fastMoneyTarget`
- [ ] 4.6 Host console Fast Money UI: pick players, Start/End turn, live answers, Buzz duplicate, reveal controls with `suggestMatch` preselected
- [ ] 4.7 Player Fast Money UI: one question at a time with Submit / Skip, big countdown, "look away" screen for the waiting player, duplicate buzz toast that reopens the question
- [ ] 4.8 Display Fast Money UI: 5-row board, server-synced countdown (`serverTime` skew correction), reveal animation, total, WIN celebration

### Milestone 5 — Polish & ops
- [ ] 5.1 Design pass on all screens (Family Feud palette, board tile animations, responsive typography); test on a phone + TV
- [ ] 5.2 Reconnect/resume: rejoin by stored `playerId`, host token recovery, subscription reconnect with re-query
- [ ] 5.3 Question bank import (CSV/JSON) and export; reuse a bank across games
- [ ] 5.4 Undo last host action (keep a short action log per round)
- [ ] 5.5 QR code on the display for joining; spectator mode
- [ ] 5.6 Deploy pipeline (`npx sst deploy --stage production`), custom domain, GitHub Actions on PR
- [ ] 5.7 README walkthrough for hosts

## Future work

- Question bank library reusable across games; import from CSV.
- Cognito host login; multiple hosts/co-host.
- Spectator-only display with QR code for joining.
- Three-team / "Celebrity" variants.

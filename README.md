# Family Feud App

Serverless, real-time Family Feud style party game. Players join with a code (no login), the host
randomizes two teams (and can slot in late joiners by hand), then runs face-offs with phone
buzzers, a survey board with hidden answers, strikes, steals, and a timed two-player Fast Money
finale. A shared display screen shows the same board players see on their phones.

**Stack:** AWS AppSync (GraphQL + subscriptions) · Lambda · DynamoDB · SST v3 · React + Vite.
Same architecture as Know It Owl.

See [PLAN.md](./PLAN.md) for the full product and architecture plan,
[docs/hosting-guide.md](./docs/hosting-guide.md) for how to run a game night, and
[docs/deploying.md](./docs/deploying.md) for stages, CI/CD and the custom domain.

## Repo layout

- `packages/core` — pure domain logic + types: team split, turn rotation, round state machine,
  Fast Money queue/scoring, public-view stripping. Unit tested with vitest.
- `packages/functions` — Lambda resolver + handlers for the AppSync API (`src/lib` holds the
  DynamoDB client, host auth, `loadGame` and the public/host view builders; handler tests run
  against an in-memory DynamoDB fake in `src/testSupport`)
- `packages/frontend` — Vite React SPA: Join, Host console, Display, Player
- `graphql/schema.graphql` — GraphQL schema
- `sst.config.ts` — SST v3 infrastructure definition

## Development

```sh
npm install            # install all workspaces
npm test               # run core + functions unit tests (vitest)
npm run typecheck      # typecheck all workspaces
npm run dev            # run the frontend locally (needs packages/frontend/.env.local, see .env.example)
npm run build          # build the frontend
npx sst install        # once: fetch the pulumi providers
npx sst dev            # live-develop against AWS (requires AWS credentials)
npx sst deploy         # deploy your personal stage; --stage dev / production for the shared ones
```

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Join a game with a code + name, or host a new one (host token is stored in localStorage) |
| `/host/:gameId` | Host console (needs the host token saved at creation) |
| `/host/:gameId/setup` | Settings (rounds, multipliers, strikes, Fast Money timers/target) + survey / Fast Money question authoring |
| `/display/:gameId` | Big-screen board for the TV |
| `/play/:gameId` | Player view: same board + buzzer / Fast Money controls (read-only spectator view for anyone not on the roster) |
| `/watch/:gameId` | The display, for a phone that just wants to follow along |

## Status

- Milestone 1 (skeleton) and Milestone 2 (lobby, roster, authoring) are done: create/join a
  game, randomize two ordered teams, rename teams, slot in late joiners, reorder / remove /
  restore players, and author survey + Fast Money questions, all live over AppSync
  subscriptions. See the task list in [PLAN.md](./PLAN.md).
- Milestone 3 (the round loop) is done: server-picked contestants, phone buzzers with
  server-side arbitration, the survey board with reveals, strikes, steals and pot multipliers,
  a private per-player channel (you're up / buzz result / removed), keyboard shortcuts on the
  host console, and synthesised sound effects with a mute toggle.
- Milestone 4 (Fast Money) is done: pick two players from the leading team, server-timed
  turns with a skew-corrected countdown, questions delivered only to the answering phone with
  skip-to-back, duplicate buzz, host-matched reveals with a running total and a win at the
  target, then finish.
- Milestone 5 (polish and ops) is done: design pass, reconnect/resume and host token
  recovery, question bank import/export, undo, QR join and spectator mode, CI and production
  deploy workflows, and the hosting guide.

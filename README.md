# Family Feud App

Serverless, real-time Family Feud style party game. Players join with a code (no login), the host
randomizes two teams (and can slot in late joiners by hand), then runs face-offs with phone
buzzers, a survey board with hidden answers, strikes, steals, and a timed two-player Fast Money
finale. A shared display screen shows the same board players see on their phones.

**Stack:** AWS AppSync (GraphQL + subscriptions) · Lambda · DynamoDB · SST v3 · React + Vite.
Same architecture as Know It Owl.

See [PLAN.md](./PLAN.md) for the full product and architecture plan.

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
npx sst dev            # live-develop against AWS (requires AWS credentials)
npx sst deploy         # deploy
```

## Screens

| Route | Purpose |
|-------|---------|
| `/` | Join a game with a code + name, or host a new one (host token is stored in localStorage) |
| `/host/:gameId` | Host console (needs the host token saved at creation) |
| `/host/:gameId/setup` | Settings (rounds, multipliers, strikes, Fast Money timers/target) + survey / Fast Money question authoring |
| `/display/:gameId` | Big-screen board for the TV |
| `/play/:gameId` | Player view: same board + buzzer / Fast Money controls |

## Status

- Milestone 1 (skeleton) and Milestone 2 (lobby, roster, authoring) are done: create/join a
  game, randomize two ordered teams, rename teams, slot in late joiners, reorder / remove /
  restore players, and author survey + Fast Money questions, all live over AppSync
  subscriptions. See the task list in [PLAN.md](./PLAN.md).
- Milestone 3 (the round loop: face-offs, buzzers, board, strikes, steals) is next.

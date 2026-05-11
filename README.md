# Motives AI Demo

Motives AI demo is an AI-native user research workspace for turning a study brief into interview plans, invite-based interviews, debriefs, and study-level synthesis.

What it does today:

- Creates structured research studies with a title, objective, audience, context, must-cover topics, and target participant count.
- Generates editable AI interview plans before any participant session starts.
- Runs invite-based, browser-delivered AI interviews for participants.
- Produces per-session debriefs and study-level synthesis from completed interviews.

Current state: monorepo with a Next.js web app, Fastify API, PostgreSQL, shared contracts, and an OpenAI-backed interview and analysis pipeline.

## How It Works

1. A researcher creates a study with a title, objective, audience, context, topics, and target participant count.
2. The API uses an AI plan-generation step to create a draft interview plan.
3. The researcher reviews the draft, edits it if needed, approves it, and creates invite links.
4. A participant follows an invite link and completes an AI-led interview through the public interview flow.
5. The system stores the transcript, generates a session debrief, and rolls completed sessions into study-level analysis.

## Architecture

```mermaid
flowchart LR
  researcher[Researcher]
  participant[Participant]
  web[Next.js web app]
  api[Fastify API]
  db[(PostgreSQL)]
  worker[Analysis worker]
  openai[OpenAI]

  researcher --> web
  participant --> web
  web --> api
  api --> db
  api --> openai
  api -. "RUN_ANALYSIS_WORKER=true" .-> worker
  worker --> db
  worker --> openai
```

Repository map:

```text
apps/web
  Researcher-facing UI and public participant interview flow

apps/api
  Fastify HTTP API, Postgres persistence, AI orchestration, and analysis worker

packages/contracts
  Shared TypeBox schemas, TypeScript types, and a typed API client used by web and API
```

Runtime notes:

- `apps/api/src/server.ts` starts the analysis worker in-process by default when `RUN_ANALYSIS_WORKER=true`.
- `apps/api/src/worker.ts` exists as a separate worker entrypoint if you want API and analysis processing split into separate processes.
- The API is the system boundary for study management, invite handling, public interview state, and debrief retrieval.

## API and State Surface

Primary HTTP routes:

| Surface | Routes |
| --- | --- |
| Health | `GET /health` |
| Studies | `GET /v1/studies`, `POST /v1/studies`, `GET /v1/studies/:studyId`, `POST /v1/studies/:studyId/end`, `POST /v1/studies/:studyId/archive` |
| Study plans | `GET /v1/studies/:studyId/plan`, `POST /v1/studies/:studyId/plan/generate`, `PUT /v1/studies/:studyId/plan`, `POST /v1/studies/:studyId/plan/approve` |
| Invites | `POST /v1/studies/:studyId/invites` |
| Public interview routing | `GET /v1/public/interviews/:inviteCode` |
| Public interview actions | `POST /v1/public/interviews/:inviteCode/actions` |
| Public interview chat | `POST /v1/public/interviews/:inviteCode/chat` |
| Debriefs | `GET /v1/studies/:studyId/interviews/:sessionId/debrief` |

State model summary:

- Study statuses: `planning`, `interviewing`, `analyzing`, `completed`, `archived`
- Session statuses: `welcome`, `details`, `preparing`, `room`, `complete`, `expired`

## Local Development

Requirements:

- Node.js
- `pnpm`
- Docker

Start the full local stack:

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm --filter @motives-ai/api db:migrate
pnpm dev
```

Port defaults:

- Web app: `3000`
- API: `3001`
- PostgreSQL: `5432`

Useful commands:

- Start only the web app: `pnpm dev:web`
- Start only the API: `pnpm dev:api`
- Stop the local database: `pnpm db:down`
- Tail Postgres logs: `pnpm db:logs`
- Run a separate analysis worker: `pnpm --filter @motives-ai/api dev:worker`

Separate worker mode:

- By default, `pnpm dev:api` runs the Fastify server and the analysis worker in the same process.
- To run the worker separately, set `RUN_ANALYSIS_WORKER=false` for the API process and then start `pnpm --filter @motives-ai/api dev:worker`.

Configuration:

| Variable | Purpose | Example / default |
| --- | --- | --- |
| `APP_BASE_URL` | Base URL used when the API builds invite and app-facing links | `http://localhost:3000` |
| `API_BASE_URL` | API base URL used by server-side web-to-API requests | `http://localhost:3001` |
| `NEXT_PUBLIC_API_BASE_URL` | API base URL used by browser-side requests | `http://localhost:3001` |
| `DATABASE_URL` | Main Postgres connection string | `postgres://postgres:postgres@localhost:5432/motives_dev` |
| `DATABASE_URL_TEST` | Test database connection string for API tests | `postgres://postgres:postgres@localhost:5432/motives_test` |
| `OPENAI_API_KEY` | Required for live AI-backed plan generation, interview chat, debriefs, and aggregate synthesis | empty by default |
| `OPENAI_MODEL_INTERVIEWER` | Participant-facing interview model | `gpt-5.4-mini` |
| `OPENAI_MODEL_ANNOTATOR` | Progress and turn-annotation model | `gpt-5.4-mini` |
| `OPENAI_MODEL_PLAN_GENERATOR` | Study plan generation model | `gpt-5.4` |
| `OPENAI_MODEL_DEBRIEF` | Session debrief generation model | `gpt-5.4` |
| `OPENAI_MODEL_AGGREGATE` | Study-level synthesis model | `gpt-5.4` |
| `OPENAI_REASONING_EFFORT` | Provider reasoning setting passed to OpenAI calls | `low` |
| `ANALYSIS_WORKER_POLL_MS` | Poll interval for queued analysis jobs | `5000` |
| `RUN_ANALYSIS_WORKER` | Enables the in-process analysis worker in the API server | `true` |

Notes:

- The app can boot without `OPENAI_API_KEY`, but AI-backed features fail when invoked.
- Docker Compose in this repo provisions PostgreSQL only.

## Quality and Verification

Verified in the current repo state:

- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm --filter @motives-ai/api test` passes
- The API test suite currently covers 30 scenarios
- `GET /health` checks database connectivity before returning `{ "status": "ok" }`

The API test surface includes:
- Structured validation and not-found error handling
- Study lifecycle behavior
- Plan generation and persistence paths
- Invite creation and public interview session flow
- Idempotent room-start behavior
- Analysis queue processing and fallback behavior when AI annotations fail

## AI Design and Data Handling

Model roles are intentionally split:

- Interviewer: streams the participant-facing interview conversation
- Annotator: predicts topic progress, contradictions, emotional signal, and evidence quotes for a turn
- Plan generator: creates the draft study plan
- Debrief generator: creates a debrief for a completed session
- Aggregate synthesizer: rolls debriefs into study-level analysis

Current implementation characteristics:

- AI outputs are validated before persistence using shared schemas and domain-specific validation for study plans and session debriefs.
- The interview flow has fallback behavior when prediction or annotation fails, so topic progress can continue without blocking the session.
- Participant responses, transcript turns, study metadata, approved plans, and debrief summaries are used as model inputs depending on the step.
- API logging redacts authorization headers, cookies, passwords, secrets, and tokens.

## Current Limitations / Next Steps

- There is no authentication, RBAC, or multi-tenant isolation layer in the API today. Internal study-management routes are not protected, and participant access is controlled by invite codes.

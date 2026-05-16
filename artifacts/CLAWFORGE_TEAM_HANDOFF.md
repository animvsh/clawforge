# ClawForge Team Handoff

This is the day-one execution map. Each person gets a separate feature lane, separate files, and an independent test path.

Repo: https://github.com/animvsh/clawforge

Live demo: https://clawforge.aalang.workers.dev/

Linear project: https://linear.app/askdad/project/clawforge-c618a255248b

Canonical PRD Google Doc: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

Composio status: Google Docs and Gmail were connected through Composio MCP. The PRD link was emailed to `aalang@ucsc.edu`.

NemoClaw-first v2 artifacts:

- `artifacts/CLAWFORGE_NEMOCLAW_FIRST_PRD.md`
- `artifacts/CLAWFORGE_NEMOCLAW_WORKTREE_PLAN.md`

Linear v2 scope:

- `ANU-41` through `ANU-50`: P0 NemoClaw-first worktree lanes.
- `ANU-51` through `ANU-55`: P1 follow-up features, including optional Supabase accounts.

Development readiness:

- Start with `ANU-44` data contracts and fixtures.
- Then merge `ANU-45` API compatibility and `ANU-46` policy router.
- Then merge `ANU-47` runtime and memory.
- Frontend lanes can work in parallel as long as they stay inside their owned files and wait for shared type changes before final merge.
- `ANU-50` is the final QA/deploy gate and should run after all P0 lanes.
- `ANU-55` Supabase accounts is optional P1 and must not block the public NemoClaw demo.

V2 owner split:

- Adithya / frontend: `ANU-41`, `ANU-42`, `ANU-43`, plus P1 `ANU-51`, `ANU-52`.
- pmgandhi / backend: `ANU-44`, `ANU-45`, `ANU-46`, `ANU-47`, plus P1 `ANU-53`, `ANU-55`.
- Edwin / dashboard, report, QA: `ANU-48`, `ANU-49`, `ANU-50`, plus P1 `ANU-54`.

Supabase project reference: `mfslvyqvkutazsimsrhu`

Supabase secret note: the personal access token shared in chat must not be copied into source, artifacts, or Linear. Rotate it before production use and store replacement credentials only in local/deployment secret stores.

## Current Access Reality

- `pmgandhi@ucsc.edu` exists in Linear and is assigned directly.
- Linear currently has `adpradee@ucsc.edu`, which is assigned to Adithya's frontend lane.
- Linear currently has `gedwinom@ucsc.edu`, which is assigned to Edwin's dashboard/memory/report lane.
- The originally requested Gmail addresses, `adithyaapradeep@gmail.com` and `edwin.giwin@gmail.com`, still require Linear org invite/admin action if those exact identities are needed.
- GitHub private repo access still requires GitHub usernames or GitHub sudo verification in the browser.

## MVP Functional Status

The current Cloudflare build is a complete deterministic MVP demo:

- Prompt-to-blueprint works through `/api/blueprints`.
- Blueprint review includes tools, policies, memory schema, workflow, and config preview.
- Deploy initializes an in-memory runtime session.
- SSE logs include allowed tool calls, policy checks, a blocked data export, and an approval request.
- Approval decision resolves the paused shell action, stores session memory, emits completion logs, and unlocks the final report.
- Report endpoint returns `409` before completion and returns the incident report after approval resolution.

## Shared Commands

```sh
npm install
npm run dev
npm run lint
npm run build
```

Known lint note: the starter UI components currently produce fast-refresh warnings. Treat new errors as blockers.

## Functional Mock API

The repo now includes a mock-functional ClawForge API so workstreams can integrate independently before real providers and storage exist.

| Purpose            | Method | Endpoint                                          |
| ------------------ | ------ | ------------------------------------------------- |
| Health             | GET    | `/api/health`                                     |
| Generate blueprint | POST   | `/api/blueprints`                                 |
| Deploy agent       | POST   | `/api/agents/deploy`                              |
| Start demo agent   | POST   | `/api/agents/agent_sentinelclaw_demo/start`       |
| Stop demo agent    | POST   | `/api/agents/agent_sentinelclaw_demo/stop`        |
| Stream demo logs   | GET    | `/api/agents/agent_sentinelclaw_demo/logs/stream` |
| Get memory         | GET    | `/api/agents/agent_sentinelclaw_demo/memory`      |
| Get report         | GET    | `/api/agents/agent_sentinelclaw_demo/report`      |
| Resolve approval   | POST   | `/api/approvals/approval_shell_block_ip/decision` |

Shared contracts live in `src/lib/clawforge/types.ts`.

Demo fixtures live in `src/lib/clawforge/fixtures.ts`.

API routing lives in `src/lib/clawforge/api.ts` and is mounted from `src/server.ts`.

## Person 1: Adithya

Requested email: `adithyaapradeep@gmail.com`

Linear assignee currently used: `adpradee@ucsc.edu`

Lane: Frontend product experience

Linear ownership:

- `ANU-21` Product shell and navigation
- `ANU-22` Blueprint builder UI
- `ANU-23` Blueprint review UI
- `ANU-28` Live agent dashboard

Primary files:

- `src/routes/index.tsx`
- `src/styles.css`
- `src/components/clawforge/AgentBuilder.tsx`
- `src/components/clawforge/BlueprintReview.tsx`
- `src/components/clawforge/LiveDashboard.tsx`
- `src/lib/clawforge/types.ts` only for imported types, not contract rewrites without coordination

Independent test path:

1. Run `npm run dev`.
2. Open `/`.
3. Confirm landing remains clean and uncluttered.
4. POST to `/api/blueprints` from the builder UI.
5. Render the returned blueprint.
6. Open dashboard against `/api/agents/agent_sentinelclaw_demo/logs/stream`.

Do not own:

- Provider secrets.
- Runtime execution logic.
- Policy engine logic.
- Deployment config.

## Person 2: pmgandhi

Email: `pmgandhi@ucsc.edu`

Lane: Backend, runtime, intelligence, policy

Linear ownership:

- `ANU-24` Backend API foundation
- `ANU-25` Intelligence provider layer: Nemotron, MiniMax, Mock
- `ANU-26` Agent runtime and tool router
- `ANU-27` NemoClaw policy engine

Primary files:

- `src/server.ts`
- `src/lib/clawforge/api.ts`
- `src/lib/clawforge/types.ts`
- `src/lib/clawforge/fixtures.ts`
- `src/lib/clawforge/providers/*`
- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/policies.ts`

Independent test path:

1. Run `npm run build`.
2. Verify `GET /api/health`.
3. Verify `POST /api/blueprints` returns `SentinelClaw`.
4. Verify SSE route emits runtime events.
5. Verify approval decision route returns memory update.
6. Verify no endpoint returns or logs secrets.

Do not own:

- Landing copy polish.
- Final report visual design.
- Demo pitch wording except API truth corrections.

## Person 3: Edwin

Requested email: `edwin.giwin@gmail.com`

Linear assignee currently used: `gedwinom@ucsc.edu`

Lane: Memory, report, demo, deployment verification

Linear ownership:

- `ANU-29` Persistent memory system
- `ANU-30` Final incident report
- `ANU-31` Deployment and demo verification
- `ANU-32` Demo script and judge walkthrough

Primary files:

- `src/lib/clawforge/memory.ts`
- `src/lib/clawforge/reports.ts`
- `src/components/clawforge/MemoryTimeline.tsx`
- `src/components/clawforge/IncidentReport.tsx`
- `artifacts/CLAWFORGE_DEMO_SCRIPT.md`
- `artifacts/CLAWFORGE_TEAM_HANDOFF.md`
- `wrangler.jsonc`
- `README.md`

Independent test path:

1. Verify `/api/agents/agent_sentinelclaw_demo/memory`.
2. Verify `/api/agents/agent_sentinelclaw_demo/report`.
3. Confirm the report includes memory-derived notes.
4. Confirm live Cloudflare URL returns 200.
5. Confirm `/api/health` returns `ok: true`.
6. Keep the demo script under five minutes.

Do not own:

- Provider implementation.
- Policy decision logic.
- Blueprint generation internals.

## Integration Rules

- Keep shared type changes small and announce them in Linear.
- Each PR should name the owned Linear issues.
- Each PR should include `npm run lint` and `npm run build` results.
- No API keys in commits, screenshots, Linear, or artifacts.
- Real provider work must preserve mock mode.
- Frontend should tolerate mock API responses while backend evolves.

## Branch Suggestions

- Adithya: `codex/adithya-frontend-experience`
- pmgandhi: `codex/pmgandhi-backend-runtime-policy`
- Edwin: `codex/edwin-memory-report-demo`

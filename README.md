# ClawForge

ClawForge is a one-prompt builder for secure autonomous agents. The current repo includes the live landing page, Cloudflare Worker deployment, shared ClawForge contracts, and a mock-functional API foundation for the hackathon demo flow.

Live app: https://clawforge.aalang.workers.dev/

Backend health: https://clawforge.aalang.workers.dev/api/health

GitHub repo: https://github.com/animvsh/clawforge

Linear project: https://linear.app/askdad/project/clawforge-c618a255248b

## Development

Install dependencies, then run the Vite dev server:

```sh
npm install
npm run dev
```

For Brev, use the setup script after cloning the repo onto the instance:

```sh
scripts/brev/setup-clawforge.sh
npm run dev -- --host 0.0.0.0
```

Configure secrets through Brev/deployment secret stores or a local uncommitted env file. Use `.env.example` for variable names only.

## Supabase Accounts

ClawForge has an optional Supabase account layer. Anonymous users can still run the demo, while configured Supabase projects enable sign up, sign in, and future saved blueprints/runs.

Local setup:

```sh
cp .env.example .env.local
```

Then set `VITE_SUPABASE_ANON_KEY` in `.env.local`. Keep personal access tokens and service-role keys out of source control.

Database setup:

```sh
supabase db push --project-ref mfslvyqvkutazsimsrhu
```

The migration at `supabase/migrations/20260516000100_clawforge_accounts.sql` creates profiles, saved blueprint scaffolding, saved run scaffolding, and row-level security policies.

## Functional Demo API

The app supports mock-mode endpoints so frontend, backend, memory/report, and demo owners can work independently.

- `POST /api/blueprints`
- `POST /api/agents/deploy`
- `POST /api/agents/agent_sentinelclaw_demo/start`
- `POST /api/agents/agent_sentinelclaw_demo/stop`
- `GET /api/agents/agent_sentinelclaw_demo/logs/stream`
- `GET /api/agents/agent_sentinelclaw_demo/memory`
- `GET /api/agents/agent_sentinelclaw_demo/report`
- `POST /api/approvals/approval_shell_block_ip/decision`

See `artifacts/CLAWFORGE_API_EXAMPLES.md` for curl examples.

## Team Workstreams

See `artifacts/CLAWFORGE_TEAM_HANDOFF.md` for the person-by-person split.

- Animesh: product scope, secret hygiene, final QA, and NemoClaw handoff.
- Paras (`pmgandhi@ucsc.edu` in Linear): UI and frontend experience.
- Adithya: backend, runtime, providers, and policy.
- Edwin: memory, reports, Brev, deployment, and hardening.

Shared contracts live in `src/lib/clawforge/types.ts`.

## Animesh Branch

Current Animesh-owned execution planning lives in `artifacts/CLAWFORGE_ANIMESH_EXECUTION_PLAN.md`.

## Scripts

- `npm run dev` - start local development
- `npm run build` - create a production build
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint

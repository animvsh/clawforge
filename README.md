# ClawForge

ClawForge is a one-prompt builder for secure autonomous agents. The current repo includes the live landing page, a full multi-page product frame, Cloudflare Worker deployment, shared ClawForge contracts, and a mock-functional API foundation for the hackathon demo flow.

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

For local browser testing on the requested port:

```sh
npm run dev -- --host 0.0.0.0 --port 8080
```

## App Pages

The app has a complete frame with direct routes for the core PRD flow:

- `/` - landing page with Lovable-style prompt composer
- `/builder` - prompt-to-blueprint builder
- `/blueprint` - generated agent blueprint review
- `/dashboard` - live runtime, audit stream, policy, approval, and memory panels
- `/report` - final incident report

## Brev Canonical Runtime

Brev is the canonical ClawForge runtime demo environment. Cloudflare remains a public landing/demo mirror, but the safety proof should run from a Brev GPU VM:

Prompt -> NemoClaw blueprint -> Brev-hosted NemoClaw sandbox -> Nemotron/NIM reasoning -> live audit dashboard -> approval gate -> memory -> final report.

Recommended Brev shape:

- Runtime mode: VM Mode.
- GPU: L40S 48GB first, A100 80GB next, H100 only if needed. Use T4 only for frontend/API/mock mode.
- Repo: `https://github.com/animvsh/clawforge.git`.
- Setup script: `scripts/brev/setup-clawforge.sh`.
- Work directory: `/home/ubuntu/workspace/clawforge`.

Create secrets in Brev by name only. Do not paste real values into Git, docs, screenshots, build logs, or Linear:

- `NVIDIA_API_KEY`
- `NGC_CLI_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_PLAN_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only if server-side persistence is enabled
- `COMPOSIO_API_KEY` only if Composio is used from Brev

Start from the repo with the Brev setup script:

```sh
scripts/brev/setup-clawforge.sh
npm run dev -- --host 0.0.0.0 --port 5173
```

The setup script installs dependencies, creates a secret-free `.env` when one is missing, verifies GPU/container visibility, and runs `npm run build`. It does not write secret values to disk.

NemoClaw onboarding path:

```sh
INSTALL_NEMOCLAW=1 ./scripts/brev/setup-clawforge.sh
NEMOCLAW_PROVIDER=routed nemoclaw onboard --non-interactive
```

Ports to document in Brev tunnels or local port forwards:

| Service | Port | Exposure |
| --- | --- | --- |
| ClawForge Vite dev app | `5173` | Tunnel or forward for demos |
| ClawForge production preview | `4173` | Tunnel or forward after `npm run start` |
| NemoClaw/OpenClaw dashboard | `18789+` | Forward only when needed; token is sensitive |
| NemoClaw model router | `4000` | Host-side/private only |
| Optional local NIM | `8000` | Forward for API testing only; avoid public tunnel |

Brev port-forward example:

```sh
brev port-forward clawforge-nemoclaw \
  --port 5173:5173 \
  --port 4173:4173 \
  --port 18789:18789
```

Launchable checklist:

- Code source is the GitHub repo.
- Runtime is VM Mode.
- GPU recommendation is L40S 48GB, with A100 80GB as fallback.
- Setup script is `scripts/brev/setup-clawforge.sh`.
- Secure links expose the ClawForge app and, only when needed, the NemoClaw dashboard.
- Router, gateway token, local NIM, and raw inference ports are not public.
- Required secret names are documented by name only.
- `npm run build` passes before the Launchable is shared.
- The Launchable is link-sharing or organization-only until final review.

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

Namespaced API work is also present under the ClawForge backend layer and should stay backwards compatible with the mock demo routes.

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
- `npm run start` - serve the production client build
- `npm run lint` - run ESLint

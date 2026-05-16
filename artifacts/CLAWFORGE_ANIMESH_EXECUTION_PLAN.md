# ClawForge Animesh Execution Plan

Created: May 16, 2026

Branch: `animesh`

## Current Brev Setup State

Completed locally:

- Brev CLI installed with Homebrew.
- Brev login completed with the user-provided token without writing the token to the repo.
- Active Brev organization set to `aalang-0-awxe`.
- `brev healthcheck` returns `Healthy!`.
- Brev agent skill installed for Codex.
- No Brev instances currently exist in `aalang-0-awxe`.

Do not commit Brev tokens, NVIDIA tokens, Supabase tokens, Composio keys, MiniMax keys, or generated gateway tokens.

## Animesh-Owned Linear Tasks

### ANU-36: Secret Hygiene And Provider Key Rotation

Goal:

Create a safe baseline before anyone starts wiring real provider credentials into ClawForge.

Owned files:

- `.env.example`
- `README.md`
- `artifacts/*`
- deployment notes only when needed

Plan:

1. Verify no literal secrets are present in source, artifacts, docs, config, or committed build output.
2. Keep only placeholder names in repo: `NVIDIA_API_KEY`, `NGC_CLI_API_KEY`, `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `COMPOSIO_API_KEY`.
3. Ensure provider adapters read secrets server-side only.
4. Record secret handling rules in `.env.example`, README, and handoff artifacts.
5. Ask the owner to rotate any secrets pasted into chat before production or public demos.
6. Require every PR to state whether it touched provider config, secrets, deploy config, or logs.

Acceptance criteria:

- `rg` scan finds no literal known token prefixes or pasted secret values in repo files.
- `.env.example` documents required variables by name only.
- README points contributors to secret-safe local/Brev setup.
- Brev setup script prints configured/missing secret names without printing values.
- Final note tells team to rotate pasted credentials before production.

Status:

- In progress.
- `.env.example` added.
- Brev setup script added.
- Initial repo scan completed with no committed pasted token values found; remaining hits are placeholder names and copy about secret safety.

### ANU-50: Final QA, Deploy, And NemoClaw Handoff

Goal:

Own the last integration pass after all P0 lanes merge.

Dependencies:

- ANU-36 secret hygiene baseline.
- ANU-44 data contracts and fixtures.
- ANU-45 API namespace.
- ANU-46 policy router.
- ANU-47 runtime sequence and memory moment.
- ANU-48 live dashboard.
- ANU-49 approval gate and final report UI.
- ANU-56 Brev foundation and Launchable.
- ANU-57/58 provider and policy interfaces.
- ANU-63 sandbox session adapter.
- ANU-64 audit/forensics.
- ANU-65 sandbox hardening verification.

Plan:

1. Pull latest `animesh` and then latest `main` only after approved merges land.
2. Run local verification:
   - `npm run lint`
   - `npm run build`
   - health endpoint check
   - blueprint generation
   - deploy/start demo agent
   - SSE audit stream
   - deny approval
   - memory retrieval
   - final report
3. Run Brev verification:
   - create or start the ClawForge Brev instance
   - run `scripts/brev/setup-clawforge.sh`
   - start app on `0.0.0.0`
   - expose app port through Brev
   - verify NemoClaw dashboard/path when the sandbox adapter is ready
4. Run safety verification:
   - shell action pauses
   - raw log export is denied
   - policy editing is denied
   - audit disabling is denied
   - secret-like values never appear in logs or report output
5. Run product verification:
   - landing says ClawForge is a secure NemoClaw agent factory
   - no Lantern, Slack workspace, generic workspace, or AI employee positioning remains
   - final demo prompt works without login
6. Prepare handoff:
   - public URL
   - Brev URL or Launchable link
   - final PRD link
   - Linear project link
   - demo script
   - known fallback mode if provider APIs fail

Acceptance criteria:

- The full demo path works from a fresh run.
- Brev is the canonical runtime proof.
- Cloudflare/public landing remains available.
- NemoClaw safety behavior is visible and judge-readable.
- Nemotron, MiniMax, and mock fallback behavior are documented.
- Approval denial updates memory and changes a later action.
- Final report records the policy result and safety outcome.
- No restricted action runs without approval.

Status:

- Planned.
- Blocked by P0 implementation lanes.

## Brev Instance Start Plan

Use this when ready to create the actual GPU workspace:

```sh
brev start https://github.com/animvsh/clawforge.git --name clawforge-nemoclaw
brev shell clawforge-nemoclaw
cd /home/ubuntu/workspace/clawforge
git checkout animesh
git pull --ff-only origin animesh
scripts/brev/setup-clawforge.sh
npm run dev -- --host 0.0.0.0
```

Expose local development:

```sh
brev port-forward clawforge-nemoclaw --port 5173:5173
```

Required Brev secrets by name only:

- `NVIDIA_API_KEY`
- `NGC_CLI_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_PLAN_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMPOSIO_API_KEY`

## Commit Discipline

Every completed task on this branch should follow:

```sh
git status --short
npm run build
git add <intended files only>
git commit -m "<clear task summary>"
git push origin animesh
```

Do not stage unrelated generated output, local environment files, tokens, screenshots containing secrets, or deployment logs with secret values.

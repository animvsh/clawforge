# ClawForge Brev Build Research

Research date: May 16, 2026
Implementation branch: `codex/anu-56-brev-foundation-launchable`

## Decision

ClawForge should be built and demoed on NVIDIA Brev.

Brev should be the canonical runtime environment for the hackathon demo because it gives the project:

- A real NVIDIA GPU environment for Nemotron/NIM work.
- A reproducible remote development and demo machine.
- Docker, Docker Compose, CUDA, Python, Jupyter, and SSH already configured.
- A path to deploy NemoClaw/OpenShell on a GPU VM.
- Launchables for team onboarding and judge reproducibility.

Cloudflare can remain useful for a lightweight public landing URL, but the core product proof should run on Brev:

Prompt -> NemoClaw blueprint -> Brev-hosted NemoClaw sandbox -> Nemotron/NIM reasoning -> live audit dashboard -> approval gate -> memory -> final report.

## Primary Brev Facts From Research

NVIDIA Brev provides preconfigured GPU instances with NVIDIA drivers, CUDA, Python, Docker, Docker Compose, JupyterLab, and SSH access.

Brev instances preserve `/home/ubuntu/workspace` when stopped, but data is lost when an instance is deleted. Work should live in `/home/ubuntu/workspace` and be pushed to Git frequently.

Brev CLI can create an instance from a GitHub repo and open a shell:

```sh
brev start https://github.com/animvsh/clawforge.git --name clawforge-nemoclaw
brev shell clawforge-nemoclaw
```

Brev secrets can store API keys as environment variables injected into host and container environments. Use this for NVIDIA, NGC, Supabase, MiniMax, and Composio keys. Do not put secrets in repo, Linear, or setup scripts.

Brev Launchables are shareable, reproducible GPU environments. They capture hardware, software, code source, networking, and setup scripts. For ClawForge, the final hackathon artifact should be a Launchable.

## Recommended Brev Architecture

Use Brev VM Mode for the main hackathon build.

Why:

- NemoClaw onboarding and policy work happens on the host.
- NemoClaw/OpenShell containers need host-side policy files and rebuild commands.
- NVIDIA NIM deployment is more practical on a full VM.
- Private repo or API-key setup can be handled in a setup script.
- Full SSH access is useful for debugging.

Container Mode is useful later for fully packaged reproducibility, but VM Mode is better for the hackathon because NemoClaw needs host-side control.

## GPU Choice

Use this fallback order:

1. L40S 48GB for the main demo if available.
2. A100 80GB if using larger NIMs or if L40S capacity is unavailable.
3. H100 only if using large models and budget allows.
4. T4 only for frontend/API/mock mode, not for serious local Nemotron/NIM inference.

For a reliable demo, use hosted NVIDIA API routing first and keep local NIM as the stretch path. If local NIM is required, use L40S/A100 and pin a small/medium Nemotron model.

## Recommended Services On Brev

Run these on one Brev instance for the demo:

| Service               | Purpose                                      | Port                  |
| --------------------- | -------------------------------------------- | --------------------- |
| ClawForge web app     | Builder, dashboard, report UI                | 3000 or 5173          |
| ClawForge API         | Blueprint/deploy/runtime endpoints           | same app or 8787      |
| NemoClaw dashboard    | OpenClaw/OpenShell UI                        | 18789+                |
| NemoClaw model router | Host-side inference route                    | 4000                  |
| Local NIM             | Optional local Nemotron-compatible inference | 8000 or model default |

Use Brev tunnels for shareable web demos and Brev port-forward for local development.

## Setup Script

The Brev setup script now lives at `scripts/brev/setup-clawforge.sh`.

It does the following without printing secret values:

1. Resolves the repo root from the script path.
2. Ensures Node.js 20+ is present, installing Node.js 20 on Ubuntu when needed.
3. Installs repo dependencies with `npm ci`.
4. Creates `.runtime` and a secret-free `.env` from `.env.example` only when
   `.env` is missing.
5. Checks required Brev secret names and prints only `set` or `missing`.
6. Verifies `nvidia-smi` when available.
7. Verifies Docker daemon access when available.
8. Optionally runs a Docker GPU probe with `VERIFY_DOCKER_GPU=1`.
9. Optionally installs NemoClaw with `INSTALL_NEMOCLAW=1`.
10. Runs `npm run build`.
11. Prints the exact commands for app startup, port forwarding, and NemoClaw
    onboarding.

Default run:

```sh
./scripts/brev/setup-clawforge.sh
```

Full Brev onboarding run after Brev secrets are present:

```sh
INSTALL_NEMOCLAW=1 ./scripts/brev/setup-clawforge.sh
NEMOCLAW_PROVIDER=routed nemoclaw onboard --non-interactive
```

Do not commit real keys. Use Brev secrets or provider deployment secrets.

## NemoClaw On Brev

NemoClaw should run inside the Brev VM and manage an OpenShell sandbox.

Use this as the robust routed path:

```sh
NEMOCLAW_PROVIDER=routed nemoclaw onboard --non-interactive
```

Important implementation notes:

- The NemoClaw router listens on host port `4000`.
- The sandbox calls `https://inference.local/v1`; do not point in-sandbox tools directly at host port `4000`.
- The NemoClaw dashboard defaults around port `18789`; if occupied, it uses the next free port.
- Treat the NemoClaw gateway token like a password.
- Host-side policy files are durable; in-sandbox policy edits are not.
- For policy changes, edit host-side files and rebuild/onboard, or use OpenShell policy commands carefully.

## Local NIM/Nemotron Strategy

There are two viable model paths.

### Path A: Routed NVIDIA API

Best for the first working demo.

Pros:

- Faster setup.
- Lower GPU pressure.
- Easier to keep deterministic.
- Still runs on Brev and uses NVIDIA/Nemotron.

Cons:

- Less impressive than local NIM.

### Path B: Local NIM On Brev

Best for the bonus/stronger demo.

Pros:

- Real GPU-hosted inference.
- Stronger NVIDIA story.
- Can expose OpenAI-compatible endpoints.

Cons:

- Requires NGC key.
- Requires sufficient VRAM.
- Model download/cache time can be large.
- More failure modes under hackathon time.

Recommendation:

Build Path A first, then add Path B only after the NemoClaw dashboard flow is stable.

## Networking And Public Demo

Use two modes.

Development mode:

```sh
brev port-forward clawforge-nemoclaw --port 5173:5173 --port 18789:18789
```

Judge demo mode:

- Use Brev console tunnels for public URLs.
- Expose the ClawForge app port.
- Expose the NemoClaw dashboard port only if needed.
- Do not expose unauthenticated inference or gateway tokens publicly.

Port map:

| Service | Port | Exposure |
| --- | --- | --- |
| ClawForge Vite dev app | `5173` | Tunnel or forward for demos |
| ClawForge production preview | `4173` | Tunnel or forward after `npm run start` |
| NemoClaw/OpenClaw dashboard | `18789+` | Forward only when needed |
| NemoClaw model router | `4000` | Host-side/private only |
| Optional local NIM | `8000` | Forward for API tests only |

## Persistence Strategy

Brev persistence rules:

- `/home/ubuntu/workspace` persists when stopped.
- `/tmp` does not persist.
- Docker images and containers persist when stopped.
- Everything is lost on delete.

Therefore:

- Keep repo in `/home/ubuntu/workspace/clawforge`.
- Keep generated reports and demo artifacts under `/home/ubuntu/workspace/clawforge/.runtime` or in Supabase later.
- Push code to Git before stopping the instance.
- Do not rely on stopped-instance capacity returning; push often.

## Launchable Strategy

Create a Brev Launchable after the setup script works.

Launchable settings:

- Code source: Git repository `https://github.com/animvsh/clawforge`
- Runtime: VM Mode
- GPU: L40S 48GB or A100 80GB recommendation
- Setup script: `scripts/brev/setup-clawforge.sh`
- Networking:
  - ClawForge web app
  - NemoClaw dashboard
  - Optional Jupyter disabled unless needed
- Visibility: link-sharing for hackathon, organization-only if secrets/team access are sensitive

Add a Launch on Brev badge to README only after the Launchable exists.

Checklist before sharing the Launchable:

- `scripts/brev/setup-clawforge.sh` completes on a fresh Brev VM.
- `npm run build` passes.
- The app starts with `npm run dev -- --host 0.0.0.0 --port 5173`.
- Brev tunnel or port-forward reaches the app.
- NemoClaw onboard completes with routed inference.
- Dashboard port is reachable only through an intentional forward/tunnel.
- Gateway token, model router, local NIM, and raw provider endpoints are private.
- Required secret names are documented by name only.
- Cloudflare is described as an optional landing/public mirror, not the canonical runtime.

## Development Worktree Impact

Add a new P0 lane before final QA.

### Brev Foundation And Launchable

Branch:

`codex/anu-56-brev-foundation-launchable`

Owned files:

- `scripts/brev/setup-clawforge.sh`
- `README.md`
- `artifacts/CLAWFORGE_BREV_BUILD_RESEARCH.md`
- `artifacts/CLAWFORGE_NEMOCLAW_WORKTREE_PLAN.md`
- `.env.example`

Acceptance criteria:

- Brev setup instructions are documented.
- Setup script is safe and secret-free.
- Brev secrets list is documented by name only.
- ClawForge app can run on `0.0.0.0`.
- NemoClaw onboarding path is documented.
- Ports/tunnels are documented.
- Launchable creation checklist exists.
- No implementation starts until the user approves.

## Required Brev Secrets

Create these with Brev secrets or in the Brev console:

- `NVIDIA_API_KEY`
- `NGC_CLI_API_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_PLAN_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only if server-side persistence is added
- `COMPOSIO_API_KEY` only if Composio is used from Brev

Never store literal secret values in Git, Linear, docs, screenshots, or build logs.

## What To Build First On Brev

Do not start with accounts or multiple templates. Start with the judge-visible runtime path:

1. Brev instance boots from repo.
2. ClawForge app starts on `0.0.0.0`.
3. NemoClaw installs/onboards successfully.
4. NemoClaw dashboard is reachable.
5. ClawForge can call the NemoClaw/Nemotron route or a safe mock.
6. Agent run emits live audit logs.
7. Approval denial and memory retrieval work.
8. Final report is generated.
9. Setup is captured as a Launchable.

## Key Risks

| Risk                              | Mitigation                                      |
| --------------------------------- | ----------------------------------------------- |
| GPU capacity unavailable          | Have L40S, A100, and hosted API fallback paths  |
| Local NIM download too slow       | Use routed NVIDIA API first                     |
| NemoClaw install changes          | Pin install steps in setup script once verified |
| Tunnels expose sensitive services | Expose app only; keep inference/gateway private |
| Instance deleted                  | Push code and artifacts to Git frequently       |
| Secrets leak                      | Use Brev secrets and rotate pasted tokens       |

## Definition Of Done For Brev Readiness

ClawForge is Brev-ready when:

- A new Brev instance can start from the repo.
- Setup script completes without manual package hunting.
- Required secrets are documented by name only.
- `npm run build` passes on Brev.
- App is reachable through a Brev tunnel.
- NemoClaw dashboard is reachable on Brev.
- Demo path can be run from the Brev instance.
- Launchable checklist is documented.

## Sources

- NVIDIA Brev developer overview: https://developer.nvidia.com/brev
- NVIDIA Brev instance management and `brev start`: https://docs.nvidia.com/brev/cli/instance-management
- NVIDIA Brev connectivity and port forwarding: https://docs.nvidia.com/brev/cli/connectivity
- NVIDIA Brev GPU instance lifecycle and persistence: https://docs.nvidia.com/brev/concepts/gpu-instances
- NVIDIA Brev Launchables documentation: https://docs.nvidia.com/brev/concepts/launchables
- NVIDIA Brev NIM deployment guide: https://docs.nvidia.com/brev/guides/inference-deployment/deploying-nims
- NVIDIA NemoClaw quickstart and installer: https://docs.nvidia.com/nemoclaw/latest/get-started/quickstart.html
- NVIDIA NemoClaw local inference and NIM routing: https://docs.nvidia.com/nemoclaw/latest/inference/use-local-inference.html
- NVIDIA NemoClaw sandbox network policy guide: https://docs.nvidia.com/nemoclaw/latest/network-policy/customize-network-policy.html
- NVIDIA OpenShell security best practices: https://docs.nvidia.com/openshell/security/best-practices

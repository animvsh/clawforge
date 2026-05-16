# ClawForge Brev Build Research

Research date: May 16, 2026

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

## Recommended Setup Script

Create a setup script later at `scripts/brev/setup-clawforge.sh`.

It should:

1. Install/update Node.js 20+ if needed.
2. Install repo dependencies.
3. Install Brev/NemoClaw prerequisites that are not already present.
4. Install NemoClaw.
5. Verify Docker GPU access with `nvidia-smi`.
6. Create `.env` from Brev secrets.
7. Run `npm run build`.
8. Print next commands for starting ClawForge and NemoClaw.

Draft shape:

```sh
#!/usr/bin/env bash
set -euo pipefail

cd /home/ubuntu/workspace/clawforge
npm ci
npm run build

if ! command -v nemoclaw >/dev/null 2>&1; then
  curl -fsSL https://www.nvidia.com/nemoclaw.sh | bash
fi

docker run --rm --runtime=nvidia --gpus all ubuntu nvidia-smi

cat <<'NEXT'
Next:
  npm run dev -- --host 0.0.0.0
  NEMOCLAW_PROVIDER=routed nemoclaw onboard --non-interactive
NEXT
```

Do not commit real keys. Use Brev secrets.

## NemoClaw On Brev

NemoClaw should run inside the Brev VM and manage an OpenShell sandbox.

Use this as the robust path:

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

## Development Worktree Impact

Add a new P0 lane before final QA.

### Brev Foundation And Launchable

Branch:

`codex/nemoclaw-brev-foundation`

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

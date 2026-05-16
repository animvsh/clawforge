# ClawForge Main Integration Frame

Created: May 16, 2026

## Goal

Keep ClawForge development simple: every contributor works from `main`, builds one owned Linear issue at a time, opens a PR back to `main`, and merges in dependency order.

There is no long-running integration branch.

## Main Branch Rule

Every contributor starts here:

```sh
git checkout main
git pull --ff-only origin main
git switch -c codex/<linear-issue>-<short-name>
```

Every contributor ends here:

```sh
npm run build
git push origin codex/<linear-issue>-<short-name>
```

Then open a PR into `main`.

After merge, everyone pulls `main` again before starting the next issue.

## Four Concurrent Workstreams

### Workstream 1: Product, Safety, And Main Integration

Owner: Animesh

Issues:

- `ANU-36`: Secret hygiene and provider key rotation.
- `ANU-50`: Final QA, deploy, and NemoClaw handoff.

Responsibilities:

- Keep scope locked to ClawForge.
- Keep secret handling safe.
- Own final merge order and release readiness.
- Verify Linear, repo docs, Cloudflare, Brev, and final demo all agree.

Primary files:

- `artifacts/*`
- `README.md`
- deployment and QA notes only when needed

### Workstream 2: UI And Frontend Experience

Owner: Paras (`pmgandhi@ucsc.edu` in Linear)

Issues:

- `ANU-41`: NemoClaw positioning and landing page scrub.
- `ANU-42`: NemoClaw prompt builder and generation states.
- `ANU-43`: NemoClaw blueprint review UI.
- `ANU-48`: Live NemoClaw dashboard.
- `ANU-51`: Editable NemoClaw policy pack.
- `ANU-52`: Multiple NemoClaw agent templates.
- `ANU-53`: Export NemoClaw config.

Responsibilities:

- Make the product feel like ClawForge: a secure NemoClaw agent factory.
- Keep the UI simple and buildspace-inspired where appropriate.
- Remove unrelated workspace framing.
- Use API contracts from `main`; do not rewrite backend runtime files without coordination.

Primary files:

- `src/routes/index.tsx`
- `src/routes/__root.tsx`
- `src/components/clawforge/AgentBuilder.tsx`
- `src/components/clawforge/BlueprintReview.tsx`
- `src/components/clawforge/LiveDashboard.tsx`

### Workstream 3: Backend, Runtime, Providers, And Policy

Owner: Adithya (`adpradee@ucsc.edu` in Linear)

Issues:

- `ANU-37`: Real Nemotron API integration.
- `ANU-38`: Real MiniMax API integration.
- `ANU-39`: Real OpenClaw/Hermes runtime integration.
- `ANU-44`: NemoClaw data contracts and fixtures.
- `ANU-45`: NemoClaw API namespace and compatibility.
- `ANU-46`: NemoClaw policy engine and tool router.
- `ANU-47`: Runtime sequence and memory moment.
- `ANU-55`: Supabase accounts and saved NemoClaw runs.
- `ANU-57`: Capability manifest and policy broker.
- `ANU-58`: Secret-safe provider registry.
- `ANU-59`: NVIDIA Nemotron NIM adapter.
- `ANU-60`: MiniMax Cloud model adapter.
- `ANU-61`: Pi Coding SDK runtime adapter.
- `ANU-62`: Broad tool brokers.
- `ANU-63`: NemoClaw sandbox session adapter.

Responsibilities:

- Own typed contracts, APIs, policy broker, runtime loop, provider adapters, and tool routing.
- Preserve mock mode while adding real provider/runtime support.
- Never expose provider keys in API responses, logs, memory, or config previews.
- Route all broad actions through policy and approval.

Primary files:

- `src/lib/clawforge/types.ts`
- `src/lib/clawforge/fixtures.ts`
- `src/lib/clawforge/api.ts`
- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/providers/*`
- `src/server.ts`

### Workstream 4: Memory, Reports, Brev, Deployment, And Hardening

Owner: Edwin (`gedwinom@ucsc.edu` in Linear)

Issues:

- `ANU-31`: Railway deployment and demo verification.
- `ANU-40`: Durable runtime, memory, and report storage.
- `ANU-49`: NemoClaw approval gate and final report UI.
- `ANU-54`: Visual NemoClaw workflow graph and audit replay.
- `ANU-56`: Brev foundation and Launchable.
- `ANU-64`: Approval center, audit, and forensics.
- `ANU-65`: Sandbox hardening verification.

Responsibilities:

- Make memory and reports durable enough for demo.
- Own Brev setup and Launchable readiness.
- Verify deployment paths.
- Verify sandbox hardening, audit replay, secret redaction, and final safety story.

Primary files:

- `src/lib/clawforge/memory.ts`
- `src/lib/clawforge/reports.ts`
- `src/components/clawforge/IncidentReport.tsx`
- `src/components/clawforge/MemoryTimeline.tsx`
- `scripts/brev/setup-clawforge.sh`
- `README.md`
- `artifacts/CLAWFORGE_BREV_BUILD_RESEARCH.md`

## Merge Order Into Main

1. `ANU-36`: secret hygiene baseline.
2. `ANU-44`: data contracts and fixtures.
3. `ANU-45`, `ANU-46`, `ANU-57`, `ANU-58`: API, policy, and provider interfaces.
4. UI work can merge after contracts are stable: `ANU-41`, `ANU-42`, `ANU-43`.
5. Runtime/provider work: `ANU-47`, `ANU-59`, `ANU-60`, `ANU-61`, `ANU-62`.
6. Sandbox and Brev work: `ANU-56`, `ANU-63`.
7. Dashboard/report/hardening: `ANU-48`, `ANU-49`, `ANU-64`, `ANU-65`.
8. P1 polish: `ANU-51`, `ANU-52`, `ANU-53`, `ANU-54`, `ANU-55`.
9. `ANU-50`: final QA and release handoff.

## Conflict Avoidance Rules

- One Linear issue per branch.
- One PR per Linear issue.
- Do not modify another workstream's primary files without a Linear comment.
- Shared type changes land through `ANU-44`, `ANU-57`, or `ANU-58`.
- UI work should consume contracts, not invent backend shapes.
- Backend work should preserve current UI compatibility.
- Deployment work should not rewrite product UI.
- Every PR must include `npm run build` output.
- Every PR must mention whether it touched secrets, provider config, or deploy config.

## Definition Of Ready

Linear is ready when:

- Every open issue has an assignee.
- Every open issue has a branch/worktree name.
- Every open issue has owned files.
- Every open issue points to `main` as the merge target.
- Dependencies are represented by blocked/blocking links or described in the issue.
- The project comment contains this four-workstream frame.

## Definition Of Done

ClawForge is ready when:

- The full demo path works from `main`.
- Cloudflare public landing remains live.
- Brev runtime demo is verified.
- NemoClaw sandbox behavior is visible.
- Nemotron/MiniMax/Pi paths have mock-safe fallbacks.
- Approval denial, memory retrieval, audit logs, and final report all work.
- No unrelated workspace language remains.
- No secrets are present in Git, Linear, docs, screenshots, or logs.

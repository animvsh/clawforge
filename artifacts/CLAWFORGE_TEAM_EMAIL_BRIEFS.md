# ClawForge Team Email Briefs

Prepared: May 16, 2026

These are the four individualized onboarding emails for the ClawForge team. They align with the current main integration frame: everyone works from latest `main`, one Linear issue per branch, one PR per issue, and every PR merges back into `main`.

Shared links:

- Repo: https://github.com/animvsh/clawforge
- Live demo: https://clawforge.aalang.workers.dev/
- Linear project: https://linear.app/askdad/project/clawforge-c618a255248b
- Main frame: https://linear.app/askdad/document/clawforge-main-integration-frame-52fea6e4782e
- Canonical PRD Google Doc: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

## Email 1: Animesh

To: aalang@ucsc.edu

Subject: ClawForge: product, safety, and final integration lane

Hey Animesh,

You are assigned to the ClawForge product, safety, and final integration lane.

ClawForge is the secure agent factory for NemoClaw: prompt -> NemoClaw blueprint -> sandboxed agent -> policy enforcement -> memory -> final report. The important framing is that this is not Lantern, not a Slack-like workspace, and not a generic AI workspace. It is the fastest way to create, sandbox, run, and control NemoClaw agents.

Your Linear issues:

- ANU-36: Secret hygiene and provider key rotation.
- ANU-50: Final QA, deploy, and NemoClaw handoff.

Your focus:

- Keep scope locked to ClawForge and NemoClaw-first language.
- Remove or block any Lantern/workspace/AI-employee wording that reappears.
- Own secret hygiene across Git, Linear, docs, deploy logs, screenshots, and local artifacts.
- Coordinate final merge order into `main`.
- Run the final demo acceptance pass after UI, backend, Brev, sandbox, memory, and report work lands.

Start every issue from latest main:

```sh
git checkout main
git pull --ff-only origin main
git switch -c codex/<linear-issue>-<short-name>
```

Before opening a PR:

```sh
npm run build
git push origin codex/<linear-issue>-<short-name>
```

Merge timing:

- Land ANU-36 first as the safety baseline.
- Land ANU-50 last after Brev, sandbox hardening, UI, backend, memory, approval, and report lanes are merged.

Shared links:

- Repo: https://github.com/animvsh/clawforge
- Linear project: https://linear.app/askdad/project/clawforge-c618a255248b
- Main frame: https://linear.app/askdad/document/clawforge-main-integration-frame-52fea6e4782e
- PRD: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

## Email 2: Paras

To: pmgandhi@ucsc.edu

Subject: ClawForge: UI and frontend experience lane

Hey Paras,

You are assigned to the ClawForge UI and frontend experience lane.

ClawForge should feel like a simple, buildspace-inspired secure agent factory for NemoClaw. The landing page and product flow should be clean and uncluttered: a user describes a NemoClaw agent, sees the generated sandbox/policy blueprint, deploys it, and watches live policy enforcement, approvals, memory, and the final report.

Your Linear issues:

- ANU-41: NemoClaw positioning and landing page scrub.
- ANU-42: NemoClaw prompt builder and generation states.
- ANU-43: NemoClaw blueprint review UI.
- ANU-48: Live NemoClaw dashboard.
- ANU-51: Editable NemoClaw policy pack.
- ANU-52: Multiple NemoClaw agent templates.
- ANU-53: Export NemoClaw config.

Your focus:

- Make the product visually simpler and closer to the buildspace reference: bold, sparse, clear, and direct.
- Keep the copy NemoClaw-first: "Build NemoClaw agents that are safe enough to run."
- Remove workspace, Lantern, Slack-like, and AI-employee language.
- Own landing, builder, blueprint review, dashboard, policy editor UI, templates, and export UI.
- Consume shared API/type contracts from `main`; do not rewrite backend runtime/API files unless coordinated in Linear.

Suggested order:

1. ANU-41 landing positioning.
2. ANU-42 prompt builder.
3. ANU-43 blueprint review.
4. ANU-48 dashboard once event contracts settle.
5. ANU-51, ANU-52, and ANU-53 after the P0 path works.

Start every issue from latest main:

```sh
git checkout main
git pull --ff-only origin main
git switch -c codex/<linear-issue>-<short-name>
```

Before opening a PR:

```sh
npm run build
git push origin codex/<linear-issue>-<short-name>
```

Shared links:

- Repo: https://github.com/animvsh/clawforge
- Live demo: https://clawforge.aalang.workers.dev/
- Linear project: https://linear.app/askdad/project/clawforge-c618a255248b
- Main frame: https://linear.app/askdad/document/clawforge-main-integration-frame-52fea6e4782e
- PRD: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

## Email 3: Adithya

To: adithyaapradeep@gmail.com

Subject: ClawForge: backend, runtime, providers, and policy lane

Hey Adithya,

You are assigned to the ClawForge backend, runtime, providers, and policy lane. In Linear, the current assignee identity is `adpradee@ucsc.edu`.

ClawForge is a NemoClaw-first agent factory. Your lane makes the product functional underneath the UI: typed contracts, API namespace, runtime loop, policy broker, provider adapters, tool routing, and sandbox sessions.

Your Linear issues:

- ANU-37: Real Nemotron API integration.
- ANU-38: Real MiniMax API integration.
- ANU-39: Real OpenClaw/Hermes runtime integration.
- ANU-44: NemoClaw data contracts and fixtures.
- ANU-45: NemoClaw API namespace and compatibility.
- ANU-46: NemoClaw policy engine and tool router.
- ANU-47: Runtime sequence and memory moment.
- ANU-55: Supabase accounts and saved NemoClaw runs.
- ANU-57: Capability manifest and policy broker.
- ANU-58: Secret-safe provider registry.
- ANU-59: NVIDIA Nemotron NIM adapter.
- ANU-60: MiniMax Cloud model adapter.
- ANU-61: Pi Coding SDK runtime adapter.
- ANU-62: Broad tool brokers.
- ANU-63: NemoClaw sandbox session adapter.

Your focus:

- Preserve deterministic mock mode while adding real provider/runtime paths.
- Route every meaningful tool action through `ActionEnvelope -> policy -> allow / approval / deny -> audit`.
- Keep provider secrets out of API responses, logs, memory, config previews, screenshots, and Linear.
- Make Nemotron the primary reasoning path, MiniMax Cloud compatible as a fallback/alternate intelligence provider, and Pi Coding SDK compatible for the chat/runtime coding path.
- Keep the backend stable for frontend workstreams by landing shared contracts early.

Suggested order:

1. ANU-44 data contracts and fixtures.
2. ANU-45 API namespace and ANU-46 policy router.
3. ANU-57 ActionEnvelope/policy broker and ANU-58 provider registry.
4. ANU-47 runtime sequence and memory moment.
5. ANU-59, ANU-60, and ANU-61 provider/runtime adapters.
6. ANU-62 broad tool brokers.
7. ANU-63 NemoClaw sandbox session adapter.
8. ANU-55 Supabase accounts only after the core demo path is stable.

Start every issue from latest main:

```sh
git checkout main
git pull --ff-only origin main
git switch -c codex/<linear-issue>-<short-name>
```

Before opening a PR:

```sh
npm run build
git push origin codex/<linear-issue>-<short-name>
```

Shared links:

- Repo: https://github.com/animvsh/clawforge
- Linear project: https://linear.app/askdad/project/clawforge-c618a255248b
- Main frame: https://linear.app/askdad/document/clawforge-main-integration-frame-52fea6e4782e
- PRD: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

## Email 4: Edwin

To: edwin.giwin@gmail.com

Subject: ClawForge: memory, reports, Brev, deployment, and QA lane

Hey Edwin,

You are assigned to the ClawForge memory, reports, Brev, deployment, and QA lane. In Linear, the current assignee identity is `gedwinom@ucsc.edu`.

ClawForge needs to prove that a NemoClaw agent can run safely, pause risky actions, remember human decisions, and produce a useful final report. Your lane makes that proof reliable and demo-ready.

Your Linear issues:

- ANU-31: Railway deployment and demo verification.
- ANU-40: Durable runtime, memory, and report storage.
- ANU-49: NemoClaw approval gate and final report UI.
- ANU-54: Visual NemoClaw workflow graph and audit replay.
- ANU-56: Brev foundation and Launchable.
- ANU-64: Approval center, audit, and forensics.
- ANU-65: Sandbox hardening verification.

Your focus:

- Make memory/report/deployment/safety proof visible and reliable.
- Own Brev setup and Launchable readiness.
- Make approval denial save to memory and affect the later suspicious-IP behavior.
- Make final reports durable enough for demo and clear enough for judges.
- Verify audit replay, secret redaction, sandbox hardening, and deployment behavior.
- Keep secrets out of deploy logs, docs, screenshots, artifacts, and Linear.

Suggested order:

1. ANU-56 Brev foundation and Launchable.
2. ANU-49 approval gate and report UI after dashboard/runtime events settle.
3. ANU-40 durable storage.
4. ANU-64 approval/audit/forensics.
5. ANU-65 sandbox hardening verification.
6. ANU-31 Railway alternate deploy only if still needed.
7. ANU-54 graph/replay after P0 dashboard works.

Start every issue from latest main:

```sh
git checkout main
git pull --ff-only origin main
git switch -c codex/<linear-issue>-<short-name>
```

Before opening a PR:

```sh
npm run build
git push origin codex/<linear-issue>-<short-name>
```

Shared links:

- Repo: https://github.com/animvsh/clawforge
- Live demo: https://clawforge.aalang.workers.dev/
- Linear project: https://linear.app/askdad/project/clawforge-c618a255248b
- Main frame: https://linear.app/askdad/document/clawforge-main-integration-frame-52fea6e4782e
- PRD: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

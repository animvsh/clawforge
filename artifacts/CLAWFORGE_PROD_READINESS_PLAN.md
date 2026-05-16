# ClawForge Production Readiness Plan

Last updated: 2026-05-16

## Current Status

ClawForge is now a strong local and Railway-ready MVP for the core product story:

- Prompt-first landing page.
- Dashboard project hub.
- Lovable-style workspace with chat on the left.
- n8n-style React Flow canvas on the right.
- Blueprint generation, model switching, policy/tool/memory panels, deploy controls, and instance chat preview.
- Deterministic NemoClaw demo runtime with policy pause, approval decision, memory update, and final report paths.
- Railway-compatible server and health route.

It is not fully production-ready yet because the live external runtime layer is still partly gated by credentials and provider setup.

## Verification Completed

- `npm run build` passes.
- Targeted runtime/provider/policy tests pass: 3 files, 84 tests.
- API test passes: 1 file, 29 tests.
- Local production server is running on `http://127.0.0.1:4190`.
- Browser QA passed on `/workspace/project-mp8snaqv`.
- Browser console has zero errors on the workspace.
- n8n-style workflow canvas renders with readable nodes, handles, zoom, minimap, and fixed chat input.
- `GET /api/health` returns OK locally.
- `GET /api/clawforge/brev/status` returns installed CLI but not authenticated.
- `POST /api/clawforge/pipedream/status` returns configured false with clear missing-secret messaging.

## Readiness Estimate

Current product readiness: 65%.

Demo readiness: 80%.

Production readiness: 45%.

The remaining gap is mostly real external execution:

- Fresh Brev auth and actual Brev instance bootstrap.
- Live NemoClaw/OpenHands sandbox lifecycle instead of simulated/prepared mode.
- Real mem0 service per deployed instance.
- Real Pipedream/Composio tool connections.
- Durable Supabase-backed workspace/project persistence.
- End-to-end production acceptance suite across auth, deploy, chat, memory, integrations, and reports.

## P0 Workstreams

### 1. UI And Workspace Experience

Owner: Paras

Linear: ANU-67, ANU-73

Goal: make the workspace polished enough for nontechnical users.

Scope:

- Keep the buildspace-like visual system.
- Keep chat fixed at the bottom of the left rail.
- Keep model selector embedded inside the input.
- Make the canvas readable on desktop and mobile.
- Add friendly language for deploy, tools, connections, memory, and safety checks.
- Make clarification questions interactive and concise.
- Add visual tabs for Workflow, Logs, Agent, Tools, Connections, Memory, and Chat Link.

Done when:

- A nontechnical user can create a new agent without understanding NemoClaw internals.
- Mobile workspace remains usable.
- Browser QA screenshots pass for landing, dashboard, workspace, approval, and instance chat.

### 2. Real Brev Deploy Path

Owner: Edwin

Linear: ANU-68

Goal: Deploy button creates or attaches to a live Brev-hosted NemoClaw instance.

Scope:

- Refresh Brev auth outside source control.
- Confirm Railway can authenticate Brev at runtime.
- Bootstrap the existing Brev GPU instance from `main`.
- Run `scripts/brev/setup-clawforge.sh` remotely.
- Expose the ClawForge/NemoClaw chat service through a Brev secure link.
- Store the live instance metadata in the ClawForge instance record.
- Show real Brev status in the workspace and instance chat.

Done when:

- Deploy creates or starts a Brev workspace.
- UI receives a real Brev URL.
- `/instance/:id` talks to the live remote runtime instead of preview mode.

### 3. NemoClaw Sandbox Runtime

Owner: Adithya

Linear: ANU-69, ANU-75

Goal: replace the prepared/simulated sandbox path with a real NemoClaw session adapter.

Scope:

- Create sandbox session lifecycle: create, start, inspect, pause, stop.
- Route each tool action through policy checks.
- Enforce allow, approval_required, and deny effects.
- Block shell/data export/policy modification/audit disabling in the runtime, not only the UI.
- Stream runtime events back through SSE.
- Persist audit events and approval decisions.

Done when:

- Incident response demo runs through the real sandbox adapter.
- The shell action pauses before execution.
- Denial prevents execution and continues report-only.
- Runtime can prove no restricted action ran without approval.

### 4. Model And Chat Runtime

Owner: Animesh

Linear: ANU-70

Goal: chat and agent reasoning use the selected model reliably.

Scope:

- Make the chat endpoint route to Nemotron, MiniMax, Pi, or mock based on user selection.
- Add health checks for each provider.
- Add a quality harness for common chat commands: build, edit, show tools, show policies, deploy, run, approve, deny.
- Keep fallback behavior explicit and visible.
- Add provider telemetry without logging secrets.

Done when:

- Model selector changes actual server-side provider behavior.
- Nemotron works with a valid NVIDIA key.
- MiniMax works as fallback.
- Pi-compatible mode is server-only and does not break the browser bundle.

### 5. Integrations And Tool Access

Owner: Animesh

Linear: ANU-71

Goal: agents infer required tools and guide users to connect them.

Scope:

- Normalize integration requirements for Gmail, Calendar, Docs, Sheets, Drive, GitHub, Slack, Linear, phone, voice, and agent email.
- Configure Pipedream project/token secrets.
- Configure Composio API key/auth configs where required.
- Generate user-facing connection links from the chat and Connections tab.
- Attach connected tool permissions to the Brev/NemoClaw manifest.
- Never call integrations until the user explicitly connects and approves.

Done when:

- A phone receptionist prompt asks for phone/calendar/email access.
- A docs/sheets prompt asks for Docs/Sheets/Drive access.
- Missing connections appear as friendly setup cards inside chat.

### 6. Memory And Workspace Isolation

Owner: Edwin

Linear: ANU-72

Goal: every NemoClaw instance has scoped mem0 memory.

Scope:

- Run mem0 on Brev or configure a hosted mem0-compatible service.
- Create one memory namespace per workspace/project/instance.
- Save approval decisions, preferences, incident facts, and tool results.
- Retrieve memory before risky actions.
- Add cross-workspace isolation tests.
- Show memory timeline in workspace and instance chat.

Done when:

- Denying shell execution creates a memory item.
- A later action retrieves that memory and changes behavior.
- Another workspace cannot read that memory.

### 7. Supabase Auth And Durable Persistence

Owner: Paras

Linear: ANU-73

Goal: move from local/demo persistence to real accounts and saved workspaces.

Scope:

- Keep demo login fallback for hackathon safety.
- Fix email rate-limit UX by offering magic-link retry, demo mode, and existing-account path.
- Store users, workspaces, projects, blueprints, instances, integrations, memory references, and audit logs in Supabase.
- Add workspace dashboard with all projects and deployed instances.
- Add row-level security for workspace isolation.

Done when:

- User can sign in, create projects, refresh, and still see their work.
- Workspace data is isolated by user/workspace.
- Dashboard is the main signed-in home.

### 8. Production QA And Release

Owner: Edwin

Linear: ANU-74

Goal: produce a repeatable acceptance suite and release checklist.

Scope:

- Add Playwright or browser-driven tests for landing, auth, dashboard, new agent, workspace, deploy, instance chat, approval, memory, and report.
- Add API smoke tests for health, blueprint, deploy, SSE, approval, memory, Brev, Pipedream, and provider status.
- Verify Railway deployment after each main push.
- Verify Brev secure link after deploy.
- Document known missing secrets and blocked external providers.

Done when:

- One command can run the acceptance suite locally.
- Production URL and Brev URL both pass smoke tests.
- Release notes list exact commit, deployment URL, and remaining provider configuration.

## Immediate Next Steps

1. Refresh Brev auth and rerun Brev deploy from the workspace.
2. Configure Pipedream and Composio secrets in Railway and Brev.
3. Wire live mem0 and verify scoped add/search/delete.
4. Finish real NemoClaw sandbox session adapter.
5. Convert current localStorage/demo project store to Supabase-backed persistence.
6. Add end-to-end tests for the full text-to-NemoClaw-instance flow.

## New Linear Task Set

All new tasks are in the `huelai` team, `ClawForge` project, and `Todo` status.

| Issue  | Owner   | Focus                                                   |
| ------ | ------- | ------------------------------------------------------- |
| ANU-67 | Paras   | Workspace UI polish and nontechnical builder flow       |
| ANU-68 | Edwin   | Real Brev deploy path from Deploy button                |
| ANU-69 | Adithya | Live NemoClaw sandbox session adapter                   |
| ANU-70 | Animesh | Model-routed chat runtime for Nemotron, MiniMax, and Pi |
| ANU-71 | Animesh | Integration connection flow and tool access manifests   |
| ANU-72 | Edwin   | Scoped mem0 memory per NemoClaw instance                |
| ANU-73 | Paras   | Supabase auth and durable workspace persistence         |
| ANU-74 | Edwin   | Production acceptance suite and release gate            |
| ANU-75 | Adithya | Convert n8n canvas into live runtime state view         |
| ANU-76 | Animesh | Prod readiness command center and status document       |

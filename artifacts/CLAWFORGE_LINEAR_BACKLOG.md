# ClawForge Linear Backlog

Development-ready backlog derived from `artifacts/CLAWFORGE_PRD.md`.

Canonical PRD Google Doc: https://docs.google.com/document/d/1b1yJaS8inIQ4lXasAiC3EyjLS06qRUyT9190gyzt5uc/edit

Composio handoff: Google Docs and Gmail were connected through Composio MCP, and the PRD link was sent to `aalang@ucsc.edu`.

## Current Implementation Status

As of May 16, 2026, the MVP is live as a deterministic, in-memory demo on Cloudflare Workers:

- Product shell, simplified landing flow, prompt builder, provider selector, and template chips are implemented.
- Blueprint generation returns a complete SentinelClaw blueprint with 7 tools, 6 policies, workflow steps, memory schema, and secret-safe config preview.
- Blueprint review shows agent summary, tool cards, workflow, policies, memory schema, config preview, and deployment status.
- Backend API foundation is implemented for blueprint, deploy, start, stop, SSE logs, memory, report, and approval decision.
- Runtime executes a session-scoped workflow: allowed log read, blocked data export, allowed report draft, shell approval request, approval resolution, memory update, final report, and completion event.
- Final report is gated until workflow completion.
- MiniMax/Nemotron provider modes are exposed as secret-safe selectable modes; real live provider calls remain a P1 hardening task.
- Durable storage, real OpenClaw/NemoClaw SDK integration, real external ticket/alert execution, and Railway deployment are production-hardening workstreams.

Recommended Linear state split:

- Mark MVP implementation issues as `Done` after verification: ANU-21 through ANU-30.
- Keep alternate deployment/demo polish issues in `Todo` unless the team wants Railway specifically: ANU-31, ANU-32.
- Create or keep P1 hardening issues for real provider APIs, durable persistence, and real sandbox/tool integrations.

## Recommended Linear Labels

- `product`
- `frontend`
- `backend`
- `runtime`
- `policy`
- `sse`
- `memory`
- `provider`
- `security`
- `deployment`
- `demo`
- `p0`
- `p1`
- `p2`

## Milestone 1: PRD And Product Shell

Goal: Establish the ClawForge product surface, navigation, and demo entry points.

### Epic 1.1: Product Shell And Navigation

Description: Turn the existing landing experience into the ClawForge shell that explains the product promise and routes users into the builder or demo agent.

Priority: P0

Recommended labels: `product`, `frontend`, `demo`, `p0`

Dependencies: Final PRD copy, existing app routing.

#### Issue 1.1.1: Replace Landing Page Copy With ClawForge Positioning

Description: Replace generic AI employee copy with ClawForge-specific messaging, including the one-prompt secure autonomous agent builder positioning.

Acceptance criteria:

- Hero headline says "Build secure autonomous agents from one prompt."
- Subtitle explains OpenClaw/NemoClaw agents powered by NVIDIA Nemotron, policies, memory, deployment, and live audit logs.
- Page includes sections for OpenClaw, NemoClaw, Nemotron, MiniMax, policies, memory, and live logs.
- No unsupported social proof or unverifiable customer claims are introduced.

Priority: P0

Dependencies: None.

Recommended labels: `frontend`, `product`, `p0`

#### Issue 1.1.2: Add Builder And Demo Navigation

Description: Add navigation anchors and CTAs for Builder, Demo Agent, Policies, and Dashboard.

Acceptance criteria:

- Primary CTA "Build an Agent" opens or scrolls to the builder surface.
- Secondary CTA "View Demo Agent" starts or opens the prebuilt SentinelClaw flow.
- Navigation includes Builder, Demo Agent, Policies, and Dashboard anchors.
- CTA behavior works on desktop and mobile.

Priority: P0

Dependencies: Issue 1.1.1.

Recommended labels: `frontend`, `product`, `demo`, `p0`

#### Issue 1.1.3: Add Landing Demo Preview Components

Description: Add a visual preview of the generated SentinelClaw agent with policy, memory, tool, and live log signals.

Acceptance criteria:

- Landing page shows a generated agent card for SentinelClaw.
- Preview includes tool icons or badges.
- Preview includes a policy shield state.
- Preview includes a memory signal.
- Preview includes a live log preview.
- User can understand the product promise in under 10 seconds.

Priority: P1

Dependencies: Issue 1.1.1.

Recommended labels: `frontend`, `product`, `demo`, `p1`

## Milestone 2: Prompt-To-Blueprint

Goal: Let a user enter a natural-language prompt, stream blueprint generation, review the generated agent, and deploy it.

### Epic 2.1: Blueprint Builder UI

Description: Build the prompt-to-blueprint user experience, including provider selection, generation states, streaming checklist, and generated blueprint display.

Priority: P0

Recommended labels: `frontend`, `product`, `provider`, `p0`

Dependencies: Milestone 1 shell and navigation.

#### Issue 2.1.1: Build Prompt Input And Template Selector

Description: Create the main builder input where users describe a workflow and choose or click example templates.

Acceptance criteria:

- User can enter a plain-English agent request.
- Example prompt chips are available for security incident response, GitHub triage, inbox assistant, and research agent.
- Cybersecurity prompt maps to the SentinelClaw template.
- Empty state clearly invites the user to create an agent.

Priority: P0

Dependencies: Issue 1.1.2.

Recommended labels: `frontend`, `product`, `p0`

#### Issue 2.1.2: Add Provider Selector

Description: Add provider selection for Auto, Nemotron, MiniMax, and Mock.

Acceptance criteria:

- Builder includes provider modes `auto`, `nemotron`, `minimax`, and `mock`.
- Selected provider is reflected in generated blueprint output.
- Mock mode is selectable for demo-safe local operation.
- UI does not ask users to enter raw secrets.

Priority: P0

Dependencies: Issue 2.1.1.

Recommended labels: `frontend`, `provider`, `security`, `p0`

#### Issue 2.1.3: Implement Streaming Generation Checklist

Description: Show blueprint generation progress as a streamed or timed checklist in the UI.

Acceptance criteria:

- Checklist includes understanding workflow, selecting template, choosing tools, creating memory schema, writing NemoClaw policies, preparing OpenClaw config, and blueprint ready.
- Steps animate in order.
- User sees generated blueprint without a page reload.
- Error and retry states are available.

Priority: P0

Dependencies: Issue 2.1.1.

Recommended labels: `frontend`, `sse`, `product`, `p0`

### Epic 2.2: Blueprint Generator Backend

Description: Generate structured OpenClaw/Hermes-compatible blueprints from prompts.

Priority: P0

Recommended labels: `backend`, `runtime`, `provider`, `p0`

Dependencies: API foundation.

#### Issue 2.2.1: Implement `POST /api/blueprints`

Description: Create the API route that accepts a prompt and provider mode, then returns a structured blueprint.

Acceptance criteria:

- Endpoint accepts `prompt` and `provider`.
- Response includes `blueprint_id`, `agent_name`, model, fallback provider, tools, policies, memory schema, and workflow steps.
- Cybersecurity prompt returns SentinelClaw defaults.
- Response is typed JSON.
- Error responses are structured.
- No secrets are returned.

Priority: P0

Dependencies: None.

Recommended labels: `backend`, `provider`, `security`, `p0`

#### Issue 2.2.2: Generate SentinelClaw Tool, Memory, Policy, And Workflow Defaults

Description: Create deterministic blueprint generation for the primary cybersecurity incident response demo.

Acceptance criteria:

- Blueprint includes SentinelClaw identity and goal.
- Tools include Log Reader, Threat Classifier, Report Writer, Ticket Creator, Shell Executor, External Alert Sender, and Data Export.
- Memory schema includes previous incidents, known safe IPs, blocked actions, user approval preferences, and past remediation recommendations.
- Policies include allow, deny, and require approval effects.
- Workflow includes at least five runtime steps.

Priority: P0

Dependencies: Issue 2.2.1.

Recommended labels: `backend`, `runtime`, `policy`, `memory`, `p0`

#### Issue 2.2.3: Render Generated Config Preview

Description: Convert the generated blueprint into readable YAML or JSON for review.

Acceptance criteria:

- Blueprint review shows generated OpenClaw/Hermes-style config.
- Preview includes model, runtime, sandbox, tools, policies, memory, workflow, and deployment target.
- Generated config uses environment variable names for secrets, never literal values.
- Config preview is readable and copyable.

Priority: P1

Dependencies: Issue 2.2.1.

Recommended labels: `frontend`, `backend`, `security`, `p1`

### Epic 2.3: Blueprint Review UI

Description: Make the generated agent understandable and deployable.

Priority: P0

Recommended labels: `frontend`, `product`, `runtime`, `policy`, `p0`

Dependencies: Epic 2.1, Epic 2.2.

#### Issue 2.3.1: Build Blueprint Review Screen

Description: Display the generated blueprint in a structured review screen before deployment.

Acceptance criteria:

- Review includes agent summary, model/runtime/sandbox strip, tool cards, workflow timeline, memory schema, policy table, and generated config preview.
- Risky tools are visibly marked.
- NemoClaw policies are prominent.
- User can deploy from the screen.

Priority: P0

Dependencies: Issue 2.2.1, Issue 2.2.2.

Recommended labels: `frontend`, `product`, `policy`, `p0`

#### Issue 2.3.2: Add Deploy Secure Agent CTA

Description: Add the deployment call to action and transition from blueprint review into deployment progress.

Acceptance criteria:

- CTA is labeled "Deploy Secure Agent".
- Clicking the CTA calls the deploy API with the selected blueprint ID.
- UI transitions to deployment progress after a successful deploy response.
- Failed deployment shows a recoverable error state.

Priority: P0

Dependencies: Issue 2.3.1, Issue 3.1.1.

Recommended labels: `frontend`, `backend`, `runtime`, `p0`

## Milestone 3: Runtime And Policies

Goal: Create backend APIs, provider abstraction, agent runtime, tool router, and NemoClaw-style policy enforcement.

### Epic 3.1: Backend API Foundation

Description: Create typed API routes for deployment, runtime control, logs, memory, approvals, and final reports.

Priority: P0

Recommended labels: `backend`, `runtime`, `sse`, `security`, `p0`

Dependencies: Blueprint generator API.

#### Issue 3.1.1: Implement Agent Deployment API

Description: Add `POST /api/agents/deploy` to create an agent from a blueprint.

Acceptance criteria:

- Endpoint accepts `blueprint_id`.
- Response includes `agent_id` and deployment status.
- Deployment initializes agent, blueprint, policy, memory, logs, approvals, and report records.
- Structured errors are returned for missing or unknown blueprint IDs.
- No secrets are returned.

Priority: P0

Dependencies: Issue 2.2.1.

Recommended labels: `backend`, `runtime`, `security`, `p0`

#### Issue 3.1.2: Implement Agent Control APIs

Description: Add `POST /api/agents/{agent_id}/start` and `POST /api/agents/{agent_id}/stop`.

Acceptance criteria:

- Start transitions deployed agents into running state.
- Stop transitions running or waiting agents into stopped state.
- Invalid lifecycle transitions return structured errors.
- Stop prevents additional runtime steps from executing.
- Responses include current agent status.

Priority: P0

Dependencies: Issue 3.1.1.

Recommended labels: `backend`, `runtime`, `p0`

#### Issue 3.1.3: Implement Memory And Report Read APIs

Description: Add `GET /api/agents/{agent_id}/memory` and `GET /api/agents/{agent_id}/report`.

Acceptance criteria:

- Memory endpoint returns visible agent memory items.
- Report endpoint returns the final report when available.
- Report endpoint handles incomplete workflows with a clear pending state.
- Responses are typed JSON.
- No secrets are returned.

Priority: P1

Dependencies: Issue 3.1.1.

Recommended labels: `backend`, `memory`, `p1`

#### Issue 3.1.4: Implement Approval Decision API

Description: Add `POST /api/approvals/{approval_id}/decision` to approve, deny, or modify pending actions.

Acceptance criteria:

- Endpoint accepts approval decisions.
- Supported decisions include approve, deny, and modified action.
- Decision is logged.
- Decision is stored in memory.
- Agent can continue after a decision.

Priority: P0

Dependencies: Issue 3.1.1, Issue 3.3.3.

Recommended labels: `backend`, `policy`, `memory`, `p0`

### Epic 3.2: Intelligence Provider Layer

Description: Support Nemotron, MiniMax, Auto, and Mock modes through a secret-safe provider abstraction.

Priority: P0

Recommended labels: `backend`, `provider`, `security`, `p0`

Dependencies: Blueprint generator.

#### Issue 3.2.1: Define Reasoning Provider Interface

Description: Add a shared provider interface for planning, classification, and summarization.

Acceptance criteria:

- Interface supports provider IDs `nemotron`, `minimax`, and `mock`.
- Interface includes `plan`, `classify`, and `summarize` methods.
- Runtime can call providers through the interface only.
- Provider input and output types are explicit.

Priority: P0

Dependencies: None.

Recommended labels: `backend`, `provider`, `p0`

#### Issue 3.2.2: Implement Mock Provider

Description: Add deterministic mock reasoning for demo-safe operation with no secrets.

Acceptance criteria:

- Mock provider works without credentials.
- Mock provider can produce deterministic SentinelClaw plans, classifications, and summaries.
- Runtime can complete the primary demo using mock mode.
- Mock provider output is stable for tests and demos.

Priority: P0

Dependencies: Issue 3.2.1.

Recommended labels: `backend`, `provider`, `demo`, `p0`

#### Issue 3.2.3: Implement Nemotron Provider Adapter

Description: Add a Nemotron adapter that reads configuration from environment variables.

Acceptance criteria:

- Adapter reads `NVIDIA_API_KEY` and `NVIDIA_NEMOTRON_MODEL` from environment variables.
- Adapter never logs or returns credential values.
- Missing credentials produce a structured provider error.
- Provider errors are sanitized before reaching UI logs.

Priority: P1

Dependencies: Issue 3.2.1.

Recommended labels: `backend`, `provider`, `security`, `p1`

#### Issue 3.2.4: Implement MiniMax Provider Adapter

Description: Add a MiniMax adapter that reads configuration from environment variables.

Acceptance criteria:

- Adapter reads `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, and `MINIMAX_MODEL` from environment variables.
- Adapter never logs or returns credential values.
- Missing credentials produce a structured provider error.
- Provider errors are sanitized before reaching UI logs.

Priority: P1

Dependencies: Issue 3.2.1.

Recommended labels: `backend`, `provider`, `security`, `p1`

#### Issue 3.2.5: Add Auto Provider Fallback

Description: Implement provider selection and fallback from Nemotron to MiniMax to Mock.

Acceptance criteria:

- `AGENT_PROVIDER=auto` prefers Nemotron when `NVIDIA_API_KEY` is configured.
- Auto mode falls back to MiniMax when MiniMax credentials are configured.
- Auto mode falls back to Mock when no external provider is available.
- Fallback decisions are logged without exposing secret values.

Priority: P0

Dependencies: Issue 3.2.2, Issue 3.2.3, Issue 3.2.4.

Recommended labels: `backend`, `provider`, `security`, `demo`, `p0`

### Epic 3.3: Agent Runtime And Tool Router

Description: Build the SentinelClaw autonomous workflow, lifecycle state machine, and tool execution router.

Priority: P0

Recommended labels: `backend`, `runtime`, `policy`, `demo`, `p0`

Dependencies: Provider layer, policy engine.

#### Issue 3.3.1: Implement Runtime Lifecycle State Machine

Description: Create lifecycle transitions for Created, Deployed, Running, Waiting for Approval, Completed, Stopped, and Error.

Acceptance criteria:

- Runtime follows Created -> Deployed -> Running -> Waiting for Approval -> Running -> Completed for the primary demo.
- Runtime can enter Stopped from running or waiting states.
- Runtime can enter Error with structured error details.
- Lifecycle transitions emit log events.

Priority: P0

Dependencies: Issue 3.1.1, Issue 3.1.2.

Recommended labels: `backend`, `runtime`, `p0`

#### Issue 3.3.2: Implement MVP Tool Router And Tools

Description: Add deterministic tools for the SentinelClaw demo and route all calls through policy checks.

Acceptance criteria:

- Tools include Log Reader, Threat Classifier, Report Writer, Ticket Creator, Shell Executor, External Alert Sender, and Data Export.
- Log Reader reads sample auth logs.
- Threat Classifier maps suspicious behavior to severity and MITRE ATT&CK categories.
- Report Writer creates report content.
- Ticket Creator, Shell Executor, and External Alert Sender are mock tools.
- Data Export is available as a blocked tool.
- Every tool call goes through the policy engine before execution.

Priority: P0

Dependencies: Issue 3.3.1, Issue 3.4.1.

Recommended labels: `backend`, `runtime`, `policy`, `demo`, `p0`

#### Issue 3.3.3: Implement Approval Pause And Resume

Description: Pause runtime execution when a tool call requires human approval, then continue after the decision.

Acceptance criteria:

- Shell command attempt creates an approval request.
- Agent status changes to Waiting for Approval.
- Runtime pauses until approval API receives a decision.
- Denial is logged and stored in memory.
- Agent continues with report-only workflow after denial.

Priority: P0

Dependencies: Issue 3.3.1, Issue 3.4.3, Issue 3.1.4.

Recommended labels: `backend`, `runtime`, `policy`, `memory`, `p0`

### Epic 3.4: NemoClaw Policy Engine

Description: Generate and enforce allow, deny, and approval-required outcomes.

Priority: P0

Recommended labels: `backend`, `policy`, `security`, `p0`

Dependencies: Blueprint generator.

#### Issue 3.4.1: Define Policy Schema

Description: Create the policy schema used by blueprints, runtime checks, and UI display.

Acceptance criteria:

- Schema includes policy ID, name, action, effect, reason, and risk metadata.
- Effects include allow, deny, and require approval.
- Schema can represent shell approval, external message approval, raw data export denial, and log read allow rules.
- Schema is serializable in generated config preview.

Priority: P0

Dependencies: Issue 2.2.2.

Recommended labels: `backend`, `policy`, `security`, `p0`

#### Issue 3.4.2: Implement Policy Checker

Description: Evaluate tool actions against generated policy rules before execution.

Acceptance criteria:

- Log reading is allowed.
- Report writing is allowed.
- Shell execution requires approval.
- External alert sending requires approval.
- Raw log export is denied.
- Unknown high-risk actions default to denial or approval-required behavior.

Priority: P0

Dependencies: Issue 3.4.1.

Recommended labels: `backend`, `policy`, `security`, `p0`

#### Issue 3.4.3: Emit Policy Log Events

Description: Emit audit events for allowed, blocked, and approval-required policy checks.

Acceptance criteria:

- Allowed actions emit `policy.checked`.
- Denied actions emit `policy.blocked`.
- Approval-required actions emit `approval.requested`.
- Events include action, tool, policy, effect, and sanitized metadata.
- Logs never include secret values.

Priority: P0

Dependencies: Issue 3.4.2.

Recommended labels: `backend`, `policy`, `sse`, `security`, `p0`

## Milestone 4: Live Dashboard

Goal: Prove autonomy, policy enforcement, memory, and approval decisions visually with live SSE logs.

### Epic 4.1: Live Audit Log Streaming

Description: Stream runtime audit logs to the UI and make every step inspectable.

Priority: P0

Recommended labels: `backend`, `frontend`, `sse`, `runtime`, `p0`

Dependencies: Runtime and log event store.

#### Issue 4.1.1: Implement SSE Log Stream API

Description: Add `GET /api/agents/{agent_id}/logs/stream` for live audit logs.

Acceptance criteria:

- Endpoint streams Server-Sent Events.
- Supported log types include `agent.started`, `agent.thinking`, `tool.called`, `policy.checked`, `policy.blocked`, `approval.requested`, `approval.resolved`, `memory.updated`, `report.created`, `agent.completed`, and `agent.error`.
- Stream handles reconnects gracefully for the MVP.
- Stream payloads are sanitized and do not include secrets.

Priority: P0

Dependencies: Issue 3.3.1, Issue 3.4.3.

Recommended labels: `backend`, `sse`, `security`, `p0`

#### Issue 4.1.2: Build Live Audit Log UI

Description: Render real-time agent logs in the dashboard center column.

Acceptance criteria:

- Logs appear without manual refresh.
- Logs are grouped or visually distinguished by type.
- Policy blocks are highlighted.
- User can inspect each action's detail.
- At least five agent steps are visible during the demo.

Priority: P0

Dependencies: Issue 4.1.1.

Recommended labels: `frontend`, `sse`, `runtime`, `p0`

### Epic 4.2: Dashboard Controls And Panels

Description: Build the three-column live dashboard with runtime controls, approval cards, policy state, memory, and tools.

Priority: P0

Recommended labels: `frontend`, `runtime`, `policy`, `memory`, `p0`

Dependencies: API foundation, runtime, SSE.

#### Issue 4.2.1: Build Three-Column Dashboard Layout

Description: Create the live agent dashboard layout with agent chat and controls on the left, logs in the center, and policies, memory, tools, and approvals on the right.

Acceptance criteria:

- Left column includes agent chat and Start/Stop controls.
- Center column includes live audit logs.
- Right column includes policy state, memory timeline, tool state, and pending approvals.
- Layout is usable on desktop and responsive on mobile.

Priority: P0

Dependencies: Issue 4.1.2.

Recommended labels: `frontend`, `runtime`, `policy`, `memory`, `p0`

#### Issue 4.2.2: Add Current Step And Tool State UI

Description: Show current agent step, lifecycle status, and tool call badges.

Acceptance criteria:

- Dashboard shows current lifecycle status.
- Dashboard shows current step indicator.
- Tool call badges show name, permission, risk, and status.
- High-risk and blocked tools are visually distinct.

Priority: P1

Dependencies: Issue 4.2.1, Issue 3.3.2.

Recommended labels: `frontend`, `runtime`, `policy`, `p1`

#### Issue 4.2.3: Build Approval Cards

Description: Show pending approval requests and allow approve, deny, modify action, always require approval, or stop agent actions.

Acceptance criteria:

- Approval card appears when Shell Executor attempts `block_ip 185.92.XX.XX`.
- Card shows action, reason, and policy explanation.
- User can approve or deny.
- User can modify action for MVP if backend support is available.
- Decision updates logs and memory.

Priority: P0

Dependencies: Issue 3.1.4, Issue 3.3.3, Issue 4.2.1.

Recommended labels: `frontend`, `policy`, `memory`, `runtime`, `p0`

#### Issue 4.2.4: Wire Start And Stop Controls

Description: Connect dashboard controls to runtime start and stop APIs.

Acceptance criteria:

- Start button calls start API and begins runtime logs.
- Stop button calls stop API and prevents additional steps.
- UI reflects stopped, running, waiting, completed, and error states.
- Errors are recoverable and readable.

Priority: P0

Dependencies: Issue 3.1.2, Issue 4.2.1.

Recommended labels: `frontend`, `backend`, `runtime`, `p0`

### Epic 4.3: Persistent Memory

Description: Store and display agent memory, including approval decisions and later use of remembered context.

Priority: P0

Recommended labels: `backend`, `frontend`, `memory`, `runtime`, `p0`

Dependencies: Runtime and dashboard panels.

#### Issue 4.3.1: Implement Memory Store

Description: Add MVP memory persistence using JSON files or SQLite.

Acceptance criteria:

- Store can save and read memory items by agent ID.
- Memory item types include suspicious IP, past incident, approval decision, denied action, and report preference.
- Memory writes emit `memory.updated` logs.
- Store is suitable for hackathon demo persistence.

Priority: P0

Dependencies: Issue 3.1.1.

Recommended labels: `backend`, `memory`, `runtime`, `p0`

#### Issue 4.3.2: Save Required SentinelClaw Memory Items

Description: Save the minimum memory items needed to prove learning during the primary demo.

Acceptance criteria:

- Agent stores at least three memory items during the demo.
- Stored items include suspicious IP context, user denial or approval, and preferred report or remediation behavior.
- Agent references memory in a later log or final report.
- Memory entries are inspectable through the memory API.

Priority: P0

Dependencies: Issue 4.3.1, Issue 3.3.3.

Recommended labels: `backend`, `memory`, `runtime`, `demo`, `p0`

#### Issue 4.3.3: Render Memory Timeline

Description: Display memory updates in the dashboard right panel.

Acceptance criteria:

- Memory timeline shows at least three memory items.
- Timeline updates after approval decisions.
- User can inspect memory item type, content, and timestamp.
- Memory content does not expose secrets.

Priority: P0

Dependencies: Issue 3.1.3, Issue 4.3.2, Issue 4.2.1.

Recommended labels: `frontend`, `memory`, `security`, `p0`

## Milestone 5: Final Demo

Goal: Produce the final report, deploy the app, verify demo readiness, and prepare a judge-ready walkthrough.

### Epic 5.1: Final Report

Description: Generate and display the SentinelClaw incident report after workflow completion.

Priority: P0

Recommended labels: `backend`, `frontend`, `runtime`, `demo`, `p0`

Dependencies: Runtime, memory, dashboard.

#### Issue 5.1.1: Generate Incident Report

Description: Create the final report after the SentinelClaw workflow completes.

Acceptance criteria:

- Report includes incident title, severity, summary, evidence, MITRE mapping, recommended action, attempted actions, blocked actions, approval decisions, memory updates, and final status.
- Report references evidence from logs.
- Report clearly states no unapproved shell commands were executed.
- Report creation emits `report.created` and `agent.completed` logs.

Priority: P0

Dependencies: Issue 3.3.2, Issue 4.3.2.

Recommended labels: `backend`, `runtime`, `memory`, `demo`, `p0`

#### Issue 5.1.2: Build Final Report Screen

Description: Add a viewable final report page or dashboard panel.

Acceptance criteria:

- Report appears after workflow completion.
- Report can be reached from the dashboard.
- Report renders all required cybersecurity report fields.
- Pending report state is handled before completion.

Priority: P0

Dependencies: Issue 5.1.1, Issue 3.1.3.

Recommended labels: `frontend`, `demo`, `p0`

### Epic 5.2: Railway Deployment

Description: Keep ClawForge deployed for demos with secret-safe environment configuration.

Priority: P0

Recommended labels: `deployment`, `security`, `demo`, `p0`

Dependencies: End-to-end MVP flow.

#### Issue 5.2.1: Configure Deployment Environment Variables

Description: Configure production environment variables as Railway secrets.

Acceptance criteria:

- Required variables are documented as placeholders only: `NVIDIA_API_KEY`, `NVIDIA_NEMOTRON_MODEL`, `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, `MINIMAX_MODEL`, and `AGENT_PROVIDER`.
- Secrets are configured in Railway or deployment environment, not committed.
- App can run in mock mode when external provider secrets are absent.
- Logs do not expose secret values.

Priority: P0

Dependencies: Issue 3.2.5.

Recommended labels: `deployment`, `security`, `provider`, `p0`

#### Issue 5.2.2: Verify Production Routes

Description: Verify the deployed app loads and the demo surfaces are reachable.

Acceptance criteria:

- `/` returns 200 in production.
- Builder route or section loads.
- Live dashboard route loads.
- Final report route or panel loads after demo completion.
- Production URL is documented in non-secret project notes.

Priority: P0

Dependencies: Issue 5.2.1, Issue 5.1.2.

Recommended labels: `deployment`, `demo`, `p0`

### Epic 5.3: Judge-Ready Demo Walkthrough

Description: Prepare the primary demo path and fallback path for hackathon judging.

Priority: P1

Recommended labels: `demo`, `product`, `p1`

Dependencies: Final deployed MVP.

#### Issue 5.3.1: Create Primary SentinelClaw Demo Script

Description: Turn the PRD demo script into an executable walkthrough for the deployed product.

Acceptance criteria:

- Script starts with the prompt: "Create an agent that monitors logs, detects suspicious behavior, writes an incident report, and asks before executing commands."
- Script shows generated blueprint, policy table, deployment, live logs, approval gate, denial, memory update, and final report.
- Script includes the final statement: "ClawForge is the fastest way to build and safely deploy autonomous agents with OpenClaw, NemoClaw, and Nemotron."
- Script does not include secrets.

Priority: P1

Dependencies: Issue 5.2.2.

Recommended labels: `demo`, `product`, `p1`

#### Issue 5.3.2: Prepare GitHub Triage Fallback Demo

Description: Define a fallback demo workflow in case cybersecurity tooling is risky or slow.

Acceptance criteria:

- Fallback prompt creates a GitHub issue triage agent.
- Fallback blueprint includes issue reading, urgent bug classification, labeling, response drafting, and approval before posting.
- Fallback can run in mock mode with no external GitHub credentials.
- Fallback path is clearly lower priority than SentinelClaw.

Priority: P2

Dependencies: Issue 2.2.1, Issue 3.2.2.

Recommended labels: `demo`, `runtime`, `provider`, `p2`

## Cross-Cutting Security Requirements

These requirements apply to every issue in the backlog.

- Do not hardcode provider credentials in source, Linear, artifacts, logs, or generated config.
- Reference secrets only by environment variable name.
- Required environment variable placeholders are `NVIDIA_API_KEY`, `NVIDIA_NEMOTRON_MODEL`, `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, `MINIMAX_MODEL`, and `AGENT_PROVIDER`.
- Provider errors must be sanitized before being shown in UI logs or API responses.
- Audit logs must not include raw secret values.
- Any exposed key must be rotated before production use.

## Recommended Build Order

1. Product shell and builder entry.
2. Blueprint API and deterministic SentinelClaw blueprint.
3. Blueprint review and deploy CTA.
4. Agent deployment API and lifecycle runtime.
5. Policy engine and approval gate.
6. SSE log stream and dashboard.
7. Memory store and memory timeline.
8. Final report generation and report screen.
9. Provider adapters and auto fallback hardening.
10. Railway deployment verification and demo script.

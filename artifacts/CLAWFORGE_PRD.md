# ClawForge PRD

> Deployment note, May 16, 2026: Cloudflare Workers is the current canonical live demo target at https://clawforge.aalang.workers.dev/. Railway remains a backlog/alternate deployment target unless explicitly reactivated.

## 1. Executive Summary

ClawForge is a one-prompt builder for secure autonomous agents. A user describes a workflow in plain English, and ClawForge generates an OpenClaw/Hermes-compatible agent blueprint, selects tools, creates persistent memory, writes NemoClaw safety policies, deploys the agent runtime, and streams every decision, tool call, policy check, approval request, and memory update into a live audit dashboard.

The hackathon MVP proves one product promise:

> Describe a workflow. Get a secure running autonomous agent.

The recommended demo workflow is a cybersecurity incident response agent named SentinelClaw. It monitors logs, detects suspicious behavior, maps events to MITRE ATT&CK categories, writes an incident report, and requests human approval before high-risk actions such as shell commands or external alerts.

## 2. Product Positioning

### One-Liner

ClawForge lets anyone build, deploy, and safely control autonomous agents from a single prompt.

### Tagline

The fastest way to build and safely deploy autonomous agents with OpenClaw, NemoClaw, and Nemotron.

### Hackathon Pitch

Everyone is building autonomous agents. ClawForge is the fastest way to create and safely deploy them.

### Differentiation

Most demos show one agent. ClawForge shows an agent factory: prompt-to-blueprint, policy generation, memory, deployment, live runtime, approval gates, and final report output.

## 3. Target Users

### Primary User: Non-Expert Builder

A founder, student, operator, or engineer who wants to automate a workflow without manually writing an agent from scratch.

Example request:

> Build me an agent that monitors GitHub issues, identifies urgent bugs, drafts replies, and asks before posting.

### Secondary User: Technical Agent Developer

A developer who understands agents but wants a faster way to scaffold OpenClaw/NemoClaw agents, tool permissions, memory, and policy controls.

### Hackathon Judge Persona

A judge wants to see a working deployed agent, live tool use, multi-step reasoning, Nemotron usage, persistent memory, security controls, visible autonomy, and a polished demo story.

## 4. Goals And Non-Goals

### Goals

- Generate a structured agent blueprint from natural language.
- Demonstrate an autonomous multi-step agent workflow.
- Use NVIDIA Nemotron as a first-class reasoning provider.
- Support MiniMax as an additional intelligence provider through environment-configured credentials.
- Show real or simulated tool use in a way that is visible and inspectable.
- Enforce NemoClaw-style policy rules with allow, deny, and approval-required outcomes.
- Stream live audit logs to the UI.
- Store and display persistent memory.
- Produce a final report that summarizes the agent’s work and safety decisions.

### Non-Goals For MVP

- Full drag-and-drop workflow builder.
- Unlimited arbitrary integrations.
- Agent marketplace.
- Complex auth system.
- Full enterprise admin panel.
- Full code editor.
- Multi-user workspace permissions.
- Billing.
- Production-grade sandbox orchestration.

## 5. MVP Scope

### Required Product Surfaces

1. Landing page
2. Prompt builder
3. Streaming blueprint generation
4. Blueprint review
5. Deployment progress
6. Live agent dashboard
7. Approval gate
8. Persistent memory panel
9. Final report page

### Required Backend Behavior

1. Generate agent blueprint.
2. Generate policy rules.
3. Deploy or simulate deployment of agent runtime.
4. Stream logs through SSE.
5. Route reasoning through an intelligence provider abstraction.
6. Support NVIDIA Nemotron provider.
7. Support MiniMax provider through environment variables.
8. Enforce at least one approval-required policy.
9. Enforce at least one blocked policy.
10. Save memory.
11. Produce final report output.

### MVP Implementation Assumptions

- The first build should be fully demoable in `mock` provider mode without external secrets.
- Real provider adapters must be optional and selected only when their environment variables are present.
- The runtime may use deterministic sample data for cybersecurity logs, tool outputs, and MITRE mapping.
- OpenClaw/Hermes and NemoClaw compatibility can be represented through generated config shapes and event names if the real packages are unavailable during the hackathon.
- All risky operations are simulated for MVP; no shell command, network alert, data export, or ticket creation should perform an irreversible external action.
- The product should degrade gracefully: if provider generation fails, fall back to the deterministic SentinelClaw blueprint and log the fallback reason without exposing secrets.

## 6. Demo Workflow

### Primary Demo: Cybersecurity Incident Response Agent

User prompt:

> Create an agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing any commands.

Generated agent:

- Name: SentinelClaw
- Runtime: OpenClaw/Hermes
- Sandbox: NemoClaw
- Primary model: NVIDIA Nemotron
- Optional provider: MiniMax
- Tools: Log Reader, Threat Classifier, Report Writer, Ticket Creator, Shell Executor, External Alert Sender, Data Export
- Memory: Previous incidents, known safe IPs, blocked actions, user approval preferences, past remediation recommendations
- Policies: shell commands require approval, external alerts require approval, raw log export denied, local report writing allowed

### Fallback Demo: GitHub Issue Triage Agent

User prompt:

> Create an agent that reads GitHub issues, identifies urgent bugs, labels them, drafts a response, and asks before posting.

Use this if live cybersecurity tooling becomes risky or too slow.

## 7. End-To-End User Flow

### Step 1: Landing

User sees:

> Build secure autonomous agents from one prompt.

Subtitle:

> ClawForge generates OpenClaw/NemoClaw agents powered by NVIDIA Nemotron, connects tools, writes policies, creates memory, and deploys them with live audit logs.

Primary CTA:

> Build an Agent

Secondary CTA:

> View Demo Agent

### Step 2: Prompt Builder

User enters a natural-language request. The page includes example prompt chips:

- Build a security incident response agent
- Build a GitHub triage agent
- Build an inbox assistant
- Build a research agent

### Step 3: Streaming Blueprint Generation

UI streams these steps:

1. Understanding workflow
2. Selecting incident response template
3. Choosing tools
4. Creating memory schema
5. Writing NemoClaw policies
6. Preparing OpenClaw agent config
7. Blueprint ready

### Step 4: Blueprint Review

User reviews agent summary, tools, workflow steps, memory schema, policy table, model configuration, and deployment target.

CTA:

> Deploy Secure Agent

### Step 5: Deploy Agent

UI checklist:

- OpenClaw config generated
- Nemotron connected
- NemoClaw policy applied
- Tools connected
- Memory initialized
- Agent running

### Step 6: Live Agent Dashboard

The dashboard has three columns:

- Left: Agent chat and runtime controls
- Center: Live audit logs
- Right: policies, memory, tool state, pending approvals

### Step 7: Policy Safety Moment

Agent attempts:

```bash
block_ip 185.92.XX.XX
```

NemoClaw blocks the action until human approval because shell execution requires approval.

User denies the action. The denial is logged and stored in memory. Agent continues with report-only workflow.

### Step 8: Final Report

User sees a completed incident report with severity, evidence, MITRE mapping, recommended action, blocked actions, approval decisions, memory updates, and final status.

## 8. Screen Requirements

### Screen 1: Landing Page

Purpose: Explain the product instantly and drive the user into creation.

Components:

- Hero headline
- Product subtitle
- Prompt input preview
- Example prompt chips
- Generated agent card
- Tool icons
- Policy shield
- Live log preview
- Primary CTA: Build an Agent
- Secondary CTA: View Demo Agent

Acceptance criteria:

- User understands ClawForge in under 10 seconds.
- CTA scrolls or navigates to builder.
- Demo preview shows policy, memory, and live logs.

### Screen 2: Agent Builder

Purpose: Capture user request and generate blueprint.

Components:

- Large prompt box
- Template selector
- Provider selector: Nemotron, MiniMax, Auto
- Generate button
- Streaming generation panel
- Example prompt chips

States:

- Empty
- Generating
- Generated
- Error

Acceptance criteria:

- User can submit prompt.
- UI shows streaming progress.
- Generated blueprint appears without page reload.
- Provider choice is reflected in blueprint.

### Screen 3: Blueprint Review

Purpose: Let user understand what will be deployed.

Components:

- Agent summary
- Model/runtime/sandbox strip
- Tool cards
- Workflow timeline
- Memory schema
- Policy table
- Generated YAML/JSON preview
- Deploy Secure Agent CTA

Acceptance criteria:

- Blueprint includes goal, tools, memory, policies, model config, runtime config, and workflow steps.
- Risky tools are visibly marked.
- Policy rules are prominent.
- User can deploy.

### Screen 4: Deployment Progress

Purpose: Show runtime being created.

Components:

- Deployment checklist
- Runtime status
- Model status
- Sandbox status
- Tool connection status
- Memory initialization status

Acceptance criteria:

- User sees progress for each deployment step.
- Final state clearly says agent is running.
- Deployment starts live logs automatically.

### Screen 5: Live Agent Dashboard

Purpose: Prove autonomy, policy enforcement, and memory.

Layout:

- Left: Agent chat and controls
- Center: Live logs
- Right: policy, memory, tools, pending approvals

Essential UI elements:

- Start button
- Stop button
- Approval cards
- Current step indicator
- Tool call badges
- Policy shield indicator
- Memory timeline

Acceptance criteria:

- Logs stream in real time.
- At least 5 agent steps are visible.
- One action is approval-gated.
- One action is blocked or denied.
- Approval decision updates logs and memory.

### Screen 6: Final Report

Purpose: Show useful output.

Cybersecurity report fields:

- Incident title
- Severity
- Summary
- Evidence
- MITRE mapping
- Recommended action
- Actions attempted
- Actions blocked
- Approval decisions
- Memory updates
- Final status

Acceptance criteria:

- Report appears after workflow completion.
- Report references evidence from logs.
- Report clearly states no unapproved commands were executed.

## 9. Feature Requirements

### Feature 1: Natural Language Agent Builder

Input: plain English prompt.

Output: structured blueprint.

Acceptance criteria:

- Prompt creates blueprint.
- Blueprint includes identity, goal, tools, memory, policies, model, workflow, and deployment target.
- Cybersecurity prompt maps to SentinelClaw template.

### Feature 2: Blueprint Generator

Responsibilities:

- Infer workflow type.
- Select tool set.
- Generate memory schema.
- Generate policy rules.
- Generate workflow steps.
- Generate OpenClaw/Hermes-compatible agent config.

Acceptance criteria:

- Blueprint is readable in UI.
- Blueprint can be converted into executable runtime config.
- Policies are generated automatically.

### Feature 3: Tool Selection

Recommended MVP tools:

| Tool                  | Purpose                        | Permission        | Risk   |
| --------------------- | ------------------------------ | ----------------- | ------ |
| Log Reader            | Reads sample logs              | Allowed           | Low    |
| Threat Classifier     | Classifies suspicious behavior | Allowed           | Low    |
| Report Writer         | Writes final report            | Allowed           | Low    |
| Ticket Creator        | Creates mock incident ticket   | Approval Required | Medium |
| Shell Executor        | Simulates command execution    | Approval Required | High   |
| External Alert Sender | Simulates Slack/email alert    | Approval Required | Medium |
| Data Export           | Attempts raw data export       | Blocked           | High   |

Acceptance criteria:

- Tool cards show name, purpose, permission, risk, and status.
- High-risk tools require approval.
- Blocked tools produce visible log events.

### Feature 4: NemoClaw Policy Generator

Policy examples:

```yaml
policies:
  - name: require_approval_for_shell
    action: shell.execute
    effect: require_approval

  - name: block_sensitive_data_export
    action: data.export
    effect: deny

  - name: allow_log_reading
    action: logs.read
    effect: allow

  - name: require_approval_for_external_messages
    action: message.send_external
    effect: require_approval
```

Acceptance criteria:

- Policy file is generated from prompt.
- Policy rules are visible in UI.
- Policy is enforced during runtime.
- Blocked and approval-required actions appear in logs.

### Feature 5: Agent Runtime

Lifecycle:

```text
Created -> Deployed -> Running -> Waiting for Approval -> Running -> Completed
```

Agent loop:

1. Observe current state.
2. Retrieve relevant memory.
3. Think using selected intelligence provider.
4. Plan next action.
5. Check action through NemoClaw policy.
6. Execute allowed actions.
7. Pause approval-required actions.
8. Deny blocked actions.
9. Save memory.
10. Continue until complete.

Acceptance criteria:

- Agent runs at least 5 visible steps.
- Agent uses at least one tool.
- Agent produces logs.
- Agent can stop.
- Agent handles policy blocks.

### Feature 6: Live Audit Logs

Log types:

- agent.started
- agent.thinking
- tool.called
- policy.checked
- policy.blocked
- approval.requested
- approval.resolved
- memory.updated
- report.created
- agent.completed
- agent.error

Acceptance criteria:

- Logs stream over SSE.
- Logs are grouped by type.
- Policy blocks are highlighted.
- User can inspect each action.

### Feature 7: Human Approval Gates

Approval card example:

```text
Agent wants to run:
block_ip 185.92.XX.XX

Reason:
This IP produced 47 failed SSH login attempts in 2 minutes.

Policy:
Shell execution requires human approval.
```

User actions:

- Approve
- Deny
- Modify action
- Always require approval for this action type
- Stop agent

Acceptance criteria:

- Agent pauses when approval is needed.
- User can approve or deny.
- Decision is logged.
- Decision is stored in memory.
- Agent continues after decision.

### Feature 8: Persistent Memory

Cybersecurity memory examples:

- Previous suspicious IPs
- Past incidents
- Approved actions
- Denied actions
- Known false positives
- Preferred report format

Acceptance criteria:

- Agent stores at least 3 memory items.
- Memory is visible in dashboard.
- Agent uses memory in a later decision.
- User can inspect memory.

### Feature 9: Final Report

Acceptance criteria:

- Report is generated at workflow completion.
- Report includes evidence, severity, MITRE mapping, recommendations, blocked actions, and approval decisions.
- Report can be viewed from dashboard.

## 10. Intelligence Provider Strategy

ClawForge must support a provider abstraction so reasoning can run through NVIDIA Nemotron, MiniMax, or a local/mock provider for demo fallback.

### Provider Modes

| Mode       | Purpose                                         |
| ---------- | ----------------------------------------------- |
| `nemotron` | Primary hackathon reasoning provider            |
| `minimax`  | Alternative intelligence provider               |
| `auto`     | Prefer Nemotron, fallback to MiniMax, then mock |
| `mock`     | Deterministic demo-safe fallback                |

### Required Environment Variables

Do not hardcode provider credentials in source, Linear, artifacts, or logs.

```env
NVIDIA_API_KEY=
NVIDIA_NEMOTRON_MODEL=
MINIMAX_API_KEY=
MINIMAX_PLAN_KEY=
MINIMAX_MODEL=
AGENT_PROVIDER=auto
```

### Security Requirement

Any key exposed in chat or logs must be rotated before production use. The app should only reference secret values through environment variables.

Provider configuration must use placeholders in docs and deployment checklists. Do not paste real API keys, plan keys, bearer tokens, or copied provider responses into source code, artifacts, issue trackers, screenshots, or browser logs.

### Provider Interface

```ts
type ReasoningProvider = {
  id: "nemotron" | "minimax" | "mock";
  plan(input: AgentReasoningInput): Promise<AgentReasoningOutput>;
  classify(input: ClassificationInput): Promise<ClassificationOutput>;
  summarize(input: SummaryInput): Promise<SummaryOutput>;
};
```

Acceptance criteria:

- Blueprint records selected provider.
- Runtime can run in `mock` mode without secrets.
- Runtime can use Nemotron when `NVIDIA_API_KEY` is present.
- Runtime can use MiniMax when `MINIMAX_API_KEY` and plan/model config are present.
- Provider errors are logged without leaking secrets.

### Provider Fallback Rules

1. If `AGENT_PROVIDER=mock`, always use deterministic mock responses.
2. If `AGENT_PROVIDER=nemotron`, use Nemotron and fail visibly if required environment variables are missing.
3. If `AGENT_PROVIDER=minimax`, use MiniMax and fail visibly if required environment variables are missing.
4. If `AGENT_PROVIDER=auto`, try Nemotron, then MiniMax, then mock.
5. Every fallback must emit an audit event with provider ids and sanitized error categories only.

## 11. System Architecture

### Frontend

Current project stack:

- TanStack Start/Vite
- React
- Tailwind
- shadcn-style components

Frontend responsibilities:

- Landing page
- Prompt builder
- Blueprint review
- Deployment status
- Live dashboard
- Approval interactions
- Final report

### Backend

Recommended MVP backend inside the same app:

- API routes for blueprints, agents, approvals, memory, reports
- SSE endpoint for logs
- In-memory or JSON-file persistence for hackathon demo
- Provider abstraction for Nemotron/MiniMax/mock reasoning

### Agent Runtime

MVP runtime can be a deterministic orchestrator that emits OpenClaw/Hermes-style events and calls provider adapters. If real OpenClaw/Hermes integration is available, the runtime should wrap it behind the same event interface.

### Storage

MVP storage can use JSON files or SQLite.

Store:

- agents
- blueprints
- policies
- logs
- memory
- approvals
- reports

### Event Streaming

Use SSE:

```http
GET /api/agents/{agent_id}/logs/stream
```

Events:

- agent.started
- agent.thinking
- tool.called
- policy.checked
- policy.blocked
- approval.requested
- approval.resolved
- memory.updated
- agent.completed
- agent.error

## 12. API Requirements

### API Conventions

- All JSON responses must include stable ids, ISO 8601 timestamps where applicable, and enum values documented in this PRD.
- Error responses must use `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`.
- Error messages must be actionable but secret-safe.
- API handlers must support `mock` mode without provider credentials.
- Mutating endpoints must be idempotent where practical by returning the existing current state for repeated requests.

### Create Blueprint

```http
POST /api/blueprints
```

Request:

```json
{
  "prompt": "Create an agent that monitors logs and detects suspicious activity",
  "provider": "auto"
}
```

Response:

```json
{
  "blueprint_id": "bp_123",
  "agent_name": "SentinelClaw",
  "model": "NVIDIA Nemotron",
  "provider": "nemotron",
  "fallback_provider": "MiniMax",
  "tools": [],
  "policies": [],
  "memory_schema": [],
  "workflow_steps": [],
  "created_at": "2026-05-15T00:00:00.000Z"
}
```

### Deploy Agent

```http
POST /api/agents/deploy
```

Request:

```json
{
  "blueprint_id": "bp_123"
}
```

Response:

```json
{
  "agent_id": "agent_123",
  "blueprint_id": "bp_123",
  "status": "deployed",
  "created_at": "2026-05-15T00:00:00.000Z"
}
```

### Start Agent

```http
POST /api/agents/{agent_id}/start
```

### Stop Agent

```http
POST /api/agents/{agent_id}/stop
```

### Stream Logs

```http
GET /api/agents/{agent_id}/logs/stream
```

SSE event format:

```text
event: policy.checked
data: {"id":"log_001","agent_id":"agent_123","type":"policy.checked","message":"shell.execute requires approval","timestamp":"2026-05-15T00:00:00.000Z","metadata":{"tool":"shell","action":"block_ip"}}
```

### Get Memory

```http
GET /api/agents/{agent_id}/memory
```

### Approval Decision

```http
POST /api/approvals/{approval_id}/decision
```

Request:

```json
{
  "decision": "denied",
  "modified_action": null
}
```

Allowed `decision` values:

- `approved`
- `denied`
- `modified`
- `always_require_approval`
- `stop_agent`

### Get Final Report

```http
GET /api/agents/{agent_id}/report
```

## 13. Data Model

### Agent

```json
{
  "id": "agent_123",
  "blueprint_id": "bp_123",
  "name": "SentinelClaw",
  "description": "Security incident response agent",
  "goal": "Monitor logs and generate incident reports",
  "model": "nvidia-nemotron",
  "fallback_model": "minimax",
  "runtime": "openclaw",
  "sandbox": "nemoclaw",
  "status": "running",
  "created_at": "2026-05-15T00:00:00.000Z",
  "updated_at": "2026-05-15T00:00:00.000Z"
}
```

Allowed `status` values:

- `created`
- `deployed`
- `running`
- `waiting_for_approval`
- `stopped`
- `completed`
- `error`

### Agent Blueprint

```json
{
  "id": "bp_123",
  "agent_id": "agent_123",
  "provider": "auto",
  "runtime": "openclaw",
  "sandbox": "nemoclaw",
  "tools": [],
  "memory_schema": [],
  "policies": [],
  "workflow_steps": [],
  "approval_rules": [],
  "created_at": "2026-05-15T00:00:00.000Z"
}
```

### Tool

```json
{
  "id": "tool_shell",
  "name": "Shell Executor",
  "type": "shell",
  "permission": "approval_required",
  "risk_level": "high",
  "enabled": true
}
```

Allowed `permission` values:

- `allowed`
- `approval_required`
- `blocked`

Allowed `risk_level` values:

- `low`
- `medium`
- `high`

### Policy

```json
{
  "id": "policy_001",
  "name": "Require approval for shell commands",
  "action": "shell.execute",
  "effect": "require_approval",
  "reason": "Shell commands can modify system state"
}
```

### Log Event

```json
{
  "id": "log_001",
  "agent_id": "agent_123",
  "type": "policy.checked",
  "message": "shell.execute requires approval",
  "timestamp": "2026-05-15T00:00:00.000Z",
  "metadata": {
    "tool": "shell",
    "action": "block_ip"
  }
}
```

### Approval Request

```json
{
  "id": "approval_001",
  "agent_id": "agent_123",
  "action": "shell.execute",
  "command": "block_ip 185.92.XX.XX",
  "reason": "Suspicious brute force activity detected",
  "status": "pending",
  "created_at": "2026-05-15T00:00:00.000Z",
  "resolved_at": null
}
```

Allowed approval `status` values:

- `pending`
- `approved`
- `denied`
- `modified`
- `cancelled`

### Memory Item

```json
{
  "id": "memory_001",
  "agent_id": "agent_123",
  "type": "user_preference",
  "content": "User denied shell execution for unknown IPs",
  "created_at": "2026-05-15T00:00:00.000Z"
}
```

### Final Report

```json
{
  "id": "report_001",
  "agent_id": "agent_123",
  "title": "Suspicious SSH Login Activity",
  "severity": "medium",
  "summary": "Multiple failed SSH attempts were detected from a single IP.",
  "evidence": [],
  "mitre_mapping": ["T1110"],
  "recommended_actions": [],
  "actions_attempted": [],
  "actions_blocked": [],
  "approval_decisions": [],
  "memory_updates": [],
  "created_at": "2026-05-15T00:00:00.000Z"
}
```

## 14. Development Sections And Tickets

### Section A: Product Shell And Navigation

Goal: Turn the landing page into the ClawForge product shell.

Tasks:

- Replace generic AI employee landing copy with ClawForge PRD copy.
- Add prompt entry in hero.
- Add example prompt chips.
- Add sections for OpenClaw, NemoClaw, Nemotron, MiniMax, policies, memory, and live logs.
- Add navigation anchors for Builder, Demo Agent, Policies, Dashboard.

Acceptance criteria:

- Landing page matches PRD copy.
- Build Agent CTA opens builder surface.
- View Demo Agent CTA opens prebuilt SentinelClaw flow.

### Section B: Blueprint Builder UI

Goal: Build prompt-to-blueprint UX.

Tasks:

- Create prompt input component.
- Add provider selector: Auto, Nemotron, MiniMax, Mock.
- Add streaming generation checklist.
- Add generated blueprint state.
- Add error and retry states.

Acceptance criteria:

- User enters prompt and sees blueprint.
- Streaming checklist animates in order.
- Blueprint contains tools, policies, memory, workflow, model, runtime, sandbox.

### Section C: Blueprint Review UI

Goal: Make generated agent understandable and deployable.

Tasks:

- Build agent summary panel.
- Build tool cards.
- Build workflow timeline.
- Build memory schema cards.
- Build policy table.
- Build OpenClaw/NemoClaw config preview.
- Add Deploy Secure Agent CTA.

Acceptance criteria:

- Risk and permissions are visible.
- NemoClaw policies are prominent.
- Deploy button transitions to deployment flow.

### Section D: Backend API Foundation

Goal: Create API surfaces for the full flow.

Tasks:

- Add `POST /api/blueprints`.
- Add `POST /api/agents/deploy`.
- Add `POST /api/agents/{agent_id}/start`.
- Add `POST /api/agents/{agent_id}/stop`.
- Add `GET /api/agents/{agent_id}/memory`.
- Add `GET /api/agents/{agent_id}/report`.
- Add `POST /api/approvals/{approval_id}/decision`.
- Add `GET /api/agents/{agent_id}/logs/stream` SSE endpoint.

Acceptance criteria:

- APIs return typed JSON.
- Error responses are structured.
- No secrets are returned.

### Section E: Intelligence Provider Layer

Goal: Support Nemotron and MiniMax without hardcoding keys.

Tasks:

- Create `ReasoningProvider` interface.
- Implement mock provider.
- Implement Nemotron provider adapter.
- Implement MiniMax provider adapter.
- Add provider selection and fallback logic.
- Add secret-safe logging.

Acceptance criteria:

- Runtime works in mock mode with no secrets.
- Runtime can select Nemotron.
- Runtime can select MiniMax.
- Provider errors never leak API keys.

### Section F: Agent Runtime And Tool Router

Goal: Make SentinelClaw run as an autonomous multi-step workflow.

Tasks:

- Create runtime lifecycle state machine.
- Create log reader tool with sample auth logs.
- Create threat classifier tool.
- Create report writer tool.
- Create ticket creator mock tool.
- Create shell executor mock tool.
- Create external alert mock tool.
- Create data export blocked tool.
- Route all tool calls through policy engine.

Acceptance criteria:

- Agent performs at least 5 steps.
- Runtime emits tool call logs.
- Runtime pauses for approval.
- Runtime completes after approval or denial.

### Section G: NemoClaw Policy Engine

Goal: Enforce allow, deny, and approval-required outcomes.

Tasks:

- Define policy schema.
- Generate policies from blueprint.
- Implement policy checker.
- Add policy log events.
- Add approval-required state.
- Add blocked action state.

Acceptance criteria:

- Log reading is allowed.
- Report writing is allowed.
- Shell execution requires approval.
- External alert requires approval.
- Raw log export is denied.

### Section H: Live Dashboard

Goal: Prove autonomy visually.

Tasks:

- Build three-column dashboard.
- Add live SSE log stream.
- Add current step indicator.
- Add tool call badges.
- Add policy state panel.
- Add memory timeline.
- Add pending approval cards.
- Add start/stop controls.

Acceptance criteria:

- Logs stream without manual refresh.
- Approval card appears at the shell command step.
- Deny/approve updates logs and memory.
- Final report becomes available.

### Section I: Persistent Memory

Goal: Store and display agent learning.

Tasks:

- Create memory store.
- Save suspicious IP memory.
- Save user denial/approval memory.
- Save preferred report format memory.
- Inject memory into later agent step.
- Render memory timeline.

Acceptance criteria:

- At least 3 memory items are stored.
- Memory is visible in dashboard.
- Agent references memory in final report or later log.

### Section J: Final Report

Goal: Produce a useful output artifact.

Tasks:

- Generate incident report.
- Add severity, evidence, MITRE mapping, recommendation.
- Include actions attempted.
- Include actions blocked.
- Include user approvals.
- Include memory updates.
- Add view report screen.

Acceptance criteria:

- Report appears after completion.
- Report says no unapproved shell commands were executed.
- Report can be reached from dashboard.

### Section K: Railway Deployment

Goal: Keep ClawForge deployed for demos.

Tasks:

- Keep Railway project linked.
- Configure deployment path.
- Add required env vars as Railway secrets.
- Verify `/` returns 200.
- Verify live dashboard route loads.
- Document production URL.

Acceptance criteria:

- Railway deployment is live.
- Production URL loads the landing page.
- No secrets are committed.

## 15. Development Readiness Checklist

### Recommended Build Order

1. Product shell and builder UI.
2. Deterministic blueprint generator with mock provider.
3. API route foundation and typed in-memory storage.
4. Policy engine and tool router.
5. Runtime loop with SSE logs.
6. Approval gate and memory persistence.
7. Final report generation.
8. Optional Nemotron and MiniMax adapters.
9. Railway deployment configuration and production smoke test.

### Cross-Cutting Requirements

- Every user-facing state must have loading, success, empty, and error behavior.
- Every backend endpoint must return structured errors.
- Every audit event must include `id`, `agent_id`, `type`, `message`, `timestamp`, and `metadata`.
- Every provider, tool, and policy failure must be visible in the audit log.
- No implementation path may require real provider credentials for the demo to run.
- No log, report, memory item, or error response may include raw secrets.

### Minimum Test Coverage

- Blueprint generation returns SentinelClaw for the primary cybersecurity prompt.
- Mock provider runs with no environment variables.
- Provider fallback order works in `auto` mode.
- Policy checker returns `allow`, `require_approval`, and `deny`.
- SSE stream emits at least 5 ordered runtime events.
- Approval denial resumes the report-only workflow.
- Memory store persists at least 3 items.
- Final report includes evidence, MITRE mapping, blocked actions, approval decisions, and no-unapproved-command statement.

### Demo Smoke Test

1. Open the landing page.
2. Submit the primary cybersecurity prompt.
3. Confirm blueprint review includes tools, policies, memory, workflow, model, runtime, and sandbox.
4. Deploy the agent.
5. Start the runtime.
6. Watch SSE logs stream without refresh.
7. Deny the shell-command approval request.
8. Confirm the denial appears in logs and memory.
9. Confirm the final report appears and states that no unapproved shell commands were executed.

## 16. Milestones

### Milestone 1: PRD And Product Shell

Deliverables:

- Final PRD artifact
- Landing page copy updated
- Builder entry point added
- Linear project/tickets created

### Milestone 2: Prompt-To-Blueprint

Deliverables:

- Prompt builder UI
- Blueprint generator
- Provider selection
- Review screen

### Milestone 3: Runtime And Policies

Deliverables:

- Agent runtime state machine
- Tool router
- NemoClaw policy engine
- Approval gate

### Milestone 4: Live Dashboard

Deliverables:

- SSE log stream
- Policy/memory panels
- Approval interaction
- Stop/start controls

### Milestone 5: Final Demo

Deliverables:

- Final report
- Railway deployment
- Demo script
- Judge-ready walkthrough

## 17. Demo Script

### Opening

Today, building autonomous agents still requires manually writing configs, connecting tools, setting memory, and figuring out safety. ClawForge turns that into one prompt.

### Step 1

Type:

> Create an agent that monitors logs, detects suspicious behavior, writes an incident report, and asks before executing commands.

### Step 2

Show generated blueprint:

> ClawForge created the agent, selected tools, generated memory, and wrote NemoClaw policies.

### Step 3

Deploy:

> Now we deploy it inside NemoClaw with Nemotron handling reasoning.

### Step 4

Show live logs:

> The agent is reading logs, detecting a suspicious login pattern, and creating a report.

### Step 5

Security moment:

> The agent wants to run a shell command to block the IP. NemoClaw intercepts it because shell execution requires approval.

### Step 6

Deny action:

> We deny it. The agent remembers that preference and continues safely by creating a report only.

### Step 7

Final statement:

> ClawForge is the fastest way to build and safely deploy autonomous agents with OpenClaw, NemoClaw, and Nemotron.

## 18. Open Questions

- Which exact OpenClaw/Hermes runtime package or interface should be used?
- Which NVIDIA Nemotron endpoint/model ID is available for the hackathon account?
- Which MiniMax model and plan key format should be used in production?
- Should the MVP use JSON-file persistence or SQLite?
- Should GitHub triage be implemented as the fallback demo in the first build sprint?
- Should the deployed Railway app be static for landing only or full server runtime for APIs?

## 19. Definition Of Done

ClawForge MVP is done when:

- A user can enter the cybersecurity agent prompt.
- A structured blueprint is generated.
- The blueprint includes OpenClaw, NemoClaw, Nemotron, MiniMax fallback, tools, policies, memory, workflow, and approval rules.
- User can deploy the agent.
- Live dashboard streams agent logs.
- Agent reads logs and classifies suspicious behavior.
- Policy engine requires approval for shell command.
- User can deny action.
- Memory stores denial.
- Agent completes report-only workflow.
- Final report is visible.
- Railway deployment is live and verified.
- No secrets are committed, logged, or embedded in Linear/artifacts.

# ClawForge Parallel Development Workstreams

Use this as the execution handoff for splitting ClawForge across multiple people. The PRD defines what to build; this file defines who can build which part in parallel, where they should work, what they depend on, and what "done" means.

Canonical PRD: `artifacts/CLAWFORGE_PRD.md`

Development backlog: `artifacts/CLAWFORGE_LINEAR_BACKLOG.md`

Live demo URL: https://clawforge.aalang.workers.dev/

Backend health URL: https://clawforge.aalang.workers.dev/api/health

Linear project: https://linear.app/askdad/project/clawforge-c618a255248b

## Ground Rules

- Do not commit, paste, or store API keys in source, Linear, artifacts, logs, screenshots, or comments.
- Use placeholders only: `NVIDIA_API_KEY`, `NVIDIA_NEMOTRON_MODEL`, `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, `MINIMAX_MODEL`, `AGENT_PROVIDER`.
- The first complete demo must work in `mock` mode without secrets.
- Real Nemotron and MiniMax adapters must be optional and secret-backed.
- Every state-changing or external action must pass through policy checks.
- Every agent action must be visible in live logs.
- Avoid unrelated refactors. Each owner should stay inside their workstream files unless coordinating an interface change.
- If a workstream changes shared contracts, update this file and the PRD before or with the code change.

## Recommended Branching

Use one branch per workstream:

- `codex/clawforge-product-shell`
- `codex/clawforge-builder-ui`
- `codex/clawforge-blueprint-api`
- `codex/clawforge-provider-layer`
- `codex/clawforge-runtime-policy`
- `codex/clawforge-dashboard`
- `codex/clawforge-memory-report`
- `codex/clawforge-demo-deploy`

## Person-Owned Workstream Map

Actual Linear assignment is only possible for users already in the Linear org. `pmgandhi@ucsc.edu` is assigned directly. Adithya and Edwin are recorded as owners in issue comments until their Linear org invites are complete.

| Person                                | Lane                        | Linear Issues                  | Current Linear Status                                     |
| ------------------------------------- | --------------------------- | ------------------------------ | --------------------------------------------------------- |
| Adithya (`adithyaapradeep@gmail.com`) | Frontend product experience | ANU-21, ANU-22, ANU-23, ANU-28 | Ownership recorded in comments, pending Linear user setup |
| pmgandhi (`pmgandhi@ucsc.edu`)        | Backend/runtime/security    | ANU-24, ANU-25, ANU-26, ANU-27 | Assigned directly                                         |
| Edwin (`edwin.giwin@gmail.com`)       | Memory/report/demo/release  | ANU-29, ANU-30, ANU-31, ANU-32 | Ownership recorded in comments, pending Linear user setup |

## Detailed Workstream Map

| Workstream            | Owner Type          | Linear         | Can Start Now        | Blocks                                          |
| --------------------- | ------------------- | -------------- | -------------------- | ----------------------------------------------- |
| 1. Product Shell      | Frontend/product    | ANU-21         | Yes                  | None                                            |
| 2. Builder UI         | Frontend            | ANU-22         | Yes                  | Workstream 3 contract for final API integration |
| 3. Blueprint API      | Backend/full-stack  | ANU-24         | Yes                  | None                                            |
| 4. Blueprint Review   | Frontend            | ANU-23         | Yes with mock data   | Workstream 3 final response shape               |
| 5. Provider Layer     | Backend/AI          | ANU-25         | Yes                  | None                                            |
| 6. Runtime + Tools    | Backend/runtime     | ANU-26         | Yes                  | Workstream 7 policy contract                    |
| 7. Policy Engine      | Backend/security    | ANU-27         | Yes                  | None                                            |
| 8. Live Dashboard     | Frontend/full-stack | ANU-28         | Yes with mocked SSE  | Workstream 6 event stream                       |
| 9. Memory             | Backend/full-stack  | ANU-29         | Yes                  | Workstream 6 runtime events                     |
| 10. Final Report      | Frontend/full-stack | ANU-30         | Yes with mocked data | Workstream 9 memory schema                      |
| 11. Demo + Deployment | DevOps/demo         | ANU-31, ANU-32 | Yes                  | Final integrated app                            |

## Shared Contracts

These contracts let people work independently. Keep them stable unless the team explicitly updates them.

Canonical implementation file: `src/lib/clawforge/types.ts`

Mock fixtures: `src/lib/clawforge/fixtures.ts`

Mock API router: `src/lib/clawforge/api.ts`

API examples: `artifacts/CLAWFORGE_API_EXAMPLES.md`

### Provider Mode

```ts
type ProviderMode = "auto" | "nemotron" | "minimax" | "mock";
```

### Permission And Policy Effects

```ts
type ToolPermission = "allowed" | "read_only" | "approval_required" | "blocked";
type RiskLevel = "low" | "medium" | "high";
type PolicyEffect = "allow" | "deny" | "require_approval";
```

### Blueprint Response

```ts
type BlueprintResponse = {
  blueprint_id: string;
  agent_name: string;
  description: string;
  goal: string;
  provider: ProviderMode;
  model: string;
  fallback_provider: "minimax" | "mock" | null;
  runtime: "openclaw";
  sandbox: "nemoclaw";
  tools: ToolDefinition[];
  policies: PolicyDefinition[];
  memory_schema: MemorySchemaItem[];
  workflow_steps: WorkflowStep[];
  config_preview: string;
};
```

### Runtime Event

```ts
type RuntimeEventType =
  | "agent.started"
  | "agent.thinking"
  | "tool.called"
  | "policy.checked"
  | "policy.blocked"
  | "approval.requested"
  | "approval.resolved"
  | "memory.updated"
  | "report.created"
  | "agent.completed"
  | "agent.error";

type RuntimeEvent = {
  id: string;
  agent_id: string;
  type: RuntimeEventType;
  message: string;
  timestamp: string;
  severity?: "info" | "success" | "warning" | "error";
  metadata?: Record<string, unknown>;
};
```

### Approval Request

```ts
type ApprovalRequest = {
  id: string;
  agent_id: string;
  action: string;
  command?: string;
  reason: string;
  policy_id: string;
  status: "pending" | "approved" | "denied" | "modified";
  created_at: string;
  resolved_at?: string;
};
```

## Workstream 1: Product Shell And Navigation

Linear: ANU-21

Owner type: frontend/product

Can start: immediately

Primary files:

- `src/routes/index.tsx`
- `src/routes/__root.tsx`
- `src/styles.css`

Scope:

- Replace any non-ClawForge landing copy with ClawForge positioning.
- Add hero prompt entry.
- Add example prompt chips.
- Add product sections for OpenClaw, NemoClaw, Nemotron, MiniMax, policy, memory, and live logs.
- Add navigation anchors for Builder, Demo Agent, Policies, Dashboard.

Inputs:

- PRD sections 1-8.
- Live Cloudflare URL for verification.

Output:

- A landing page that tells the ClawForge story and routes users into the builder/demo.

Acceptance criteria:

- Hero headline: "Build secure autonomous agents from one prompt."
- Subtitle explains OpenClaw/NemoClaw agents powered by NVIDIA Nemotron with MiniMax support.
- CTA "Build an Agent" opens builder surface.
- CTA "View Demo Agent" starts or opens the SentinelClaw demo flow.
- No unsupported social proof claims.
- Responsive desktop and mobile layout.

Handoff:

- Provide route/anchor IDs used by builder and dashboard teams.
- Confirm final CTA targets.

## Workstream 2: Builder UI

Linear: ANU-22

Owner type: frontend

Can start: immediately with mock data

Primary files:

- `src/routes/index.tsx` or a new builder route/component
- Suggested: `src/components/clawforge/AgentBuilder.tsx`
- Suggested: `src/components/clawforge/GenerationChecklist.tsx`
- Suggested: `src/lib/clawforge/types.ts`

Scope:

- Prompt textarea.
- Template selector.
- Example prompt chips.
- Provider selector: Auto, Nemotron, MiniMax, Mock.
- Generate button.
- Streaming/timed generation checklist.
- Generated, empty, loading, and error states.

Inputs:

- Shared `ProviderMode`.
- `POST /api/blueprints` contract.

Output:

- A polished builder UI that can run against mock blueprint data first, then real API.

Acceptance criteria:

- User can enter the cybersecurity incident-response prompt.
- User can select provider mode.
- Generation checklist animates through the PRD steps.
- Blueprint data is handed to the review surface.
- UI never asks for or displays raw API keys.

Handoff:

- Emit or store selected prompt/provider for Workstream 3.
- Document the component state model.

## Workstream 3: Blueprint API

Linear: ANU-24

Owner type: backend/full-stack

Can start: immediately

Primary files:

- `src/server.ts`
- Suggested: `src/lib/clawforge/blueprints.ts`
- Suggested: `src/lib/clawforge/sampleData.ts`
- Suggested: `src/lib/clawforge/types.ts`

Scope:

- Add `POST /api/blueprints`.
- Parse prompt and provider mode.
- Return deterministic SentinelClaw blueprint for cybersecurity prompt.
- Return structured errors.
- Keep response secret-safe.

Inputs:

- Shared `BlueprintResponse`.

Output:

- API route that frontend can call to get a complete blueprint.

Acceptance criteria:

- `POST /api/blueprints` accepts `{ prompt, provider }`.
- Response includes agent name, goal, provider, model, fallback provider, runtime, sandbox, tools, policies, memory schema, workflow steps, and config preview.
- Cybersecurity prompt returns SentinelClaw.
- Invalid prompt returns a structured error.
- No secrets returned.

Handoff:

- Publish response example in `artifacts/CLAWFORGE_API_EXAMPLES.md` if the contract changes.

## Workstream 4: Blueprint Review UI

Linear: ANU-23

Owner type: frontend

Can start: with mock `BlueprintResponse`

Primary files:

- Suggested: `src/components/clawforge/BlueprintReview.tsx`
- Suggested: `src/components/clawforge/ToolCard.tsx`
- Suggested: `src/components/clawforge/PolicyTable.tsx`
- Suggested: `src/components/clawforge/WorkflowTimeline.tsx`
- Suggested: `src/components/clawforge/ConfigPreview.tsx`

Scope:

- Agent summary.
- Model/runtime/sandbox strip.
- Tool cards with permission and risk.
- Workflow timeline.
- Memory schema cards.
- Policy table.
- OpenClaw/NemoClaw config preview.
- Deploy Secure Agent CTA.

Inputs:

- `BlueprintResponse`.

Output:

- Review screen that makes the generated agent understandable and deployable.

Acceptance criteria:

- Risk and permission states are visible for every tool.
- NemoClaw policies are prominent.
- Config preview uses env var names, never literal secrets.
- Deploy button calls deployment flow.

Handoff:

- Document deploy button payload for Workstream 6.

## Workstream 5: Intelligence Provider Layer

Linear: ANU-25

Owner type: backend/AI

Can start: immediately

Primary files:

- Suggested: `src/lib/clawforge/providers/index.ts`
- Suggested: `src/lib/clawforge/providers/mock.ts`
- Suggested: `src/lib/clawforge/providers/nemotron.ts`
- Suggested: `src/lib/clawforge/providers/minimax.ts`
- Suggested: `src/lib/clawforge/secrets.ts`

Scope:

- Define `ReasoningProvider` interface.
- Implement mock provider.
- Implement Nemotron adapter.
- Implement MiniMax adapter.
- Implement `auto` fallback: Nemotron -> MiniMax -> Mock.
- Add secret-safe error handling.

Environment variables:

- `NVIDIA_API_KEY`
- `NVIDIA_NEMOTRON_MODEL`
- `MINIMAX_API_KEY`
- `MINIMAX_PLAN_KEY`
- `MINIMAX_MODEL`
- `AGENT_PROVIDER`

Output:

- Provider abstraction that runtime can call without knowing vendor details.

Acceptance criteria:

- Mock mode works with no secrets.
- Missing real provider keys fall back safely.
- Provider errors are logged without secret values.
- Provider selection is reflected in logs and blueprint.

Handoff:

- Provide `plan`, `classify`, and `summarize` method signatures to runtime team.

## Workstream 6: Runtime And Tool Router

Linear: ANU-26

Owner type: backend/runtime

Can start: immediately with mock provider and policy stub

Primary files:

- Suggested: `src/lib/clawforge/runtime.ts`
- Suggested: `src/lib/clawforge/tools.ts`
- Suggested: `src/lib/clawforge/events.ts`
- Suggested: `src/lib/clawforge/sampleLogs.ts`

Scope:

- Runtime lifecycle state machine.
- Log Reader tool.
- Threat Classifier tool.
- Report Writer tool.
- Ticket Creator mock tool.
- Shell Executor mock tool.
- External Alert mock tool.
- Data Export blocked tool.
- Tool router that asks policy engine before execution.

Output:

- Agent runtime capable of running SentinelClaw’s demo workflow.

Acceptance criteria:

- Agent performs at least 5 visible steps.
- Every tool call creates a runtime event.
- Shell command step pauses for approval.
- Runtime completes after approve or deny.
- Runtime can stop.

Handoff:

- Event stream contract for Workstream 8.
- Memory updates for Workstream 9.
- Report payload for Workstream 10.

## Workstream 7: NemoClaw Policy Engine

Linear: ANU-27

Owner type: backend/security

Can start: immediately

Primary files:

- Suggested: `src/lib/clawforge/policies.ts`
- Suggested: `src/lib/clawforge/policyFixtures.ts`

Scope:

- Policy schema.
- Policy generator from blueprint.
- Policy checker.
- Allow, deny, require-approval effects.
- Policy log event creation.
- Approval-required state.
- Blocked action state.

Required behaviors:

- `logs.read` -> allow.
- `report.write` -> allow.
- `shell.execute` -> require approval.
- `message.send_external` -> require approval.
- `data.export` -> deny.

Acceptance criteria:

- Every tool action returns a policy decision.
- Denied actions never execute.
- Approval-required actions pause.
- Decision includes policy ID and human-readable reason.

Handoff:

- Policy decision type for runtime and dashboard.

## Workstream 8: Live Dashboard

Linear: ANU-28

Owner type: frontend/full-stack

Can start: with mocked SSE events

Primary files:

- Suggested: `src/components/clawforge/LiveDashboard.tsx`
- Suggested: `src/components/clawforge/LiveLogPanel.tsx`
- Suggested: `src/components/clawforge/ApprovalCard.tsx`
- Suggested: `src/components/clawforge/PolicyMemoryPanel.tsx`
- Suggested: `src/lib/clawforge/useAgentEvents.ts`

Scope:

- Three-column dashboard.
- SSE log stream.
- Current step indicator.
- Tool call badges.
- Policy state panel.
- Memory timeline.
- Pending approval cards.
- Start/stop controls.

Output:

- Visual proof that the agent is alive, tool-using, policy-governed, and memory-backed.

Acceptance criteria:

- Logs stream without page refresh.
- Approval card appears at shell-command step.
- Approve/deny updates logs.
- Memory panel updates.
- Final report link appears after completion.

Handoff:

- Approval decision payload for Workstream 6/7.

## Workstream 9: Persistent Memory

Linear: ANU-29

Owner type: backend/full-stack

Can start: immediately with in-memory or JSON store

Primary files:

- Suggested: `src/lib/clawforge/memory.ts`
- Suggested: `src/lib/clawforge/storage.ts`
- Suggested: `src/components/clawforge/MemoryTimeline.tsx`

Scope:

- Memory store.
- Suspicious IP memory.
- User denial/approval memory.
- Preferred report format memory.
- Inject memory into later agent step.
- Render memory timeline.

Acceptance criteria:

- At least 3 memory items are stored during demo.
- Memory appears in dashboard.
- Final report references memory.
- Memory works in mock mode.

Handoff:

- Memory item schema to runtime and report teams.

## Workstream 10: Final Report

Linear: ANU-30

Owner type: frontend/full-stack

Can start: with mocked report payload

Primary files:

- Suggested: `src/components/clawforge/IncidentReport.tsx`
- Suggested: `src/lib/clawforge/reports.ts`

Scope:

- Incident title.
- Severity.
- Summary.
- Evidence.
- MITRE mapping.
- Recommended action.
- Actions attempted.
- Actions blocked.
- Approval decisions.
- Memory updates.
- Final status.

Output:

- Polished report page/card for the end of the demo.

Acceptance criteria:

- Report appears after completion.
- Report says no unapproved shell commands were executed.
- Report includes one memory-derived note.
- Report is judge-readable in under 30 seconds.

Handoff:

- Final report payload to dashboard and demo script owner.

## Workstream 11: Demo, Deployment, And QA

Linear: ANU-31, ANU-32

Owner type: DevOps/demo lead

Can start: immediately

Primary files:

- `wrangler.jsonc`
- `src/server.ts`
- `artifacts/CLAWFORGE_PRD.md`
- `artifacts/CLAWFORGE_LINEAR_BACKLOG.md`
- Suggested: `artifacts/CLAWFORGE_DEMO_SCRIPT.md`

Scope:

- Keep Cloudflare deployment live.
- Configure secrets as Cloudflare secrets only.
- Verify `/` returns 200.
- Verify `/api/health` returns JSON.
- Verify builder/dashboard routes load once implemented.
- Maintain demo script.
- Track known limitations.

Acceptance criteria:

- Live URL works.
- Backend health URL works.
- No secrets committed.
- Demo can be run in under 5 minutes.
- Script clearly calls out OpenClaw, NemoClaw, Nemotron, MiniMax support, memory, policies, and live logs.

Handoff:

- Publish latest demo URL and smoke-test result after every meaningful deployment.

## Integration Order

1. Workstream 1 updates the product shell and anchors.
2. Workstream 3 publishes the blueprint API contract.
3. Workstream 2 connects builder UI to blueprint API.
4. Workstream 4 consumes blueprint output and exposes deploy payload.
5. Workstream 5 provides provider abstraction.
6. Workstream 7 provides policy decision engine.
7. Workstream 6 wires runtime, tools, providers, and policy decisions.
8. Workstream 8 consumes runtime SSE events.
9. Workstream 9 persists memory from runtime events.
10. Workstream 10 renders final report from runtime/memory.
11. Workstream 11 deploys and verifies the integrated demo.

## First-Day Task Assignments

### Adithya: Frontend Product Experience

Email: `adithyaapradeep@gmail.com`

Start: Workstreams 1, 2, 4, and 8

Owns:

- Product shell and navigation.
- Blueprint builder UI.
- Blueprint review UI.
- Live dashboard UI.

Deliver first:

- Keep the simplified landing page polished.
- Connect the builder to `POST /api/blueprints`.
- Render the returned SentinelClaw blueprint.
- Consume mock SSE events in the dashboard.

### pmgandhi: Backend, Runtime, Intelligence, Policy

Email: `pmgandhi@ucsc.edu`

Start: Workstreams 3, 5, 6, and 7

Owns:

- Backend API foundation.
- Intelligence provider layer.
- Agent runtime and tool router.
- NemoClaw policy engine.

Deliver first:

- Keep all current mock endpoints working.
- Replace mock internals with real provider/runtime layers behind stable contracts.
- Preserve mock mode.
- Ensure no secrets leak.

### Edwin: Memory, Report, Demo, Release

Email: `edwin.giwin@gmail.com`

Start: Workstreams 9, 10, and 11

Owns:

- Persistent memory system.
- Final incident report.
- Deployment and demo verification.
- Demo script and judge walkthrough.

Deliver first:

- Connect memory/report screens to mock endpoints.
- Keep Cloudflare smoke checks current.
- Maintain a five-minute demo script.
- Track deployment status and limitations.

## Merge Checklist

Before merging a workstream:

- `npm run lint` passes or only known fast-refresh warnings remain.
- `npm run build` passes.
- No secrets are present in source, artifacts, logs, or Linear comments.
- Shared types are updated if contracts changed.
- The workstream owner documents any mocked behavior.
- The live demo script is still accurate.

## Demo Smoke Test

Run this when the integrated flow exists:

1. Open live URL.
2. Click Build an Agent.
3. Submit cybersecurity prompt.
4. Confirm blueprint appears.
5. Click Deploy Secure Agent.
6. Confirm live logs stream.
7. Wait for shell-command approval card.
8. Deny command.
9. Confirm memory updates.
10. Confirm final report appears.
11. Confirm `/api/health` still returns `ok: true`.

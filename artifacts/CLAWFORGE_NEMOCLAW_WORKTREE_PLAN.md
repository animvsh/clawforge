# ClawForge NemoClaw Worktree Plan

This plan slices the NemoClaw-first PRD into separate worktrees with low merge-conflict risk. Each lane owns specific files and contracts. Shared type changes should happen first and be merged before dependent UI/runtime branches.

## Coordination Rules

- Branch prefix: `codex/`.
- Keep one feature lane per worktree.
- Avoid broad formatting changes outside owned files.
- Do not edit another lane's primary files without a coordination note.
- Shared contracts live in `src/lib/clawforge/types.ts`; update them in the data contract lane first.
- Keep the current deterministic demo path working at all times.
- Preserve backwards-compatible API routes while adding `/api/clawforge/*` routes.
- Never commit provider keys or Composio tokens.

## Recommended Merge Order

1. Data contracts and NemoClaw fixtures.
2. API namespace compatibility.
3. Runtime, policy engine, and memory behavior.
4. Builder UI generation states.
5. Blueprint review UI.
6. Live dashboard UI.
7. Final report UI.
8. Landing positioning scrub.
9. Brev foundation and Launchable.
10. Pi SDK, provider compatibility, and broad sandbox execution readiness.
11. QA, docs, and deploy.
12. Supabase accounts, only after the core NemoClaw demo path stays green.

## Development Start Checklist

Before anyone starts implementation:

- Pull latest `main`.
- Create a separate worktree or branch for exactly one Linear issue.
- Use the branch name listed in the assigned issue.
- Read this plan and the NemoClaw-first PRD.
- Confirm the owned files for the lane.
- Confirm blocked-by dependencies are clear in Linear.
- Run `npm install` if dependencies are not installed.
- Run `npm run build` on `main` before editing so local baseline is known.
- Do not move, rename, or reformat files outside the lane.
- Do not add Supabase/provider secrets to source or Linear.
- Post a short Linear comment when starting work with the branch/worktree path.

## Dependency Matrix

| Issue  | Lane                                  | Start When                                      | Merge Before                           |
| ------ | ------------------------------------- | ----------------------------------------------- | -------------------------------------- |
| ANU-44 | Data contracts and fixtures           | Immediately                                     | ANU-42, ANU-43, ANU-45, ANU-46, ANU-47 |
| ANU-45 | API namespace and compatibility       | After ANU-44                                    | ANU-47, ANU-50                         |
| ANU-46 | Policy engine and tool router         | After ANU-44                                    | ANU-47, ANU-48, ANU-50                 |
| ANU-47 | Runtime sequence and memory moment    | After ANU-44 and ANU-46                         | ANU-48, ANU-49, ANU-50                 |
| ANU-42 | Prompt builder                        | After ANU-44, or use current types only         | ANU-50                                 |
| ANU-43 | Blueprint review                      | After ANU-44                                    | ANU-49, ANU-51, ANU-53                 |
| ANU-48 | Live dashboard                        | After ANU-46 and ANU-47                         | ANU-49, ANU-50, ANU-54                 |
| ANU-49 | Approval and report UI                | After ANU-47 and ANU-48                         | ANU-50, ANU-54                         |
| ANU-41 | Positioning and landing               | Immediately                                     | ANU-50                                 |
| ANU-56 | Brev foundation and Launchable        | After ANU-44, before final QA                   | ANU-50                                 |
| ANU-57 | Capability manifest and policy broker | After ANU-44                                    | ANU-61, ANU-62, ANU-63, ANU-64         |
| ANU-58 | Secret-safe provider registry         | After ANU-44                                    | ANU-59, ANU-60, ANU-61                 |
| ANU-59 | NVIDIA Nemotron NIM adapter           | After ANU-58                                    | ANU-50                                 |
| ANU-60 | MiniMax Cloud model adapter           | After ANU-58                                    | ANU-50                                 |
| ANU-61 | Pi Coding SDK runtime adapter         | After ANU-57 and ANU-58                         | ANU-50                                 |
| ANU-62 | Broad tool brokers                    | After ANU-57                                    | ANU-63, ANU-64                         |
| ANU-63 | NemoClaw sandbox session adapter      | After ANU-56, ANU-57, and ANU-62                | ANU-64, ANU-65                         |
| ANU-64 | Approval center and forensics         | After ANU-62 and ANU-63                         | ANU-65                                 |
| ANU-65 | Sandbox hardening verification        | After ANU-56, ANU-63, and ANU-64                | ANU-50                                 |
| ANU-50 | QA, deploy, and handoff               | After ANU-41 through ANU-49, ANU-56, and ANU-65 | Final release                          |
| ANU-55 | Supabase accounts                     | After ANU-50                                    | Optional P1 release                    |
| ANU-51 | Editable policies                     | After ANU-43 and ANU-44                         | Optional P1 release                    |
| ANU-52 | Multiple templates                    | After ANU-42 and ANU-44                         | Optional P1 release                    |
| ANU-53 | Config export                         | After ANU-43 and ANU-45                         | Optional P1 release                    |
| ANU-54 | Graph and replay                      | After ANU-48 and ANU-49                         | Optional P1 release                    |

## Ready-To-Start Status

The project is ready for development when these are true:

- Linear has one issue per worktree lane.
- Each issue has one owner and one branch name.
- P0 issues are in `Todo`, not hidden as completed.
- P1 issues are separate from P0 so the hackathon demo does not sprawl.
- Dependency relationships are visible in Linear.
- The repo contains no real secrets.
- `.env.example` contains placeholders only.
- The current Cloudflare demo remains usable as the baseline.

## Lane A: NemoClaw Positioning And Landing

Owner: Frontend

Branch: `codex/nemoclaw-positioning-landing`

Primary files:

- `src/routes/index.tsx`
- `src/routes/__root.tsx`
- `artifacts/CLAWFORGE_DEMO_SCRIPT.md`
- `artifacts/CLAWFORGE_PRD.md`

Goal:

Remove any remaining unrelated workspace language and make the landing page say exactly what ClawForge is: the secure agent factory for NemoClaw.

Acceptance criteria:

- Hero headline is "Build NemoClaw agents that are safe enough to run."
- CTA says "Build NemoClaw Agent."
- Secondary CTA says "Watch Safety Demo."
- Page explains prompt -> NemoClaw blueprint -> sandboxed agent -> policy enforcement -> memory -> safe completion.
- No copy implies ClawForge is an unrelated workspace, chatbot, or app builder.
- Buildspace-inspired simplicity remains intact.

## Lane B: Prompt Builder And Generation States

Owner: Frontend

Branch: `codex/nemoclaw-prompt-builder`

Primary files:

- `src/components/clawforge/AgentBuilder.tsx`

Allowed shared files:

- `src/lib/clawforge/types.ts` only if required by merged contract changes.

Goal:

Make the builder NemoClaw-specific and use the exact generation states from the PRD.

Acceptance criteria:

- Screen title says "Describe your NemoClaw agent."
- Placeholder uses the incident response prompt.
- CTA says "Generate NemoClaw Blueprint."
- Template chips include incident response, GitHub triage, inbox approval, and research-only sandboxed agent.
- Loading states include:
  - Understanding requested workflow...
  - Identifying risky actions...
  - Selecting NemoClaw sandbox profile...
  - Choosing allowed tools...
  - Creating approval gates...
  - Writing NemoClaw policy pack...
  - Configuring Nemotron reasoning...
  - Setting memory boundaries...
  - Preparing live audit stream...
  - NemoClaw blueprint ready.

## Lane C: NemoClaw Blueprint Review

Owner: Frontend

Branch: `codex/nemoclaw-blueprint-review`

Primary files:

- `src/components/clawforge/BlueprintReview.tsx`

Goal:

Build the full NemoClaw blueprint review with agent summary, workflow, tool permission map, policy pack, memory rules, and deploy checklist.

Acceptance criteria:

- Screen title says "Your NemoClaw blueprint is ready."
- Runtime is shown as NemoClaw.
- Tool table includes NemoClaw behavior.
- Policy pack includes allow, pause, and deny rules.
- Memory rules are shown as first-class content.
- Deploy CTA says "Deploy in NemoClaw."
- Edit Policies opens a simple modal or disabled MVP placeholder with clear text.

## Lane D: Data Contracts And Fixtures

Owner: Backend

Branch: `codex/nemoclaw-data-contracts`

Primary files:

- `src/lib/clawforge/types.ts`
- `src/lib/clawforge/fixtures.ts`

Goal:

Update data models to match the NemoClaw-first PRD.

Acceptance criteria:

- Blueprint has sandbox profile, memory rules, policy pack, tool permission map, approval gates, and audit stream metadata.
- Tools include Policy Editor and Audit Disable blocked tools.
- Policies include block_secret_access, block_policy_modification, and block_audit_disable.
- Runtime fields use NemoClaw as the primary runtime.
- IPs use `185.92.xx.xx` and `91.201.xx.xx` in demo-facing copy.
- Types support audit log events such as `sandbox.started`, `policy.approval_required`, `approval.denied`, and `memory.retrieved`.

## Lane E: API Namespace And Compatibility

Owner: Backend

Branch: `codex/nemoclaw-api-namespace`

Primary files:

- `src/lib/clawforge/api.ts`
- `src/server.ts`

Goal:

Add NemoClaw-first API routes while preserving the existing demo endpoints.

Acceptance criteria:

- `POST /api/clawforge/blueprints` works.
- `POST /api/clawforge/agents/deploy` works.
- `GET /api/clawforge/agents/:agent_id/audit-stream` works.
- `POST /api/clawforge/approvals/:approval_id/decision` works.
- `GET /api/clawforge/agents/:agent_id/memory` works.
- `GET /api/clawforge/agents/:agent_id/report` works.
- Existing `/api/blueprints`, `/api/agents/*`, and `/api/approvals/*` routes keep working.
- Responses follow the PRD response shapes.

## Lane F: Policy Engine And Tool Router

Owner: Backend

Branch: `codex/nemoclaw-policy-router`

Primary files:

- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/runtime.ts`

Goal:

Make every tool request pass through a NemoClaw-style allow, require approval, or deny decision.

Acceptance criteria:

- Logs read is allowed.
- Threat classification is allowed.
- Local report write is allowed.
- Shell execution pauses.
- External alert pauses.
- Raw log export is denied.
- Secret access is denied.
- Policy modification is denied.
- Audit disabling is denied.
- Every tool request produces a visible audit event.

## Lane G: Runtime And Memory Moment

Owner: Backend

Branch: `codex/nemoclaw-runtime-memory`

Primary files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/memory.ts`
- `src/lib/clawforge/reports.ts`

Goal:

Implement the full demo run sequence, including second suspicious IP memory retrieval.

Acceptance criteria:

- Audit stream emits the exact PRD sequence in order.
- Denial creates memory: "User denied shell execution for unknown suspicious IPs."
- Runtime emits a second source: `91.201.xx.xx`.
- Runtime retrieves memory before deciding what to do.
- Runtime skips automatic remediation because of memory.
- Final report includes the memory update and safety result.

## Lane H: Live NemoClaw Dashboard

Owner: Frontend

Branch: `codex/nemoclaw-dashboard`

Primary files:

- `src/components/clawforge/LiveDashboard.tsx`

Goal:

Make the dashboard the main proof of autonomy and safety.

Acceptance criteria:

- Header says "SentinelClaw is running inside NemoClaw."
- Layout uses three columns on desktop:
  - Agent Control Chat
  - Live NemoClaw Audit Stream
  - Security + Memory Panel
- Status cards show Running, NemoClaw Active, Enforced, NVIDIA Nemotron, Active memory, Live audit stream.
- Predefined commands work for current step, current incident, pause reason, memory, and stop.
- Logs are color-coded by category.
- Pending approval card has Approve Command and Deny Command buttons.

## Lane I: Approval Gate And Final Report UI

Owner: Frontend

Branch: `codex/nemoclaw-approval-report`

Primary files:

- `src/components/clawforge/IncidentReport.tsx`
- `src/components/clawforge/LiveDashboard.tsx` only for approval card integration if Lane H has merged.

Goal:

Make the approval and final report match the NemoClaw safety story.

Acceptance criteria:

- Approval title says "NemoClaw Approval Required."
- Approval details show requested action, command, reason, risk level, and policy triggered.
- Denial copy says NemoClaw kept the agent inside safe mode.
- Report title says "Incident Report Generated."
- Report subheader says SentinelClaw completed safely inside NemoClaw.
- Report includes model used, runtime, policy triggered, user decision, memory update, and safety result.

## Lane J: QA, Deploy, And Linear Handoff

Owner: QA / Deployment

Branch: `codex/nemoclaw-qa-deploy`

Primary files:

- `artifacts/CLAWFORGE_NEMOCLAW_FIRST_PRD.md`
- `artifacts/CLAWFORGE_NEMOCLAW_WORKTREE_PLAN.md`
- `artifacts/CLAWFORGE_TEAM_HANDOFF.md`
- `README.md`

Goal:

Keep the NemoClaw-first plan current and verify the final app end to end.

Acceptance criteria:

- `npm run lint` passes with no new errors.
- `npm run build` passes.
- Production smoke covers blueprint, deploy, audit stream, approval denial, memory retrieval, and final report.
- Cloudflare live URL is updated.
- Brev runtime demo is verified as the canonical environment.
- Linear issues match worktree lanes.
- No secrets are present in repo, docs, Linear descriptions, or logs.

## Lane J2: Brev Foundation And Launchable

Owner: Backend / Deployment

Branch: `codex/nemoclaw-brev-foundation`

Primary files:

- `scripts/brev/setup-clawforge.sh`
- `README.md`
- `artifacts/CLAWFORGE_BREV_BUILD_RESEARCH.md`
- `artifacts/CLAWFORGE_NEMOCLAW_WORKTREE_PLAN.md`
- `.env.example`

Goal:

Make Brev the canonical ClawForge build and demo environment.

Brev role:

- Host the core NemoClaw/Nemotron runtime.
- Run the ClawForge app and API.
- Provide a reproducible GPU development environment.
- Produce a Launchable for team/judge reproducibility.

Acceptance criteria:

- Brev setup instructions are documented.
- Setup script is safe and secret-free.
- Required Brev secrets are documented by name only.
- ClawForge can run on `0.0.0.0` inside Brev.
- NemoClaw onboarding path is documented.
- Ports/tunnels are documented.
- Launchable creation checklist exists.
- Cloudflare is treated as optional landing/public mirror; Brev is the canonical runtime demo.

## Lane L: Capability Manifest And Policy Broker

Owner: Backend / Security

Linear: `ANU-57`

Branch: `codex/capability-policy-broker`

Primary files:

- `src/lib/clawforge/types.ts`
- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/fixtures.ts`
- `artifacts/CLAWFORGE_PI_SANDBOX_RESEARCH.md`

Goal:

Compile broad user requests into least-privilege action envelopes before any tool or sandbox action runs.

Acceptance criteria:

- Adds `ActionEnvelope`.
- Adds action taxonomy for files, shell, browser, GitHub, email, network, memory, and policy.
- Every tool action receives deterministic `allow`, `read_only`, `approval_required`, or `deny`.
- Unknown actions deny by default.
- Policy decisions include reason, policy id, risk level, and audit metadata.
- Existing SentinelClaw deterministic demo still works.

## Lane M: Secret-Safe Provider Registry

Owner: Backend / Provider

Linear: `ANU-58`

Branch: `codex/provider-registry-selection`

Primary files:

- `src/lib/clawforge/providers/index.ts`
- `src/lib/clawforge/providers/nemotron.ts`
- `src/lib/clawforge/providers/minimax.ts`
- `src/lib/clawforge/types.ts`
- `.env.example`

Goal:

Add a provider registry that can select Nemotron, MiniMax, Pi-compatible mode, or mock without exposing secrets.

Acceptance criteria:

- `auto` selects Nemotron when `NVIDIA_API_KEY` exists, then MiniMax when MiniMax credentials exist, then mock.
- UI sends provider/model slugs only.
- No API key or redacted key is returned from `/api/*`.
- Provider health returns booleans and model slugs only.
- Mock mode still works without provider keys.

## Lane N: NVIDIA Nemotron NIM Adapter

Owner: Backend / Provider

Linear: `ANU-59`

Branch: `codex/nemotron-nim-adapter`

Primary files:

- `src/lib/clawforge/providers/nemotron.ts`
- `src/lib/clawforge/providers/index.ts`
- `.env.example`

Goal:

Implement real NVIDIA Nemotron reasoning through OpenAI-compatible NVIDIA NIM endpoints.

Acceptance criteria:

- Calls OpenAI-compatible `POST /v1/chat/completions`.
- Supports hosted NVIDIA API base URL `https://integrate.api.nvidia.com/v1`.
- Supports local NIM base URL override for Brev.
- Reads `NVIDIA_API_KEY`, `NVIDIA_NEMOTRON_MODEL`, and optional `NVIDIA_BASE_URL` server-side only.
- Supports non-streaming and streaming output.
- Maps provider errors to structured safe messages.

## Lane O: MiniMax Cloud Model Adapter

Owner: Backend / Provider

Linear: `ANU-60`

Branch: `codex/minimax-cloud-adapter`

Primary files:

- `src/lib/clawforge/providers/minimax.ts`
- `src/lib/clawforge/providers/index.ts`
- `.env.example`

Goal:

Implement MiniMax Cloud compatibility for ClawForge chat and agent reasoning.

Acceptance criteria:

- Supports MiniMax Cloud model calls.
- Supports OpenAI-compatible API mode using `https://api.minimax.io/v1`.
- Keeps `MINIMAX_API_KEY`, `MINIMAX_PLAN_KEY`, and `MINIMAX_MODEL` server-side only.
- Preserves provider response state needed for multi-turn continuity.
- Does not expose raw thinking blocks to UI by default.

## Lane P: Pi Coding SDK Runtime Adapter

Owner: Backend / Provider Runtime

Linear: `ANU-61`

Branch: `codex/pi-coding-sdk-adapter`

Primary files:

- `src/lib/clawforge/providers/pi.ts`
- `src/lib/clawforge/providers/index.ts`
- `src/lib/clawforge/runtime.ts`
- `.env.example`

Goal:

Add Pi Coding Agent SDK as a server-only runtime adapter for ClawForge chat and agent sessions.

Acceptance criteria:

- Uses `@earendil-works/pi-coding-agent` only on server/Node runtime paths.
- Adapter can create an in-memory Pi agent session.
- Pi streaming events map to ClawForge audit events.
- Raw Pi `bash`, `edit`, and `write` tools are not exposed to arbitrary prompts by default.
- Pi tools route through the ClawForge policy broker.
- Mock mode still works without Pi installed or configured.

## Lane Q: Broad Tool Brokers

Owner: Backend / Runtime

Linear: `ANU-62`

Branch: `codex/broad-tool-brokers`

Primary files:

- `src/lib/clawforge/tools.ts`
- `src/lib/clawforge/policies.ts`
- `src/lib/clawforge/runtime.ts`

Goal:

Add tool broker interfaces so the agent can take broad actions safely across shell, files, browser, GitHub, email/Slack, tickets, and reports.

Acceptance criteria:

- Adds broker interfaces for shell, browser, GitHub, files, email/Slack, tickets, and reports.
- Every broker call passes through the policy broker first.
- Shell, external send, write outside workspace, and policy edits require approval or are denied.
- Every decision emits an audit event.
- No provider/tool receives raw user intent directly without policy wrapping.

## Lane R: NemoClaw Sandbox Session Adapter

Owner: Backend / Deployment Runtime

Linear: `ANU-63`

Branch: `codex/nemoclaw-sandbox-session-adapter`

Primary files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/api.ts`
- `src/lib/clawforge/types.ts`
- `scripts/brev/setup-clawforge.sh`
- `README.md`

Goal:

Wire ClawForge runtime sessions to Brev-hosted NemoClaw/OpenShell sandboxes.

Acceptance criteria:

- Runtime can create, start, stop, and inspect NemoClaw sandbox sessions.
- ClawForge session states map to NemoClaw/OpenShell lifecycle states.
- Sandbox failures emit sanitized `agent.error` events.
- Blocked network requests can be surfaced as approval events.
- Uses `inference.local` routing for model calls inside the sandbox.
- Mock mode still works without NemoClaw.

## Lane S: Approval Center, Audit, And Forensics

Owner: Dashboard / Memory / Runtime

Linear: `ANU-64`

Branch: `codex/approval-audit-forensics`

Primary files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/memory.ts`
- `src/lib/clawforge/reports.ts`
- `src/components/clawforge/LiveDashboard.tsx`
- `src/components/clawforge/MemoryTimeline.tsx`
- `src/components/clawforge/IncidentReport.tsx`

Goal:

Make approvals, audit events, memory, and final reports trustworthy enough for broad sandboxed autonomous work.

Acceptance criteria:

- Approval requests include command, diff, or content preview; destination; risk label; timeout behavior; and policy id.
- Side effects cannot execute without approval artifact when policy requires approval.
- Audit events are append-only and ordered.
- Memory stores approval/denial and later retrieval.
- Final report cites policy, provider, sandbox, approval, and memory results.

## Lane T: Sandbox Hardening Verification

Owner: QA / Deployment / Security

Linear: `ANU-65`

Branch: `codex/sandbox-hardening-verification`

Primary files:

- `src/lib/clawforge/runtime.ts`
- `src/lib/clawforge/policies.ts`
- `artifacts/CLAWFORGE_TEAM_HANDOFF.md`
- `README.md`

Goal:

Verify ClawForge only runs elevated autonomous work when sandbox hardening, secret redaction, provider isolation, and audit logging are healthy.

Acceptance criteria:

- Startup warns or fails when sandbox hardening is missing.
- Health check covers gateway inference routing, network deny-by-default, forbidden path scanner, and secret redaction.
- Logs redact authorization headers and provider keys.
- Elevated mode requires explicit configuration and warnings.
- No secrets appear in source, artifacts, Linear, screenshots, or logs.

## Lane K: Supabase Accounts And Auth

Owner: Backend / Frontend

Branch: `codex/nemoclaw-supabase-accounts`

Primary files:

- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/components/clawforge/AuthPanel.tsx`
- `src/routes/index.tsx`
- `.env.example`

Goal:

Add optional Supabase-backed accounts to ClawForge without turning the product into a generic workspace or blocking the public demo. Auth should support saving user-owned NemoClaw blueprints, runs, memory, and reports later, but the hackathon demo must remain usable without login.

Supabase project reference:

- `mfslvyqvkutazsimsrhu`

Required secret handling:

- Store `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as deployment secrets or local `.env` values.
- Store management tokens and service-role keys only in secure provider/CI secret stores.
- Never commit personal access tokens, anon keys, service-role keys, JWT secrets, or refresh tokens.
- The currently shared personal access token must be rotated before production use.

Acceptance criteria:

- `.env.example` documents only variable names and safe placeholders.
- Supabase client reads from environment variables.
- Landing page may show sign in/sign out, but the primary CTA still builds a NemoClaw agent.
- Anonymous users can run the demo.
- Authenticated users can be associated with future saved blueprints/runs without breaking current APIs.
- No token values appear in source, artifacts, Linear, build logs, browser logs, or screenshots.

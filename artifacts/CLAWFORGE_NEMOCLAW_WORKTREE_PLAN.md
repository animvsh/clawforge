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
9. QA, docs, and deploy.
10. Supabase accounts, only after the core NemoClaw demo path stays green.

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

| Issue  | Lane                               | Start When                              | Merge Before                           |
| ------ | ---------------------------------- | --------------------------------------- | -------------------------------------- |
| ANU-44 | Data contracts and fixtures        | Immediately                             | ANU-42, ANU-43, ANU-45, ANU-46, ANU-47 |
| ANU-45 | API namespace and compatibility    | After ANU-44                            | ANU-47, ANU-50                         |
| ANU-46 | Policy engine and tool router      | After ANU-44                            | ANU-47, ANU-48, ANU-50                 |
| ANU-47 | Runtime sequence and memory moment | After ANU-44 and ANU-46                 | ANU-48, ANU-49, ANU-50                 |
| ANU-42 | Prompt builder                     | After ANU-44, or use current types only | ANU-50                                 |
| ANU-43 | Blueprint review                   | After ANU-44                            | ANU-49, ANU-51, ANU-53                 |
| ANU-48 | Live dashboard                     | After ANU-46 and ANU-47                 | ANU-49, ANU-50, ANU-54                 |
| ANU-49 | Approval and report UI             | After ANU-47 and ANU-48                 | ANU-50, ANU-54                         |
| ANU-41 | Positioning and landing            | Immediately                             | ANU-50                                 |
| ANU-50 | QA, deploy, and handoff            | After ANU-41 through ANU-49             | Final release                          |
| ANU-55 | Supabase accounts                  | After ANU-50                            | Optional P1 release                    |
| ANU-51 | Editable policies                  | After ANU-43 and ANU-44                 | Optional P1 release                    |
| ANU-52 | Multiple templates                 | After ANU-42 and ANU-44                 | Optional P1 release                    |
| ANU-53 | Config export                      | After ANU-43 and ANU-45                 | Optional P1 release                    |
| ANU-54 | Graph and replay                   | After ANU-48 and ANU-49                 | Optional P1 release                    |

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

Remove any remaining generic AI workspace language and make the landing page say exactly what ClawForge is: the secure agent factory for NemoClaw.

Acceptance criteria:

- Hero headline is "Build NemoClaw agents that are safe enough to run."
- CTA says "Build NemoClaw Agent."
- Secondary CTA says "Watch Safety Demo."
- Page explains prompt -> NemoClaw blueprint -> sandboxed agent -> policy enforcement -> memory -> safe completion.
- No copy implies ClawForge is a generic AI workspace, chatbot, or app builder.
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
- Linear issues match worktree lanes.
- No secrets are present in repo, docs, Linear descriptions, or logs.

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

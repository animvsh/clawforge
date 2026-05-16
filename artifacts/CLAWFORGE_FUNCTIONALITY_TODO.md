# ClawForge Functional Completion TODO

Last updated: 2026-05-16

## Definition of Done

ClawForge is functional when a nontechnical user can:

1. Sign in or use the demo account without hitting a broken auth state.
2. Open the dashboard and see every project plus every deployed NemoClaw instance.
3. Click New agent, describe a goal, and either get clarifying questions or a ready workspace.
4. Watch the workspace generate a custom blueprint, workflow graph, tool map, policy pack, memory rules, and deployment plan.
5. Click Deploy and create a Brev-hosted NemoClaw workspace with a mem0 memory manifest, integration manifest, and chat web UI.
6. Open the generated instance chat link and talk to that specific NemoClaw instance.
7. Switch between Nemotron and MiniMax models inside chat.
8. See required integrations inferred from the goal, with connection links for tools like Gmail, Calendar, Docs, Sheets, GitHub, Slack, Linear, phone, voice, and agent inbox.
9. Run the incident-response demo end to end: logs, policy pause, approval/deny, memory update, final report.
10. Pass local tests, browser QA, Railway smoke tests, and Brev runtime checks before deploy.

## Current Finish Checklist

### P0: Make Agent Creation Real

- [x] Dashboard has a New agent composer.
- [x] Workspace asks setup questions when the prompt is too vague.
- [x] Prompt generates custom blueprints instead of only using one fixed template.
- [x] Workspace has chat on the left and workflow/inspection panels on the right.
- [x] Chat supports model switching commands and a model selector.
- [ ] New agent should clearly label whether the workspace is draft, ready, deploying, deployed, or blocked.
- [ ] New agent should prepare the Brev deploy plan immediately after a valid blueprint is ready.

### P0: Brev + NemoClaw Runtime

- [x] Brev CLI is installed locally.
- [x] Brev CLI can reach the existing `mad-coral-donkey` instance.
- [x] App API can generate a Brev startup script with the custom NemoClaw manifest.
- [x] Brev setup script creates runtime directories, memory config, integration manifest, and chat web UI metadata.
- [ ] Railway image must include Brev CLI on PATH at runtime.
- [ ] Railway must have `BREV_TOKEN` set so clicking Deploy can create Brev instances.
- [ ] Existing `mad-coral-donkey` must be bootstrapped from the pushed repo.
- [ ] UI deploy result must show the real Brev instance state and chat link.
- [ ] Remote Brev health check must pass after setup.

### P0: Memory

- [x] Each Brev startup manifest includes `memory.engine = mem0`.
- [x] Memory scope is workspace-level.
- [x] Incident demo stores approval decisions into memory.
- [ ] Brev setup should create per-instance mem0 runtime metadata.
- [ ] Instance chat should show which memory backend is active.
- [ ] E2E test should add/search a scoped memory item and verify another project cannot see it.

### P0: Integrations

- [x] Composio status and connect-link endpoints exist.
- [x] Agentmail inbox creation endpoint exists.
- [x] Blueprint inference adds core integrations for phone, calendar, email, CRM, GitHub, Linear.
- [ ] Add Docs, Sheets, Drive, Slack, browser/search, and generic webhook/tool-router needs.
- [ ] Add Pipedream Connect status and connect-token endpoints.
- [ ] Brev integration manifest should include both Composio and Pipedream availability.
- [ ] Workspace should show required integrations and let users connect them without saying "Composio" in user-facing copy.
- [ ] Instance chat should explain missing tool access and prompt the user to connect the right tool.

### P0: UX Polish

- [x] Landing page has a clean prompt-first flow.
- [x] Landing page includes example prompts below the hero.
- [x] Dashboard exists as the project hub.
- [x] Workspace has fixed bottom chat input.
- [ ] Workflow canvas should feel more like a clear action graph, not a dense technical panel.
- [ ] Copy should stay nontechnical: "tools", "connections", "safety checks", "memory", "deploy".
- [ ] Deploy and Brev launch should be the same primary action.
- [ ] Mobile layout must keep chat and deploy controls usable.

### P0: Testing

- [x] Unit tests: `vitest` passes.
- [x] Production build: `vite build` passes.
- [ ] Local Railway server smoke: `/api/health`, `/api/blueprints`, `/api/clawforge/brev/status`.
- [ ] Browser QA: landing examples, dashboard New agent, clarification, workspace deploy, instance chat.
- [ ] Railway smoke after deploy: health, blueprint, chat, launch-plan, Brev status.
- [ ] Brev smoke: `brev exec mad-coral-donkey` can run setup and return remote health.

### P0: Release

- [ ] Format/lint modified files.
- [ ] Commit all source/artifact changes.
- [ ] Push `main`.
- [ ] Deploy Railway.
- [ ] Confirm production URL.
- [ ] Record final gaps honestly if an external provider token is missing.

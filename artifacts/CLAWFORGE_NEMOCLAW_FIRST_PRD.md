# ClawForge NemoClaw-First PRD

## Product Definition

ClawForge is the secure agent factory for NemoClaw.

Core tagline:

> Build NemoClaw agents that are safe enough to run.

One-liner:

> ClawForge turns one prompt into a secure, running NemoClaw agent with tools, memory, approval gates, policy enforcement, privacy guardrails, and live audit logs.

ClawForge is not a generic app builder, not a chatbot, and not a website builder. The product should feel like a Lovable-style creation flow for autonomous agents, but the output is a NemoClaw agent deployment: sandbox profile, policy pack, tool permission map, memory rules, approval gates, audit stream, and final output.

The product thesis is simple: agents become useful when they can act, and agents become deployable when they can be controlled. ClawForge makes NemoClaw agents deployable.

## NemoClaw-First Principles

Every screen must make NemoClaw visible:

- This agent runs in NemoClaw.
- This action was checked by NemoClaw.
- This command was paused by NemoClaw.
- This data stayed inside the NemoClaw boundary.
- This approval decision was logged by NemoClaw.
- This memory was written inside the NemoClaw-controlled environment.

Avoid broad "AI workspace" language. Use "NemoClaw agent", "NemoClaw sandbox", "policy pack", "approval gate", "audit stream", "memory boundary", and "secure agent factory".

## MVP Demo Prompt

Use this exact prompt:

```text
Create a NemoClaw agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.
```

## MVP Outcome

The hackathon demo proves:

Prompt -> NemoClaw blueprint -> sandboxed agent -> policy enforcement -> memory -> safe completion.

The demo agent is SentinelClaw, a cybersecurity incident response NemoClaw agent.

The agent:

1. Runs inside NemoClaw.
2. Reads system logs.
3. Detects suspicious login behavior.
4. Uses NVIDIA Nemotron for classification.
5. Generates an incident report.
6. Attempts a risky remediation command.
7. Gets paused by a NemoClaw approval policy.
8. Records the user's denial in memory.
9. Sees a second suspicious IP.
10. Retrieves the memory and skips automatic remediation.
11. Completes safely with a final report.

## Required User Flow

### Flow 1: Landing Page

Goal: users understand the product in under five seconds.

Hero headline:

> Build NemoClaw agents that are safe enough to run.

Subheadline:

> ClawForge turns one prompt into a running NemoClaw agent with tools, memory, approval gates, policy enforcement, privacy guardrails, and live audit logs.

Primary CTA:

> Build NemoClaw Agent

Secondary CTA:

> Watch Safety Demo

Hero visual:

- Left side: prompt text for the incident response agent.
- Right side: NemoClaw policy pack preview.

Policy preview:

```text
NemoClaw Policy Pack
✓ Read logs: allowed
✓ Write report: allowed
⚠ Shell commands: approval required
⚠ External alerts: approval required
✕ Raw log export: blocked
✕ Policy editing: blocked
```

### Flow 2: Prompt Builder

Screen title:

> Describe your NemoClaw agent.

Subtitle:

> ClawForge will generate the sandbox, tools, memory, policies, approval gates, and live audit dashboard needed to run it safely.

CTA:

> Generate NemoClaw Blueprint

Example chips:

- Incident response agent
- GitHub triage agent
- Inbox approval agent
- Research-only sandboxed agent

For the MVP, every chip may still map to the SentinelClaw incident response template as long as the UI is honest that this is the demo template.

### Flow 3: Blueprint Generation

Screen title:

> Forging your NemoClaw agent...

Generation states:

1. Understanding requested workflow...
2. Identifying risky actions...
3. Selecting NemoClaw sandbox profile...
4. Choosing allowed tools...
5. Creating approval gates...
6. Writing NemoClaw policy pack...
7. Configuring Nemotron reasoning...
8. Setting memory boundaries...
9. Preparing live audit stream...
10. NemoClaw blueprint ready.

### Flow 4: NemoClaw Blueprint Review

Screen title:

> Your NemoClaw blueprint is ready.

Sections:

- Agent summary card
- Workflow card
- Tool permission map
- NemoClaw policy pack
- Memory rules
- Deploy in NemoClaw CTA
- Edit Policies secondary action

Agent summary fields:

| Field           | Value             |
| --------------- | ----------------- |
| Agent Name      | SentinelClaw      |
| Workflow Type   | Incident Response |
| Runtime         | NemoClaw          |
| Reasoning Model | NVIDIA Nemotron   |
| Sandbox Status  | Configured        |
| Policy Mode     | Enforced          |
| Memory          | Enabled           |
| Audit Logs      | Enabled           |

Tool permission map:

| Tool              | Purpose                          | Permission        | Risk     | NemoClaw Behavior     |
| ----------------- | -------------------------------- | ----------------- | -------- | --------------------- |
| Log Reader        | Reads local logs                 | Allowed           | Low      | Runs automatically    |
| Threat Classifier | Classifies suspicious behavior   | Allowed           | Low      | Runs through Nemotron |
| Report Writer     | Writes sanitized incident report | Allowed           | Low      | Writes locally        |
| Shell Executor    | Runs remediation commands        | Approval Required | High     | Pauses agent          |
| Alert Sender      | Sends external alerts            | Approval Required | Medium   | Pauses agent          |
| Raw Log Export    | Exports full logs                | Blocked           | High     | Denies action         |
| Policy Editor     | Modifies policies                | Blocked           | Critical | Denies action         |
| Audit Disable     | Disables logs                    | Blocked           | Critical | Denies action         |

Policy pack:

| Policy ID                       | Rule                                        | Enforcement |
| ------------------------------- | ------------------------------------------- | ----------- |
| allow_log_reading               | Agent may read local logs                   | Allow       |
| allow_threat_classification     | Agent may classify threats with Nemotron    | Allow       |
| allow_local_report_write        | Agent may write sanitized local reports     | Allow       |
| require_shell_approval          | Shell commands require human approval       | Pause       |
| require_external_alert_approval | External alerts require human approval      | Pause       |
| block_raw_log_export            | Raw logs cannot leave the sandbox           | Deny        |
| block_secret_access             | Secrets and credential files cannot be read | Deny        |
| block_policy_modification       | Agent cannot edit its own policies          | Deny        |
| block_audit_disable             | Agent cannot disable audit logs             | Deny        |

### Flow 5: Deploy In NemoClaw

Screen title:

> Deploying SentinelClaw in NemoClaw

Deployment checklist:

- NemoClaw sandbox created
- NVIDIA Nemotron connected
- Policy pack loaded
- Tool permissions applied
- Memory boundary initialized
- Live audit stream enabled
- Agent runtime started

Final message:

> SentinelClaw is running safely inside NemoClaw.

### Flow 6: Live NemoClaw Dashboard

Header:

> SentinelClaw is running inside NemoClaw.

Subheader:

> Every tool call, policy check, approval request, memory update, and final output is logged in real time.

Layout:

- Left: Agent Control Chat
- Center: Live NemoClaw Audit Stream
- Right: Security + Memory Panel

Status cards:

| Card         | Value           |
| ------------ | --------------- |
| Status       | Running         |
| Sandbox      | NemoClaw Active |
| Policy Mode  | Enforced        |
| Model        | NVIDIA Nemotron |
| Memory       | Active          |
| Audit Stream | Live            |

Required predefined chat commands:

| User Message                 | System Response                |
| ---------------------------- | ------------------------------ |
| What are you doing?          | Shows current agent step       |
| Show current incident        | Shows current incident summary |
| Why did NemoClaw pause this? | Explains policy trigger        |
| Show memory                  | Shows memory items             |
| Stop the agent               | Stops or simulates stop        |

Audit stream sequence:

```text
[00:01] NemoClaw sandbox active.
[00:02] SentinelClaw started.
[00:03] Memory boundary loaded.
[00:04] Reading /logs/auth.log inside sandbox.
[00:06] Found 47 failed login attempts from 185.92.xx.xx.
[00:08] Sending event to NVIDIA Nemotron for classification.
[00:10] Nemotron classified severity as High.
[00:11] Threat pattern: possible brute-force login attempt.
[00:13] Generating sanitized incident report.
[00:15] Recommended remediation: block suspicious IP.
[00:16] Agent requested shell.execute: block_ip 185.92.xx.xx.
[00:17] NemoClaw policy check: require_shell_approval.
[00:18] Action paused by NemoClaw.
[00:19] Waiting for human approval.
[00:21] User denied shell.execute.
[00:22] NemoClaw blocked command execution.
[00:23] Decision saved to memory.
[00:24] SentinelClaw continuing with report-only workflow.
[00:29] New suspicious source detected: 91.201.xx.xx.
[00:30] Retrieved memory: user denied shell execution for unknown IPs.
[00:31] SentinelClaw skipped automatic remediation.
[00:32] Added recommendation to incident report instead.
[00:35] Final report generated.
[00:36] Agent completed safely inside NemoClaw.
```

### Flow 7: Approval Gate

Title:

> NemoClaw Approval Required

Body:

> SentinelClaw wants to execute a shell command. NemoClaw paused this action because shell execution can change system state and requires human approval.

Details:

| Field            | Value                                   |
| ---------------- | --------------------------------------- |
| Requested Action | shell.execute                           |
| Command          | block_ip 185.92.xx.xx                   |
| Reason           | Repeated failed login attempts detected |
| Risk Level       | High                                    |
| Policy Triggered | require_shell_approval                  |

Buttons:

- Approve Command
- Deny Command

For the demo, deny the command.

### Flow 8: Memory Moment

After denial:

```text
Memory Added:
User denied shell execution for unknown suspicious IPs.
Future remediation commands against unknown IPs require explicit approval.
```

Then the runtime should emit a second suspicious IP and retrieve memory:

```text
[00:29] New suspicious source detected: 91.201.xx.xx.
[00:30] Retrieved memory: user denied shell execution for unknown IPs.
[00:31] SentinelClaw skipped automatic remediation.
[00:32] Added recommendation to incident report instead.
```

### Flow 9: Final Report

Screen title:

> Incident Report Generated

Subheader:

> SentinelClaw completed the workflow safely inside NemoClaw. No restricted action was executed without approval.

Report must include:

- Severity
- Detected behavior
- Classification
- Model used
- Agent runtime
- NemoClaw policy triggered
- Action attempted
- User decision
- Final action
- Memory update
- Safety result

## P0 Feature Requirements

### P0.1 Prompt-to-NemoClaw Blueprint

Acceptance criteria:

- User can submit the demo prompt.
- Blueprint appears.
- Blueprint is NemoClaw-specific.
- Blueprint includes sandbox profile, tools, policies, memory rules, approval gates, and audit stream.
- Blueprint can be deployed.

### P0.2 NemoClaw Blueprint Review

Acceptance criteria:

- Risky tools are clearly marked.
- Policies are visible.
- Memory rules are visible.
- User understands what will run.
- User can deploy.

### P0.3 NemoClaw Runtime Simulation Or Integration

Acceptance criteria:

- Agent performs at least 6 visible steps.
- Agent uses Nemotron at least once, or clearly shows the Nemotron classification step in mock mode.
- Agent uses at least one tool.
- Agent triggers one approval gate.
- Agent completes final report.

### P0.4 Live Audit Logs

Acceptance criteria:

- Logs stream during the run.
- Policy check appears clearly.
- Paused action appears clearly.
- Memory update appears clearly.
- Second suspicious IP memory retrieval appears clearly.

### P0.5 Policy Enforcement

Acceptance criteria:

- Shell command pauses.
- User must approve or deny.
- Raw export is shown as blocked.
- Policy modification and audit disable are shown as blocked.
- Final report records the policy result.

### P0.6 Approval Gate

Acceptance criteria:

- Agent pauses.
- Decision is logged.
- Decision is stored in memory.
- Agent continues safely.

### P0.7 Persistent Memory

Acceptance criteria:

- Denial is saved.
- Second event uses memory.
- Logs show memory retrieval.
- Final report includes memory update.

### P0.8 Final Report

Acceptance criteria:

- Report appears at the end.
- Report references NemoClaw enforcement.
- Report says no restricted action ran without approval.
- Report is useful and readable.

## P1 Features

- Editable policy pack
- Multiple NemoClaw agent templates
- Export NemoClaw config
- Visual workflow graph
- Replay audit trail

## Optional Accounts Layer

Supabase-backed accounts are useful for saving generated NemoClaw blueprints, agent runs, audit trails, memory, and reports. They should not change the core product story or block the public hackathon demo.

The landing page may support account controls, but ClawForge should still read as a secure agent factory for NemoClaw, not an AI workspace.

Supabase project reference:

- `mfslvyqvkutazsimsrhu`

Security requirements:

- Store Supabase URL and anon key in environment variables.
- Store personal access tokens and service-role keys only in secure secret stores.
- Never put Supabase personal access tokens in source, docs, Linear, screenshots, or logs.
- Rotate any personal access token that was pasted into chat before production use.

Acceptance criteria:

- Anonymous users can still run the demo.
- Authenticated users can later own saved blueprints, runs, memory, and reports.
- The primary CTA remains "Build NemoClaw Agent."
- Auth never reframes ClawForge as a generic workspace product.

## P2 Features To Avoid During Hackathon

- Full authentication/admin system beyond lightweight optional Supabase accounts
- Billing
- Team permissions
- Marketplace
- Drag-and-drop workflow editor
- Multi-agent swarms
- Generic app builder
- Website builder

Every feature must support:

Prompt -> NemoClaw blueprint -> sandboxed agent -> policy enforcement -> memory -> safe completion.

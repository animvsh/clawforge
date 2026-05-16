# ClawForge Demo Script

Target length: under 5 minutes.

Live app: https://clawforge.aalang.workers.dev/

## 30-Second Opening

Autonomous agents are powerful, but they are still hard to build and risky to deploy with real tools.

ClawForge turns one plain-English workflow into a secure OpenClaw agent powered by NVIDIA Nemotron, optionally backed by MiniMax, protected by NemoClaw policies, and visible through live audit logs.

Today we will generate SentinelClaw, a cybersecurity incident response agent.

## Demo Flow

### 1. Landing Page

Show:

- Hero: Build secure autonomous agents from one prompt.
- Platform signals: OpenClaw, NemoClaw, Nemotron, MiniMax-ready.
- CTA: Build an Agent.

Say:

ClawForge is not a single agent. It is the builder for safe autonomous agents.

### 2. Prompt To Blueprint

Use prompt:

```text
Create an agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.
```

Show the generated SentinelClaw blueprint:

- Tools.
- Memory.
- Policies.
- Workflow.
- Runtime and sandbox.

Say:

ClawForge created the agent structure, selected tools, wrote safety policies, and prepared the OpenClaw runtime.

### 3. Deploy

Show deploy action.

Say:

Now we deploy the agent inside NemoClaw. The demo can run in mock mode, but the provider layer is designed for Nemotron and MiniMax.

### 4. Live Runtime

Show live logs:

- Agent started.
- Reading logs.
- Detecting suspicious IP.
- Classifying event.
- Writing report.
- Policy check.

Say:

Every tool call and policy decision is visible. This is how we prove autonomy without losing control.

### 5. Safety Moment

Show approval request:

```text
block_ip 185.92.XX.XX
```

Say:

The agent wants to run a shell command. NemoClaw intercepts it because shell execution requires human approval.

Click or describe Deny.

Say:

The action is denied, logged, and saved to memory. The agent continues safely with a report-only workflow.

### 6. Final Report

Show final report:

- Severity: High.
- Threat: Brute-force login attempt.
- MITRE mapping: Credential Access.
- Policy result: shell command paused.
- Final decision: user denied execution.
- Memory update: future shell actions require explicit approval.

## Closing

ClawForge is the fastest way to build and safely deploy autonomous agents with OpenClaw, NemoClaw, Nemotron, and MiniMax-ready intelligence routing.

Judges should remember:

```text
Describe an agent. Generate it. Sandbox it. Run it.
```

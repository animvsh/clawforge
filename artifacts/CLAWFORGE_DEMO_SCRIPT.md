# ClawForge Demo Script — Show & Tell

**Event:** NVIDIA Hackathon Show & Tell
**Duration:** 3 minutes live demo + ~30 seconds closing
**Live URL:** http://localhost:8080 (or https://clawforge.aalang.workers.dev/)

---

## PREP (Before Judges Arrive)

1. Open http://localhost:8080 in browser
2. Open a second tab to `/api/blueprints` to show real provider response (provider_status: live)
3. Keep terminal with `npm run dev` visible to prove local dev is real

---

## 3-MINUTE SCRIPT

### 0:00 — Opening (30 sec)

> "Autonomous agents are powerful — but they can do damage before you know what they are doing. ClawForge solves this: describe a workflow, get a secured agent you can actually trust."

**Switch to browser — show landing page.**
Point to the hero: *"Build secure autonomous agents from one prompt."*
Point to the tech stack signals: **NemoClaw** policy enforcement, **NVIDIA Nemotron** reasoning, **live audit logs**, **approval gates**.

---

### 0:30 — Prompt to Blueprint (45 sec)

**Action:** In the builder, enter this exact prompt:

```
Create an agent that monitors system logs, detects suspicious behavior,
writes an incident report, and asks before executing commands.
```

**Action:** Click "Generate NemoClaw Blueprint."

**While it generates, say:**
> "ClawForge calls NVIDIA Nemotron to plan the agent — every tool, every policy, every memory rule gets generated from the prompt."

**Show the result:**
- Agent name: **SentinelClaw**
- Tools: Log Reader, Threat Classifier, Report Writer, Shell Executor
- Policy: shell.execute → **requires approval**
- Memory rules loaded

**Switch to `/api/blueprints` tab — show `provider_status: live`**

> "Nemotron is live. This isn't mock data."

---

### 1:15 — Deploy to Dashboard (45 sec)

**Action:** Click "Deploy Demo Agent."

**Action:** Click "Restart Demo Agent" if one is already running.

**As dashboard loads, say:**
> "Now SentinelClaw is running inside NemoClaw — the sandbox with policy guardrails."

**Point to the three-column layout:**
- Left: agent control
- Center: live audit stream (SSE)
- Right: policies + memory + sandbox panel

**Point to the audit stream:**
> "Every action is logged in real time. No black boxes."

---

### 2:00 — The Safety Moment (45 sec)

**Action:** Let the SSE stream run until you see the **approval required** card appear.

> "The agent found a suspicious IP and wants to block it with a shell command. NemoClaw intercepts this — shell.execute requires human approval."

**Click "Deny Command."**

**Point to what happened:**
- Command blocked and logged
- Memory saved: *future shell actions require explicit approval*
- Agent continues with report-only workflow

> "We just proved the policy works. The agent was stopped, not the human."

---

### 2:45 — Final Report (15 sec)

**Point to the incident report that appears.**

> "Final report: MITRE ATT&CK mapping, evidence, severity, recommendations — and it shows the blocked command so the security team knows what almost happened."

---

## CLOSING (15 sec)

> "ClawForge: describe an agent, generate it with Nemotron, sandbox it in NemoClaw, run it with live policy enforcement and full audit trail. Built on NVIDIA NIMs and Nemotron for agentic reasoning."

**Judge takeaway:**
> "Not just a prompt engine. A secure autonomous agent factory."

---

## WHAT TO PREPARE AHEAD OF TIME

- [ ] Browser open on landing page
- [ ] Dashboard open at `/dashboard`
- [ ] `/api/blueprints` showing `provider_status: live` in a second tab
- [ ] Have the approval card be the visual centerpiece of the demo
- [ ] Know where MITRE ATT&CK mapping shows in the final report

---

## JUDGING CRITERIA MAPPING

| Criterion | What to show |
|---|---|
| **Creativity** | ClawForge generates complete agent structure from one prompt — tools, policies, memory, all from a sentence |
| **Functionality** | Live SSE audit stream, real approval gate, memory persists across steps, incident report generates |
| **Scope of Completion** | Full prompt→blueprint→deploy→run→approval→report MVP |
| **Presentation** | This script is the presentation — 3 minutes, no deck, just live product |
| **Use of NVIDIA Tools** | Show `provider_status: live` on blueprints endpoint |
| **Use of NVIDIA Nemotron Models** | Blueprint generation calls real Nemotron — show it happening live |

---

## IF SOMETHING BREAKS

| Scenario | Recovery |
|---|---|
| SSE stream not loading | Show `/api/health` and `/api/agents/agent_sentinelclaw_demo/start` instead |
| Approval card doesn't appear | Walk through the approval flow in the code — show `runtime.ts` policy enforcement |
| Nemotron not live | Fall back to showing `/api/blueprints` response with `provider_status: fallback` — still proves the flow works, just in demo mode |
| Report doesn't appear | Show IncidentReport.tsx component in editor as proof of completion |
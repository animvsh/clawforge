# ClawForge API Examples

These examples are for local and deployed mock-mode testing.

Set a base URL:

```sh
BASE_URL=http://127.0.0.1:5173
# or
BASE_URL=https://clawforge.aalang.workers.dev
```

## Generate Blueprint

```sh
curl -sS "$BASE_URL/api/blueprints" \
  -H 'content-type: application/json' \
  -d '{
    "prompt": "Create an agent that monitors system logs, detects suspicious behavior, writes an incident report, and asks before executing commands.",
    "provider": "auto"
  }'
```

Expected highlights:

- `ok: true`
- `blueprint.agent_name: SentinelClaw`
- `blueprint.runtime: openclaw`
- `blueprint.sandbox: nemoclaw`
- `blueprint.provider: auto`
- tool permissions include `allowed`, `approval_required`, and `blocked`

## Deploy Agent

```sh
curl -sS "$BASE_URL/api/agents/deploy" \
  -H 'content-type: application/json' \
  -d '{"blueprint_id":"bp_sentinelclaw_demo"}'
```

Expected demo agent ID:

```text
agent_sentinelclaw_demo
```

## Stream Logs

```sh
curl -N "$BASE_URL/api/agents/agent_sentinelclaw_demo/logs/stream"
```

The stream emits Server-Sent Events with `RuntimeEvent` payloads.

## Resolve Approval

```sh
curl -sS "$BASE_URL/api/approvals/approval_shell_block_ip/decision" \
  -H 'content-type: application/json' \
  -d '{"decision":"denied"}'
```

Expected highlights:

- `approval.status: denied`
- response includes a memory update

## Get Memory

```sh
curl -sS "$BASE_URL/api/agents/agent_sentinelclaw_demo/memory"
```

Expected: at least 3 memory items.

## Get Report

```sh
curl -sS "$BASE_URL/api/agents/agent_sentinelclaw_demo/report"
```

Expected report fields:

- severity
- detected behavior
- MITRE mapping
- evidence
- actions attempted
- actions blocked
- approval decisions
- memory updates

## Production Smoke Checklist

Run after every deployment:

```sh
BASE_URL=https://clawforge.aalang.workers.dev

curl -sSI "$BASE_URL/" | sed -n '1,8p'
curl -sS "$BASE_URL/api/health"
curl -sS "$BASE_URL/api/blueprints" \
  -H 'content-type: application/json' \
  -d '{"prompt":"Create an agent that monitors logs and asks before commands.","provider":"auto"}'
curl -sS "$BASE_URL/api/agents/deploy" \
  -H 'content-type: application/json' \
  -d '{"blueprint_id":"bp_sentinelclaw_demo"}'
curl -sS "$BASE_URL/api/agents/agent_sentinelclaw_demo/memory"
curl -sS "$BASE_URL/api/agents/agent_sentinelclaw_demo/report"
curl -sS "$BASE_URL/api/approvals/approval_shell_block_ip/decision" \
  -H 'content-type: application/json' \
  -d '{"decision":"denied"}'
curl -N "$BASE_URL/api/agents/agent_sentinelclaw_demo/logs/stream" | sed -n '1,8p'
```

Expected:

- `/` returns `HTTP/2 200`.
- `/api/health` returns `ok: true`.
- Blueprint returns `SentinelClaw`.
- Deploy returns `agent_sentinelclaw_demo`.
- Memory returns at least 3 items.
- Report returns severity `high`.
- Approval deny returns status `denied`.
- SSE emits `agent.started` and tool/policy events.

Publish smoke-test results in Linear `ANU-31` after each production deployment.

# ClawForge

ClawForge is a one-prompt builder for secure autonomous agents. The current repo includes the live landing page, Cloudflare Worker deployment, shared ClawForge contracts, and a mock-functional API foundation for the hackathon demo flow.

Live app: https://clawforge.aalang.workers.dev/

Backend health: https://clawforge.aalang.workers.dev/api/health

GitHub repo: https://github.com/animvsh/clawforge

Linear project: https://linear.app/askdad/project/clawforge-c618a255248b

## Development

Install dependencies, then run the Vite dev server:

```sh
npm install
npm run dev
```

## Functional Demo API

The app supports mock-mode endpoints so frontend, backend, memory/report, and demo owners can work independently.

- `POST /api/blueprints`
- `POST /api/agents/deploy`
- `POST /api/agents/agent_sentinelclaw_demo/start`
- `POST /api/agents/agent_sentinelclaw_demo/stop`
- `GET /api/agents/agent_sentinelclaw_demo/logs/stream`
- `GET /api/agents/agent_sentinelclaw_demo/memory`
- `GET /api/agents/agent_sentinelclaw_demo/report`
- `GET /api/agents/agent_sentinelclaw_demo/audit`
- `GET /api/agents/agent_sentinelclaw_demo/approvals`
- `POST /api/approvals/approval_shell_block_ip/decision`
- `GET /api/security/health`
- `POST /api/demo/reset`

See `artifacts/CLAWFORGE_API_EXAMPLES.md` for curl examples.

## Durable Runtime And Safety

Local and Brev demo runs persist runtime state to `.runtime/clawforge-runtime.json`. The file stores
agent status, ordered audit records, memory items, approval requests, approval artifacts, and the
final report. The `.runtime/` directory is ignored by Git so demo state and generated artifacts do
not get committed.

The demo reset path is:

```sh
curl -X POST http://localhost:5173/api/demo/reset
```

Sandbox hardening can be checked with:

```sh
curl http://localhost:5173/api/security/health
```

The health check covers routed inference configuration, deny-by-default network/data export policy,
forbidden path scanning, secret redaction, audit logging, and elevated-mode configuration. Elevated
autonomous work stays disabled unless `CLAWFORGE_ELEVATED_MODE=1` and
`CLAWFORGE_ALLOW_ELEVATED_AUTONOMY=approved` are both set and hardening checks pass.

Runtime logs and audit metadata redact authorization headers, provider keys, tokens, and configured
secret values before they are stored or returned by the API.

## Team Workstreams

See `artifacts/CLAWFORGE_TEAM_HANDOFF.md` for the person-by-person split.

- Adithya: frontend product experience, builder, blueprint review, dashboard.
- pmgandhi: backend API, intelligence providers, runtime, policy engine.
- Edwin: memory, report, demo script, deployment verification.

Shared contracts live in `src/lib/clawforge/types.ts`.

## Scripts

- `npm run dev` - start local development
- `npm run build` - create a production build
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint

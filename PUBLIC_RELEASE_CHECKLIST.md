# Public Release Checklist

Before making this repository public:

- Keep real secrets only in Cloudflare, Railway, Supabase, Brev, or local `.env.local` files.
- Do not commit `.env`, `.env.local`, `.dev.vars`, `.runtime`, `dist`, `railway-dist`, or service-account files.
- Configure these in the hosting provider, not in Git:
  - `NVIDIA_API_KEY`
  - `MINIMAX_API_KEY` / `MINIMAX_PLAN_KEY`
  - `BREV_TOKEN`
  - `COMPOSIO_API_KEY`
  - `COMPOSIO_AUTH_CONFIG_*` values
  - `AGENTMAIL_API_KEY`
  - `VAPI_API_KEY` / `VAPI_PRIVATE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PIPEDREAM_*` secrets
- Public-safe values like placeholder env names are allowed in `.env.example`.
- Run the tracked-file secret scan before publishing:

```bash
git ls-files -z | xargs -0 rg -n --hidden --no-ignore -S \
  '(sk-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9_]{20,}|ak_[A-Za-z0-9_]{12,}|am_us_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)'
```

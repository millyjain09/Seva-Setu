# /server — Backend (Supabase Edge Functions + Postgres)

This folder is a **signpost**, not a code location. The Supabase CLI and
Lovable's auto-deploy require the backend to live under `../supabase/`, so the
real code is one level up.

There is no Express or Node HTTP server in this repo. The "backend" is:

1. **Deno edge functions** running on Supabase.
2. **Postgres** (schema in versioned SQL migrations) with Row Level Security.
3. **Supabase Storage** buckets (`avatars`, `health-reports`).
4. **Supabase Auth** (email + OTP + Google).

## Where the real code lives

| Concern              | Real path                                          |
| -------------------- | -------------------------------------------------- |
| Edge functions       | [`../supabase/functions/`](../supabase/functions/) |
| DB migrations        | [`../supabase/migrations/`](../supabase/migrations/) |
| Supabase config      | [`../supabase/config.toml`](../supabase/config.toml) |
| Function index       | [`./functions/README.md`](./functions/README.md)   |

## Secrets

Backend secrets (`LOVABLE_API_KEY`, `OPENWEATHER_API_KEY`, `DATA_GOV_IN_API_KEY`,
`VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY`, …) live in the **Supabase Edge Function
Secrets** store, not in `.env`. They are injected at runtime and read with
`Deno.env.get(...)`.

## Deploy

Edge functions auto-deploy on save in Lovable. To run locally:

```sh
supabase functions serve --env-file supabase/.env.local
```

See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full client ↔
server contract.
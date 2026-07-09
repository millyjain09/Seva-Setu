# SevaSetu — Architecture

SevaSetu is a single-repo app with a clear **client / server boundary**, even though everything lives in one Git repository (a requirement of the Lovable + Supabase platform).

```
seva-setu/
├── src/                      ← CLIENT  (React 18 + Vite + TS, runs in the browser)
├── supabase/
│   ├── functions/            ← SERVER  (Deno edge functions, run on Supabase)
│   ├── migrations/           ← Database schema (SQL)
│   └── config.toml           ← Edge function config
├── public/                   ← Static assets served by Vite
├── .env                      ← Public client config (VITE_* only)
└── docs/ARCHITECTURE.md      ← This file
```

## 1. Client (`/src`)

- **Stack:** React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, react-router, react-i18next, TanStack Query.
- **Auth:** Supabase Auth via `@/integrations/supabase/client`.
- **Data:** Reads/writes the Supabase Postgres DB through the JS client (RLS-enforced).
- **Server calls:** Invokes edge functions via `supabase.functions.invoke('<name>', { body })`. No direct `fetch` to backend URLs and no Express/Node server in this repo.
- **Env:** Only `VITE_*` variables in `.env` are exposed to the browser bundle. **Never** put private keys here.

## 2. Server (`/supabase/functions`)

Each subfolder is an independent Deno edge function, auto-deployed by Lovable on save.

| Function | Purpose | Secrets used |
|---|---|---|
| `chat` | AI conversation (Gemini via Lovable AI Gateway) | `LOVABLE_API_KEY` |
| `analyze-report` | OCR + AI analysis of uploaded health reports | `LOVABLE_API_KEY` |
| `check-eligibility` | Match user profile against gov schemes | `LOVABLE_API_KEY` |
| `refresh-schemes` | Pull latest schemes from data.gov.in | `DATA_GOV_IN_API_KEY` |
| `weather-health-tip` | Live weather + AI health tip | `OPENWEATHER_API_KEY`, `LOVABLE_API_KEY` |
| `send-daily-tip` | Scheduled push of daily tips | `OPENWEATHER_API_KEY`, `LOVABLE_API_KEY`, `VAPID_*` |
| `daily-health-reminders` | Scheduled reminder fan-out | `VAPID_*` |
| `send-push` | Web Push delivery (VAPID) | `VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY` |

- **Privileged access:** Functions use `SUPABASE_SERVICE_ROLE_KEY` server-side only. This key is **never** shipped to the client.
- **Secrets:** Managed in Supabase (Edge Function Secrets), not in `.env`. The local `.env` is not read by deployed functions.

## 3. Database

- Postgres (Supabase). Schema versioned in `supabase/migrations/`.
- **RLS on every public table.** Roles stored in `public.user_roles` (never on `profiles`); access checked via `has_role(uid, role)` security-definer function.
- Storage buckets: `health-reports` (private), `avatars` (private).

## 4. The client/server contract

```
 Browser (src/)
   │
   │  supabase-js   ──► Postgres + Auth + Storage   (RLS enforced)
   │
   │  functions.invoke('chat', { body })
   ▼
 Edge Function (supabase/functions/<name>)
   │
   ├─► Lovable AI Gateway  (LOVABLE_API_KEY)
   ├─► OpenWeather         (OPENWEATHER_API_KEY)
   ├─► data.gov.in         (DATA_GOV_IN_API_KEY)
   └─► Postgres via service role (bypasses RLS when needed)
```

**Rule:** any code that needs a private key, calls a 3rd-party paid API, or must bypass RLS belongs in `supabase/functions/`. Everything else belongs in `src/`.

## 5. Environment variables

`/.env` (committed, **public** values only — anything `VITE_*` is inlined into the JS bundle):

```
VITE_SUPABASE_URL="https://<project>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"
```

Private keys (`LOVABLE_API_KEY`, `OPENWEATHER_API_KEY`, `DATA_GOV_IN_API_KEY`, `VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, …) live **only** in Supabase Edge Function Secrets and are read at runtime with `Deno.env.get(...)`. They are never committed to `.env`.

## 6. Local dev

```sh
npm install
npm run dev          # Vite client at http://localhost:8080
```

Edge functions deploy automatically on save in Lovable. To run them locally:

```sh
supabase functions serve --env-file supabase/.env.local
```

(`supabase/.env.local` is gitignored and only used for local function dev.)

## 7. Why no `/client` + `/server` split?

Lovable + Supabase expects:
- A single Vite app at the repo root (`vite.config.ts`, `index.html`, `src/`).
- The `supabase/` folder at the repo root for CLI + auto-deploy.

Moving `src/` into `/client` or `supabase/` into `/server` breaks both the preview build and edge-function deploys. The boundary is **logical, not physical** — and this document is the source of truth for that boundary.

## 8. MERN-style view (`/client` and `/server` signposts)

For readability the repo also ships two top-level signpost folders:

- [`/client`](../client/README.md) — points at the frontend (`/src`, `/public`, `index.html`, Vite config).
- [`/server`](../server/README.md) — points at the backend (`/supabase/functions`, `/supabase/migrations`, `supabase/config.toml`), with a per-function index in [`/server/functions/README.md`](../server/functions/README.md).

They contain README files only — no code is moved, for the reasons in §7. Think of them as the "MERN-style entry points" reviewers can open first to understand where the client ends and the server begins.

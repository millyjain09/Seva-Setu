# /client — Frontend (React + Vite + TypeScript)

This folder is a **signpost**, not a code location. Lovable + Vite require the
frontend entry files to live at the repo root, so the real code is one level up.

## Where the real code lives

| Concern            | Real path                                      |
| ------------------ | ---------------------------------------------- |
| App source         | [`../src/`](../src/)                           |
| Pages              | [`../src/pages/`](../src/pages/)               |
| Components         | [`../src/components/`](../src/components/)     |
| Hooks              | [`../src/hooks/`](../src/hooks/)               |
| Contexts           | [`../src/contexts/`](../src/contexts/)         |
| i18n locales       | [`../src/i18n/`](../src/i18n/)                 |
| Supabase JS client | [`../src/integrations/supabase/`](../src/integrations/supabase/) |
| Static assets      | [`../public/`](../public/)                     |
| HTML entry         | [`../index.html`](../index.html)               |
| Build config       | `../vite.config.ts`, `../tailwind.config.ts`, `../tsconfig*.json` |
| Public env vars    | [`../.env`](../.env) (only `VITE_*`)           |

## Run

```sh
npm install
npm run dev        # http://localhost:8080
npm run build
```

## Talking to the backend

The client never `fetch`es a Node/Express URL — there isn't one. It talks to the
backend through the Supabase JS client:

```ts
import { supabase } from "@/integrations/supabase/client";

// Postgres (RLS-enforced)
await supabase.from("profiles").select("*");

// Edge functions ("server routes")
await supabase.functions.invoke("weather-health-tip", { body: { lat, lon } });
```

See [`../server/README.md`](../server/README.md) for the backend surface and
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the full contract.
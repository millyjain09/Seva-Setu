## Goal
Make the Super Admin "Schemes" tab fully functional (Add / Edit / Delete real DB records) and let admins choose whether users see **Admin-curated** schemes or **API-fetched** schemes on the user Scheme Navigator page.

## Database (single migration)
Extend `public.govt_schemes` with a source label and admin-curated visibility flag:

- Add column `source text NOT NULL DEFAULT 'api'` — allowed values `'api'` (from `refresh-schemes` edge function) or `'admin'` (manually added via Super Admin).
- Add column `is_active boolean NOT NULL DEFAULT true` — lets admin hide a scheme without deleting.
- Add column `updated_at timestamptz NOT NULL DEFAULT now()` + trigger.
- New table `public.app_settings` (single-row key/value) to store the global `scheme_source_mode` preference (`'admin' | 'api' | 'both'`, default `'both'`).
  - GRANT `SELECT` to `anon, authenticated`; `ALL` to `service_role`.
  - RLS: everyone can `SELECT`; only `has_role(auth.uid(), 'superadmin')` can `INSERT/UPDATE`.
- Add RLS policies on `govt_schemes` so SuperAdmin can `INSERT/UPDATE/DELETE`; public `SELECT` stays.
- Update `refresh-schemes` upsert to stamp `source = 'api'` (code change, next section).

## Super Admin — Schemes tab (`src/pages/superadmin/SuperAdminDashboard.tsx`)
Replace the hardcoded schemes block with a real, DB-backed panel:

1. **Source-mode selector** at top of the tab — segmented control with three options: `Admin-curated`, `API-fetched`, `Both`. Persists to `app_settings.scheme_source_mode`. This controls what users see in the Scheme Navigator.
2. **Filter tabs** inside the panel: `All | Admin | API` — filters the table below (independent of the user-visibility mode).
3. **Add Scheme** button opens a dialog with fields: Title, Description, Link, Category, State (optional), Eligibility JSON hint fields (age, income, ration_card, family_size). On submit → `INSERT` with `source='admin'`.
4. **Edit** button (works for both admin- and API-fetched rows) opens the same dialog pre-filled. On save → `UPDATE`.
5. **Delete** with confirm AlertDialog.
6. **Active toggle** per row (uses new `is_active` column).
7. Table columns: Title, Source badge (`Admin` / `API`), Category, Active, Actions. Fully responsive (reuses existing overflow-x-auto pattern).
8. Realtime already subscribes to `govt_schemes`; keep it.

## User side — Scheme Navigator (`src/pages/SchemeNavigator.tsx`)
- On load, read `app_settings.scheme_source_mode`.
- Query `govt_schemes` filtered by `is_active = true` AND source matching the mode (`admin`, `api`, or no source filter for `both`).
- Show a small chip near the header indicating current source (e.g. "Curated by Admin" / "Live from API" / "All sources").
- Hide the "Refresh" button when mode is `admin` (refreshing API data is irrelevant to end users in that mode).

## Edge function
- `supabase/functions/refresh-schemes/index.ts`: add `source: 'api'` to each scheme object in the upsert payload so API-fetched rows are correctly tagged.

## Out of scope
- No changes to Users, Analytics, Settings, or Audit tabs.
- No changes to the AI eligibility checker flow.

# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Product Portfolio (Budget Treemap Explorer) — a React 18 + TypeScript SPA for Dodo Brands that visualizes initiative budgets/stakeholders/timelines. Uses Vite 5 for dev server, Supabase (cloud-hosted) for database and Google OAuth auth. No backend server — the SPA talks directly to Supabase.

### Key commands

Standard commands are in `package.json` scripts and `README.md`:

- **Dev server:** `npm run dev` → http://localhost:8080 (Vite HMR)
- **Lint:** `npm run lint` (ESLint 9; the codebase has pre-existing warnings/errors)
- **Unit tests:** `npm run test` (Vitest, jsdom)
- **Build (dev mode):** `npm run build:dev`
- **Build (prod/GH Pages):** `npm run build`

### Environment variables

The app requires a `.env` file at the repo root (gitignored) with:

```
VITE_SUPABASE_URL=<supabase project url>
VITE_SUPABASE_PUBLISHABLE_KEY=<supabase anon key>
```

Without these, the dev server starts but shows only the auth page with a console warning. The Supabase client in `src/integrations/supabase/client.ts` gracefully handles missing env vars.

### Gotchas

- The lint command (`npm run lint`) exits with code 1 due to pre-existing lint errors in `shadcn/ui` generated components and other files. This is expected; do not treat it as a setup failure.
- Production build uses base path `/Product-Profiolio-DE/` (for GitHub Pages); dev mode uses `/`. The mode-based config is in `vite.config.ts`.
- Auth is restricted to `@dodobrands.io` Google accounts via a whitelist (`allowed_users` table in Supabase). Without valid Supabase credentials and an approved account, you can only see the login page.
- Playwright is listed as a dependency but no e2e tests exist yet (no `e2e/` directory).

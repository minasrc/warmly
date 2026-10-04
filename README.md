# Warmly

A privacy-first scheduling experience for friends. Warmly finds shared free time without exposing event names, guests, or calendar details.

## Stack

- React and TypeScript
- Vite
- Tailwind CSS
- shadcn/ui primitives
- React Aria date and calendar behavior
- Motion for the host journey animation
- Cloudflare Worker API with Hono
- Supabase Auth and Postgres
- Shared Temporal-based scheduling domain
- Vitest

The approved standalone design reference is kept in `design/approved-prototype.html`. Production UI lives in typed React components under `src/`; the prototype is not imported at runtime.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when connecting the frontend to local or hosted services. The fixture flow remains available without credentials.

The local database uses Supabase CLI:

```bash
supabase start
supabase db lint --local --level warning
```

The Worker lives in `worker/`:

```bash
npm --workspace @warmly/worker run dev
```

## Checks

```bash
npm run check
npm --workspace @warmly/worker run build
npm audit --omit=dev
```

The frontend still runs on fixture state until real service configuration is available. The Worker now implements authenticated plans, secure invitations, Google OAuth with PKCE, Vault-backed refresh tokens, calendar selection, aggregate FreeBusy candidates, guest response persistence, final availability rechecks, and idempotent event creation. These boundaries are locally tested; connecting the visible flow requires Supabase, Google OAuth, and Cloudflare configuration.

Additional production hardening includes distributed database-backed request limits, strict API security and no-store headers, privacy-safe audit events, Google token revocation with local Vault cleanup, and a tested frontend controller that keeps account sign-in separate from calendar authorization.

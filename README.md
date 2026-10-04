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

The development default is the design preview. Set `VITE_APP_MODE=preview` to review fixtures explicitly. The preview is labeled and never signs in, sends invitations, or creates events.

Copy `.env.example` to `.env.local` for `VITE_APP_MODE=live`, and supply the API URL, Supabase URL, and publishable key. Production defaults to live mode; missing configuration shows an error rather than silently displaying fixtures.

The local database uses Supabase CLI:

```bash
supabase start
supabase db lint --local --level warning
supabase test db
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
supabase test db
```

Live host and guest screens use the Worker API for identity, calendar selection and disconnects, plan creation, invitations, aggregate moments, saved guest responses, and bookings. Hosts can reopen previous plans, cancel unbooked plans, replace lost invitation links, and recover pending bookings. Accepted guests can reopen their link using the same account, including in a new browser session. Removed guests cannot restore membership using an old link.

Times are calculated in the plan's IANA timezone with Temporal. Daypart constraints and all-active-member overlap are enforced on the server. Provider errors are conservative: unverified calendars never count as available. Temporary refresh failures do not revoke a grant.

Booking requires a selected writable calendar and separate event permission. The Worker rechecks availability and uses a deterministic Google event ID. Pending retries reconcile provider state before calculating availability again, and database finalization records the event and books the plan atomically.

Additional production hardening includes distributed database-backed request limits, strict API security and no-store headers, privacy-safe audit events, Google token revocation with local Vault cleanup, and a tested frontend controller that keeps account sign-in separate from calendar authorization.

## Deployment boundaries

No live service deployment is configured. See `docs/ROADMAP.md` for the remaining account configuration and product decisions.

Vite emits Cloudflare Pages-compatible `_headers` and `_redirects`: SPA invitation/plan deep links, a configured-origin CSP, no-referrer, framing restrictions, and no-store HTML. Other static hosts must apply equivalent rules. Build with the intended frontend service URLs so the CSP allows the correct API and Supabase origins. The API deploys separately as a Worker.

Configure Supabase Auth's Google provider and frontend redirects, Google Cloud's separate Calendar OAuth client and Worker callback, and Worker bindings before live verification. Do not expose service-role keys or Google secrets through `VITE_*` variables. Hosting/monitoring must redact invitation paths and OAuth query parameters too; app log redaction does not automatically configure infrastructure logs.

Invitation delivery currently means copying a newly issued private link and sending it yourself. Automatic email delivery requires a provider choice and credentials. The UI says this explicitly.

# Staged launch runbook

Use a separate staging environment with test users and calendars before a public launch. Account setup, resource creation, deployment and production migrations require the owner's approval. Merging code does not approve those actions. If Supabase setup is deferred, preview development and local checks can continue, but live sign-in, calendar connection and booking cannot be verified.

## 1. Choose stable HTTPS origins

Record the frontend origin, Worker origin and Supabase origin before configuring OAuth. Service URLs must be origins, without credentials, paths, query strings or fragments. For example:

| Service | Example only |
| --- | --- |
| Frontend | `https://warmly-staging.example.com` |
| Worker | `https://warmly-api-staging.example.com` |
| Supabase | `https://PROJECT_REF.supabase.co` |

The Worker runs at the origin root, with its API under `/v1`. Separate staging and production resources, keys, OAuth callbacks and hostnames. Do not reuse real users' calendars as disposable test data.

## 2. Prepare Supabase when account setup resumes

Create the project in the owner's organization and approved region. Obtain its URL and publishable key (or legacy `anon` key). Keep the server key out of the browser and version control. The Worker binding is named `SUPABASE_SERVICE_ROLE_KEY`; it needs a server credential authorized for service-role database operations.

Run local migrations, schema lint and pgTAP tests first. Link only the intended new staging project, inspect the remote migration list and dry-run before applying:

```sh
supabase link --project-ref PROJECT_REF
supabase migration list --linked
supabase db push --linked --dry-run
# Only after confirming the target project and pending migrations:
supabase db push --linked
```

Do not run the database test fixtures against a production project. Confirm Vault and the explicit grants/RLS policies from the migrations are installed. Confirm the `anon` and `authenticated` roles cannot read Vault secrets or execute service-only workflow functions. No browser role should be given service-role access to make an integration test pass.

Set Supabase Auth's Site URL to the frontend origin and allow only the actual frontend return URLs used for host and invitation sign-in. Invitation sign-in returns to `/invite/:token`; plan recovery may return to `/plans/:planId`. If redirect wildcards are necessary for these dynamic paths, scope them to this exact host and path, not arbitrary preview hosts.

## 3. Configure identity and calendar OAuth separately

Enable Google Calendar API in the owner's Google Cloud project. Configure consent branding, audience and test users as appropriate. Testing-mode grants can expire; test reconnection rather than assuming perpetual access. Request only the scopes below and complete Google's required verification before general availability.

| Grant | Where the client secret belongs | Authorized Google callback |
| --- | --- | --- |
| Warmly sign-in | Supabase Auth's Google provider settings | The Supabase dashboard's callback, usually `https://PROJECT_REF.supabase.co/auth/v1/callback` |
| Calendar access | Worker `GOOGLE_CLIENT_SECRET` binding | `https://WORKER_ORIGIN/v1/calendar/google/callback` |

Use distinct Web application OAuth clients for these grants. The sign-in client uses Google's identity scopes; it does not request Calendar access. The calendar client requests `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly` and `https://www.googleapis.com/auth/calendar.freebusy`. Event creation separately adds `https://www.googleapis.com/auth/calendar.events` when the host books.

Set `GOOGLE_REDIRECT_URI` to the exact registered Worker callback. The frontend `/calendar-connected` route is not Google's registered callback: the Worker redirects there with a short-lived fragment, and the initiating Warmly session completes authorization. Connecting a different Google account is supported; do not require its email to equal the Warmly account email.

## 4. Configure Worker environments and secrets

The checked-in Wrangler defaults are local-development settings, not deployment settings. Add an explicit named environment to `worker/wrangler.jsonc` after the real origins are approved:

```jsonc
"env": {
  "staging": {
    "name": "warmly-api-staging",
    "vars": {
      "APP_ENV": "preview",
      "FRONTEND_URL": "https://warmly-staging.example.com",
      "SUPABASE_URL": "https://PROJECT_REF.supabase.co",
      "GOOGLE_CLIENT_ID": "CALENDAR_OAUTH_CLIENT_ID",
      "GOOGLE_REDIRECT_URI": "https://warmly-api-staging.example.com/v1/calendar/google/callback"
    }
  }
}
```

Replace the examples before deploying and configure the actual Worker hostname/route. Wrangler variables and secrets are environment-specific; do not assume the named environment inherits the development bindings. Store `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_CLIENT_SECRET` through secret bindings, never command-line arguments or committed files:

```sh
# Run in worker/. Each command securely prompts for one value.
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY --env staging
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging
npx wrangler deploy --env staging --dry-run
# Only after deployment approval and infrastructure-log review:
npx wrangler deploy --env staging
```

Use `APP_ENV=production` for an approved production environment. Both deployed modes require remote HTTPS frontend, Supabase and OAuth URLs. The staging Worker value `APP_ENV=preview` is unrelated to the frontend fixture mode: the staging frontend must still use `VITE_APP_MODE=live`.

Review Cloudflare request/invocation logs, static-host logs, analytics and error reporting before accepting real invitations or OAuth grants. Redact invitation tokens in paths and Google callback query parameters at every layer. Application log redaction alone does not protect infrastructure logs. Do not enable third-party scripts or broaden CSP to work around setup failures.

## 5. Build and host the live frontend

Use the four allowlisted public fields in the hosting build environment or an ignored `.env.local`:

```dotenv
VITE_APP_MODE=live
VITE_API_URL=https://warmly-api-staging.example.com
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Only a Supabase publishable key or legacy `anon` JWT belongs in the public-key field. Do not prefix server credentials with `VITE_`; Vite can include every such variable in the browser bundle, even if it is not explicitly read.

```sh
npm run check
npm --workspace @warmly/worker run build
npm audit --omit=dev --audit-level=high
npm run build:live
```

`build:live` rejects missing configuration, HTTP/loopback services, design-preview mode and unsafe public fields before publishing assets. It validates configuration, not provider reachability, key authenticity or OAuth consent. Ordinary `build` remains available for local/CI checks without accounts; its unconfigured live-mode output is not a launch-ready artifact.

Host `dist/` on the approved frontend origin. Cloudflare Pages can consume its `_headers` and `_redirects`; other hosts need equivalent CSP, no-referrer, no-store HTML and SPA routing. Refresh `/invite/:token`, `/plans/:planId` and `/calendar-connected` directly. Rebuild when service origins change because CSP and public configuration are build-time values. Do not attach a real invitation URL to a public issue, recording or diagnostic log.

## 6. Real-account acceptance gate

Use at least two consenting Warmly identities and disposable writable calendars:

1. Sign in as host and guest. Denied/expired consent must be recoverable without exposing credentials.
2. Connect multiple Google accounts, including one with a different email from the Warmly identity. An OAuth completion from the wrong Warmly identity must fail without consuming the initiating user's state.
3. Select multiple calendars, persist an empty selection without disconnecting, reselect, disconnect and test reconnection after grant revocation.
4. Create a plan in an explicit timezone. Invite the guest, refresh/reopen the private link, select several shared moments and submit once. Lost-link replacement and revoked/expired invitations must behave correctly.
5. Inspect browser network responses and relevant logs: no refresh tokens, raw event payloads, event names, guests or individual busy intervals should be present. Use distinctive synthetic event names to make leaks detectable.
6. Change availability before confirmation. The Worker must reject stale candidates. Book into a selected writable calendar, retry the same request and verify exactly one provider event exists. A read-only first account must not hide another eligible writable account.
7. Verify booked/cancelled states, pending-booking recovery and plan refresh. Exercise keyboard navigation, date-picker focus return, narrow screens, dark mode and reduced motion.

Local unit, pgTAP and fake-service browser tests remain separate evidence; they cannot replace these live checks. A `/health` response proves configuration/request handling only, not Google consent or a completed booking.

## Public-launch decisions still required

- Approved privacy/terms copy, support destination and Google consent verification.
- Retention/deletion/backup policy before destructive jobs or deletion guarantees.
- Monitoring/log-redaction controls and alert recipients; profile rate-limit cleanup before changing its architecture.
- Email provider, sender identity and credentials if automatic invitation delivery is required. Manual private-link copying remains the current delivery path.
- Explicit production deployment approval after real-account acceptance passes.

## References

- [Supabase API key types](https://supabase.com/docs/guides/api/api-keys)
- [Supabase Google sign-in setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls)
- [Google Calendar OAuth](https://developers.google.com/workspace/calendar/api/guides/auth)
- [Cloudflare Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

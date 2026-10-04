# Security

Please report security issues privately to the repository owner rather than opening a public issue.

Warmly must never store OAuth codes, access tokens, refresh tokens, authorization headers, or provider payloads in logs. Production refresh tokens and PKCE verifiers belong in encrypted server-side secret storage, and calendar details must not be returned to the browser.

Google availability access is limited to CalendarList and FreeBusy scopes. Event-write access is requested separately when a host confirms a booking. Refresh tokens and PKCE verifiers are referenced by Vault secret IDs, invitation and OAuth state tokens are persisted only as SHA-256 hashes, and the browser receives aggregate candidate moments rather than individual busy intervals.

API responses use no-store, content-type, framing, referrer, permissions, and transport security headers. Request throttling uses short-lived SHA-256 request buckets instead of raw network addresses. Calendar disconnect revokes the Google grant before clearing selected calendars and replacing the stored Vault secret with an empty value.

Audit metadata is intentionally allowlisted. It may contain internal identifiers and counts, but never email addresses, calendar names, event details, OAuth material, provider responses, or authorization headers.

Public candidate responses contain times and aggregate counts, never participant identifiers. The browser retains newly issued invitation URLs only in component memory; replacing a lost link revokes the old one. Invitation paths are redacted in Worker logs, and frontend referrers are disabled.

Supabase's default function grants are explicitly revoked for both browser roles. Only membership-checked user functions are granted back to authenticated users; OAuth/Vault, rate-limit, and booking-finalization functions remain server-only. Regression tests check actual privileges, including direct Vault access. Hosts cannot directly insert membership rows or restore removed members. Invitation hashes can only be written through authorized Worker routes, and disconnects cannot bypass server-side revocation/cleanup through direct table deletion.

An accepted invitation may be resolved again only by its original authenticated recipient while their membership remains active. Resolution does not repeat acceptance or restore removed consent.

Calendar OAuth completion requires the authenticated Warmly identity that initiated the one-time state. The public callback does not exchange codes or save grants. It returns the short-lived code in a URL fragment, which is not sent to the static host; the frontend immediately clears that fragment and submits the code through the authenticated API. Connecting a different Google account is intentional; Google account email does not need to match the Warmly sign-in email. Provider tokens and the PKCE verifier still remain server-side.

Plan status transitions, booking reservations, and finalization lock the same plan row. Cancellation cannot proceed after a booking is reserved, and reservation cannot proceed after cancellation. Browser roles cannot update plan status or mutate guest response tables. Guest submission goes through a service-only RPC after the Worker verifies every choice against current candidates; there is no browser-callable response mutation shortcut.

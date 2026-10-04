# Security

Please report security issues privately to the repository owner rather than opening a public issue.

Warmly must never store OAuth codes, access tokens, refresh tokens, authorization headers, or provider payloads in logs. Production refresh tokens and PKCE verifiers belong in encrypted server-side secret storage, and calendar details must not be returned to the browser.

Google availability access is limited to CalendarList and FreeBusy scopes. Event-write access is requested separately when a host confirms a booking. Refresh tokens and PKCE verifiers are referenced by Vault secret IDs, invitation and OAuth state tokens are persisted only as SHA-256 hashes, and the browser receives aggregate candidate moments rather than individual busy intervals.

API responses use no-store, content-type, framing, referrer, permissions, and transport security headers. Request throttling uses short-lived SHA-256 request buckets instead of raw network addresses. Calendar disconnect revokes the Google grant before clearing selected calendars and replacing the stored Vault secret with an empty value.

Audit metadata is intentionally allowlisted. It may contain internal identifiers and counts, but never email addresses, calendar names, event details, OAuth material, provider responses, or authorization headers.

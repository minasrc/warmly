# Security

Please report security issues privately to the repository owner rather than opening a public issue.

Warmly must never store OAuth codes, access tokens, refresh tokens, authorization headers, or provider payloads in logs. Production refresh tokens and PKCE verifiers belong in encrypted server-side secret storage, and calendar details must not be returned to the browser.

Google availability access is limited to CalendarList and FreeBusy scopes. Event-write access is requested separately when a host confirms a booking. Refresh tokens and PKCE verifiers are referenced by Vault secret IDs, invitation and OAuth state tokens are persisted only as SHA-256 hashes, and the browser receives aggregate candidate moments rather than individual busy intervals.

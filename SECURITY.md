# Security

Please report security issues privately to the repository owner rather than opening a public issue.

Warmly must never store OAuth codes, access tokens, refresh tokens, authorization headers, or provider payloads in logs. Production refresh tokens and PKCE verifiers belong in encrypted server-side secret storage, and calendar details must not be returned to the browser.

# Warmly production roadmap

## Architecture

```
React web app
  -> authenticated Worker API
      -> Supabase Postgres and Vault
      -> Google Calendar OAuth, CalendarList, FreeBusy, Events
```

The browser owns presentation and user input. It never receives provider refresh tokens, raw provider payloads, or another participant's busy intervals. The Worker owns authorization, OAuth, calendar orchestration, candidate calculation, and event creation. Postgres owns durable product state; Vault owns refresh tokens.

## Phase 1: foundations

Work that does not require external credentials:

1. Shared typed contracts for plans, participants, busy intervals, candidate slots, and quorum.
2. Timezone-safe slot generation and overlap scoring with deterministic tests.
3. Supabase tables, constraints, indexes, helper functions, and row-level security.
4. Cloudflare Worker project with validated environment bindings, request IDs, structured errors, and redacted logging.
5. Calendar provider interface plus a Google implementation boundary.
6. Frontend API adapter and runtime configuration validation.
7. CI for lint, tests, type checking, production builds, and dependency audit.

## Phase 2: identity and invitations

1. Configure Supabase Auth with Google sign-in.
2. Replace fixture identity with authenticated sessions.
3. Create plans and host memberships through the Worker.
4. Issue single-use, expiring, revocable invitation tokens tied to normalized email addresses.
5. Implement invitation acceptance and immediate membership revocation.
6. Persist guest responses and expose only aggregate response state.

Requires: Supabase project URL and publishable key, production application URLs, and email-delivery provider selection.

## Phase 3: calendar connections

1. Configure a separate Google OAuth grant for calendar access.
2. Implement state and PKCE validation, callback handling, and server-side token exchange.
3. Store encrypted refresh tokens in Supabase Vault.
4. List calendars and let each user select multiple calendars.
5. Request only CalendarList and FreeBusy scopes first, then request event-write access at booking time.
6. Add reconnect, disconnect, token rotation, and revoked-grant handling.

Requires: Google Cloud project, OAuth consent-screen configuration, client ID and secret, and approved callback URLs.

## Phase 4: availability and ranking

1. Fetch Google FreeBusy data through the Worker.
2. Merge each participant's selected calendars before group comparison.
3. Generate candidates in the host's local wall-clock zone, store instants in UTC, and preserve IANA zones.
4. Apply duration, date range, host daypart constraints, participant preferences, and quorum.
5. Cache availability briefly without persisting event details.
6. Return aggregate candidate suggestions only.
7. Cover daylight-saving gaps, folds, month boundaries, and partial-provider failures.

## Phase 5: confirmation and booking

1. Recheck availability immediately before booking.
2. Acquire an idempotent booking lock.
3. Request event-write permission only when the host books.
4. Create the event with the host as organizer and invite confirmed participants.
5. Persist provider event IDs and an audit record without storing private event payloads.
6. Handle retries, duplicate submissions, provider failures, and changed availability.

## Phase 6: launch hardening

1. End-to-end tests for host, guest, mobile, dark mode, keyboard use, and OAuth error paths.
2. Accessibility audit and reduced-motion verification.
3. Rate limits, abuse controls, security headers, CSP, CORS allowlist, and secret-redaction tests.
4. Database migration checks, backup policy, retention policy, and account deletion.
5. Cloudflare preview and production deployments.
6. Privacy policy, terms, support path, and operational monitoring.

Requires: Cloudflare account and domains, legal copy, retention decisions, and launch approval.

## Definition of done

A production release is complete when two real users can authenticate, connect multiple calendars, accept a private invitation, receive only aggregate shared candidates, submit preferences, and have the host create exactly one revalidated calendar event without exposing calendar details in the browser, database, or logs.

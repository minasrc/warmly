import { Hono } from "hono"
import { z } from "zod"
import type { AppEnvironment } from "../context"
import { createPkce, createSecretToken, sha256Bytea } from "../crypto/tokens"
import { parseEnvironment } from "../env"
import { HttpError } from "../http-error"
import { requireUser } from "../middleware/auth"
import { createAdminClient } from "../supabase"
import { GoogleOAuthClient } from "../calendar/google-oauth"
import { writeAuditEvent } from "../audit"
import { parseJson } from "../validation"

const completionSchema = z.object({
  state: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  code: z.string().min(1).max(4096),
})

export const googleOAuth = new Hono<AppEnvironment>()

googleOAuth.post("/authorize", requireUser, async (context) => {
  const access = context.req.query("access") === "booking" ? "booking" : "availability"
  const environment = parseEnvironment(context.env)
  const state = createSecretToken()
  const stateHash = await sha256Bytea(state)
  const { verifier, challenge } = await createPkce()
  const admin = createAdminClient(context.env)
  const { error } = await admin.rpc("store_oauth_state", {
    oauth_user_id: context.get("user").id,
    oauth_provider: "google",
    oauth_state_hash: stateHash,
    oauth_code_verifier: verifier,
    oauth_redirect_uri: environment.GOOGLE_REDIRECT_URI,
    oauth_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    oauth_authorization_kind: access,
  })
  if (error) throw new HttpError(500, "internal_error", "Calendar connection could not be started")

  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  return context.json({ authorizationUrl: oauth.authorizationUrl(state, challenge, access) })
})

googleOAuth.get("/callback", async (context) => {
  const input = completionSchema.safeParse({ state: context.req.query("state"), code: context.req.query("code") })
  if (!input.success) throw new HttpError(400, "bad_request", "Google callback is incomplete")
  const redirect = new URL("/calendar-connected", parseEnvironment(context.env).FRONTEND_URL)
  redirect.hash = new URLSearchParams({ state: input.data.state, code: input.data.code }).toString()
  return context.redirect(redirect.toString(), 303)
})

googleOAuth.post("/complete", requireUser, async (context) => {
  const { state, code } = await parseJson(context.req.raw, completionSchema)
  const userId = context.get("user").id

  const admin = createAdminClient(context.env)
  const stateHash = await sha256Bytea(state)
  const { data, error } = await admin.rpc("consume_oauth_state", {
    oauth_state_hash: stateHash, requested_user_id: userId,
  })
  if (error || !Array.isArray(data) || !data[0]) {
    throw new HttpError(400, "bad_request", "Google authorization state is invalid or expired")
  }
  const consumed = data[0] as {
    oauth_user_id: string
    oauth_code_verifier: string
    oauth_redirect_uri: string
  }
  const environment = parseEnvironment(context.env)
  const oauth = new GoogleOAuthClient({
    clientId: environment.GOOGLE_CLIENT_ID,
    clientSecret: environment.GOOGLE_CLIENT_SECRET,
    redirectUri: environment.GOOGLE_REDIRECT_URI,
  })
  const tokens = await oauth.exchangeCode(code, consumed.oauth_code_verifier, consumed.oauth_redirect_uri)
  if (!tokens.refresh_token) {
    throw new HttpError(409, "conflict", "Google did not return offline calendar access")
  }
  const identity = await oauth.identity(tokens.access_token)
  const { error: saveError } = await admin.rpc("save_google_calendar_connection", {
    connection_user_id: userId,
    google_account_id: identity.sub,
    google_account_email: identity.email.toLowerCase(),
    google_refresh_token: tokens.refresh_token,
    google_granted_scopes: tokens.scope.split(" ").filter(Boolean),
  })
  if (saveError) throw new HttpError(500, "internal_error", "Calendar connection could not be saved")
  await writeAuditEvent(context.env, {
    action: "calendar.connected",
    actorId: userId,
    requestId: context.get("requestId"),
    metadata: { provider: "google" },
  })

  return context.json({ connected: true })
})

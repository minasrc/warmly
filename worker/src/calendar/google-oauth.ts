import { z } from "zod"
import { HttpError } from "../http-error"
import { providerFetch } from "./provider-fetch"

export class GoogleGrantError extends HttpError {
  constructor() { super(409, "provider_error", "Calendar connection needs to be reconnected") }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive(),
  scope: z.string().default(""),
  token_type: z.string(),
})

const identitySchema = z.object({
  sub: z.string().min(1),
  email: z.email(),
  email_verified: z.boolean(),
})

export type GoogleOAuthConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class GoogleOAuthClient {
  constructor(
    private readonly config: GoogleOAuthConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  authorizationUrl(state: string, challenge: string, access: "availability" | "booking") {
    const calendarScopes = access === "booking"
      ? ["https://www.googleapis.com/auth/calendar.events"]
      : [
          "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
          "https://www.googleapis.com/auth/calendar.freebusy",
        ]
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: [
        "openid",
        "email",
        ...calendarScopes,
      ].join(" "),
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString()
    return url.toString()
  }

  async exchangeCode(code: string, codeVerifier: string, redirectUri: string) {
    const response = await providerFetch(this.fetcher, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
      }),
    })
    if (!response.ok) throw new HttpError(502, "provider_error", "Google authorization failed")
    return tokenSchema.parse(await response.json())
  }

  async identity(accessToken: string) {
    const response = await providerFetch(this.fetcher, "https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) throw new HttpError(502, "provider_error", "Google identity could not be verified")
    const identity = identitySchema.parse(await response.json())
    if (!identity.email_verified) throw new HttpError(403, "forbidden", "Google email is not verified")
    return identity
  }

  async refresh(refreshToken: string) {
    const response = await providerFetch(this.fetcher, "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: string } | null
      if (response.status === 400 && failure?.error === "invalid_grant") throw new GoogleGrantError()
      throw new HttpError(502, "provider_error", "Google session could not be refreshed")
    }
    return tokenSchema.omit({ refresh_token: true }).parse(await response.json())
  }

  async revoke(refreshToken: string) {
    const response = await providerFetch(this.fetcher, "https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    })
    if (!response.ok && response.status !== 400) {
      throw new HttpError(502, "provider_error", "Google calendar access could not be revoked")
    }
  }
}

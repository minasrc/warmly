import { z } from "zod"

export type Bindings = {
  APP_ENV: string
  FRONTEND_URL: string
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REDIRECT_URI: string
}

function isServiceOrigin(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
}

const httpUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return !url.username && !url.password && !url.search && !url.hash
})
const serviceOrigin = httpUrl.refine(isServiceOrigin)

function isLoopbackHost(hostname: string) {
  const host = hostname.replace(/\.$/, "")
  return ["localhost", "0.0.0.0", "[::]", "[::1]"].includes(host) ||
    host.endsWith(".localhost") || /^127\./.test(host) || /^\[::ffff:7f[\da-f]{2}:/.test(host)
}

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "preview", "production"]),
  FRONTEND_URL: serviceOrigin.transform((value) => new URL(value).origin),
  SUPABASE_URL: serviceOrigin,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GOOGLE_CLIENT_ID: z.string().min(5),
  GOOGLE_CLIENT_SECRET: z.string().min(5),
  GOOGLE_REDIRECT_URI: httpUrl.refine((value) => URL.canParse(value) && new URL(value).pathname === "/v1/calendar/google/callback"),
}).superRefine((environment, context) => {
  if (environment.APP_ENV === "development") return
  for (const key of ["FRONTEND_URL", "SUPABASE_URL", "GOOGLE_REDIRECT_URI"] as const) {
    if (!URL.canParse(environment[key])) continue
    const url = new URL(environment[key])
    if (url.protocol !== "https:" || isLoopbackHost(url.hostname)) {
      context.addIssue({ code: "custom", path: [key], message: "Deployed services require remote HTTPS URLs" })
    }
  }
})

export function parseEnvironment(bindings: Bindings) {
  return environmentSchema.parse(bindings)
}

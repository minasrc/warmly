import { z } from "zod"

function isServiceOrigin(value: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return ["http:", "https:"].includes(url.protocol) &&
    !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
}

function isPublicSupabaseKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true
  const parts = value.split(".")
  if (parts.length !== 3) return false
  try {
    const payload: unknown = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")))
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "anon"
  } catch {
    return false
  }
}

const serviceOrigin = z.url().refine(isServiceOrigin)
const publicEnvironmentSchema = z.object({
  VITE_API_URL: serviceOrigin,
  VITE_SUPABASE_URL: serviceOrigin,
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20).refine(isPublicSupabaseKey),
})

export type PublicEnvironment = {
  apiUrl: string
  supabaseUrl: string
  supabasePublishableKey: string
}

export function parsePublicEnvironment(source: Record<string, unknown>): PublicEnvironment {
  const result = publicEnvironmentSchema.safeParse(source)
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
    throw new Error(`Invalid public environment: ${fields}`)
  }
  return {
    apiUrl: result.data.VITE_API_URL,
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabasePublishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  }
}

export function getPublicEnvironment() {
  return parsePublicEnvironment(import.meta.env)
}

export function assertPublicBuildEnvironment(source: Record<string, unknown>) {
  const publicKeys = [...Object.keys(publicEnvironmentSchema.shape), "VITE_APP_MODE"]
  const unexpected = Object.keys(source).filter((key) => key.startsWith("VITE_") && !publicKeys.includes(key))
  if (unexpected.length) throw new Error(`Unapproved public environment fields: ${unexpected.join(", ")}`)
  const result = publicEnvironmentSchema.partial().safeParse(source)
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ")
    throw new Error(`Invalid public environment: ${fields}`)
  }
  appMode(source)
}

export function assertLiveBuildEnvironment(source: Record<string, unknown>) {
  assertPublicBuildEnvironment(source)
  if (appMode({ ...source, PROD: true }) !== "live") {
    throw new Error("Live builds cannot use design-preview mode")
  }
  const environment = parsePublicEnvironment(source)
  for (const key of ["VITE_API_URL", "VITE_SUPABASE_URL"]) {
    const url = new URL(source[key] as string)
    if (url.protocol !== "https:" || isLoopbackHost(url.hostname)) {
      throw new Error(`Live builds require a remote HTTPS origin for ${key}`)
    }
  }
  return environment
}

function isLoopbackHost(hostname: string) {
  const host = hostname.replace(/\.$/, "")
  return ["localhost", "0.0.0.0", "[::]", "[::1]"].includes(host) ||
    host.endsWith(".localhost") || /^127\./.test(host) || /^\[::ffff:7f[\da-f]{2}:/.test(host)
}

export function appMode(source: Record<string, unknown>) {
  const mode = source.VITE_APP_MODE
  if (mode === "preview" || mode === "live") return mode
  if (mode !== undefined && mode !== "") throw new Error("VITE_APP_MODE must be live or preview")
  return source.PROD ? "live" : "preview"
}

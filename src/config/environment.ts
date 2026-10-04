import { z } from "zod"

const publicEnvironmentSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
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

export function appMode(source: Record<string, unknown>) {
  const mode = source.VITE_APP_MODE
  if (mode === "preview" || mode === "live") return mode
  if (mode !== undefined && mode !== "") throw new Error("VITE_APP_MODE must be live or preview")
  return source.PROD ? "live" : "preview"
}

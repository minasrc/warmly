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

const environmentSchema = z.object({
  APP_ENV: z.enum(["development", "preview", "production"]),
  FRONTEND_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GOOGLE_CLIENT_ID: z.string().min(5),
  GOOGLE_CLIENT_SECRET: z.string().min(5),
  GOOGLE_REDIRECT_URI: z.url(),
})

export function parseEnvironment(bindings: Bindings) {
  return environmentSchema.parse(bindings)
}

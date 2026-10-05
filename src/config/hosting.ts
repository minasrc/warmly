export function frontendHeaders(environment: Record<string, unknown>) {
  const origins = new Set<string>(["'self'"])
  for (const key of ["VITE_API_URL", "VITE_SUPABASE_URL"]) {
    const value = environment[key]
    if (typeof value !== "string" || !value) continue
    const url = new URL(value)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid frontend service URL")
    origins.add(url.origin)
    if (key === "VITE_SUPABASE_URL") origins.add(url.origin.replace(/^http/, "ws"))
  }
  const policy = [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", "font-src 'self'", `connect-src ${[...origins].join(" ")}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
  ].join("; ")
  return [
    "/*", `  Content-Security-Policy: ${policy}`, "  Referrer-Policy: no-referrer",
    "  X-Content-Type-Options: nosniff", "  X-Frame-Options: DENY",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "  Strict-Transport-Security: max-age=31536000",
    "  Cache-Control: no-store", "/assets/*", "  Cache-Control: public, max-age=31536000, immutable", "",
  ].join("\n")
}

export function createSecretToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes))
  return base64Url(value)
}

export async function sha256Bytea(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return `\\x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

export async function createPkce() {
  const verifier = createSecretToken(64)
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

function base64Url(value: Uint8Array) {
  const binary = Array.from(value, (byte) => String.fromCharCode(byte)).join("")
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

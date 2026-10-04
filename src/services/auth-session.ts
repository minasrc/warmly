export interface AuthSession {
  getAccessToken(): Promise<string | null>
}

export const anonymousSession: AuthSession = {
  getAccessToken: async () => null,
}

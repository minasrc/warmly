import { describe, expect, it, vi } from "vitest"
import { ProductionController } from "./production-controller"

function createController() {
  const api = {
    beginGoogleAuthorization: vi.fn(async () => ({ authorizationUrl: "https://accounts.google.test/auth" })),
    acceptInvitation: vi.fn(async () => ({ planId: "plan-1" })),
    getCandidateMoments: vi.fn(async () => ({ candidates: [{ start: "2026-10-12T13:00:00Z" }] })),
  }
  const auth = {
    auth: {
      signInWithOAuth: vi.fn(async () => ({ data: { provider: "google", url: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
  const navigate = vi.fn()
  return {
    api,
    auth,
    navigate,
    controller: new ProductionController(
      api as never,
      auth as never,
      navigate,
    ),
  }
}

describe("ProductionController", () => {
  it("keeps identity sign-in separate from calendar authorization", async () => {
    const { controller, auth, api, navigate } = createController()
    await controller.signInWithGoogle("https://warmly.test/auth/callback")
    expect(auth.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://warmly.test/auth/callback" },
    })
    expect(api.beginGoogleAuthorization).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it("uses the server-generated calendar authorization URL", async () => {
    const { controller, api, navigate } = createController()
    await controller.connectGoogleCalendar("availability")
    expect(api.beginGoogleAuthorization).toHaveBeenCalledWith("availability")
    expect(navigate).toHaveBeenCalledWith("https://accounts.google.test/auth")
  })

  it("accepts a guest invitation before loading aggregate moments", async () => {
    const { controller, api } = createController()
    const result = await controller.acceptInvitationAndLoadMoments("invite-token")
    expect(api.acceptInvitation).toHaveBeenCalledWith("invite-token")
    expect(api.getCandidateMoments).toHaveBeenCalledWith("plan-1")
    expect(result.planId).toBe("plan-1")
  })
})

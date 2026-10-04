import type { SupabaseClient } from "@supabase/supabase-js"
import { getPublicEnvironment } from "@/config/environment"
import { ApiClient } from "./api-client"
import { getSupabaseClient, supabaseSession } from "./supabase"

type Navigator = (url: string) => void
type AuthGateway = Pick<SupabaseClient, "auth">

export type Identity = { id: string; email: string }

export class ProductionController {
  readonly api: ApiClient
  private readonly auth: AuthGateway
  private readonly navigate: Navigator

  constructor(
    api: ApiClient,
    auth: AuthGateway,
    navigate: Navigator = (url) => window.location.assign(url),
  ) {
    this.api = api
    this.auth = auth
    this.navigate = navigate
  }

  async signInWithGoogle(redirectTo: string) {
    const { error } = await this.auth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    })
    if (error) throw error
  }

  async signOut() {
    const { error } = await this.auth.auth.signOut()
    if (error) throw error
  }

  async getIdentity(): Promise<Identity | null> {
    const { data, error } = await this.auth.auth.getSession()
    if (error) throw error
    const user = data.session?.user
    return user ? { id: user.id, email: user.email ?? "" } : null
  }

  observeIdentity(listener: (identity: Identity | null) => void) {
    const { data } = this.auth.auth.onAuthStateChange((_event, session) => {
      listener(session ? { id: session.user.id, email: session.user.email ?? "" } : null)
    })
    return () => data.subscription.unsubscribe()
  }

  async connectGoogleCalendar(access: "availability" | "booking" = "availability") {
    const { authorizationUrl } = await this.api.beginGoogleAuthorization(access)
    this.navigate(authorizationUrl)
  }

  async acceptInvitationAndLoadMoments(token: string) {
    const { planId } = await this.api.acceptInvitation(token)
    const { candidates } = await this.api.getCandidateMoments(planId)
    return { planId, candidates }
  }
}

let productionController: ProductionController | undefined

export function getProductionController() {
  if (productionController) return productionController
  const environment = getPublicEnvironment()
  productionController = new ProductionController(
    new ApiClient(environment.apiUrl, supabaseSession),
    getSupabaseClient(),
  )
  return productionController
}

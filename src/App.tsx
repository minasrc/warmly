import { lazy, Suspense, useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GuestFlow } from "@/features/scheduling/guest-flow"
import { HostFlow } from "@/features/scheduling/host-flow"
import type { HostStep } from "@/features/scheduling/model"
import { appMode } from "@/config/environment"
import { Shell } from "@/features/scheduling/host-flow"

const LiveApp = lazy(() => import("@/features/scheduling/live-app"))

type GuestStep = "invite" | "moments"

function readRoute(): { mode: "host"; step: HostStep } | { mode: "guest"; step: GuestStep } {
  if (window.location.hash === "#guest-moments") return { mode: "guest", step: "moments" }
  if (window.location.hash === "#guest") return { mode: "guest", step: "invite" }
  return { mode: "host", step: "sign-in" }
}

function App() {
  const [production] = useState(() => {
    try {
      if (appMode(import.meta.env) === "preview") return { live: false } as const
      return { live: true } as const
    } catch (failure) {
      return { live: true, error: failure instanceof Error ? failure.message : "App configuration is invalid" } as const
    }
  })
  const [route, setRoute] = useState(readRoute)
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches)

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute())
    window.addEventListener("hashchange", syncRoute)
    return () => window.removeEventListener("hashchange", syncRoute)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  const openGuest = (step: GuestStep) => {
    window.location.hash = step === "moments" ? "guest-moments" : "guest"
  }

  const exitGuest = () => {
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    setRoute({ mode: "host", step: "invite" })
  }

  return (
    <TooltipProvider>
      <div className="min-h-dvh bg-background text-foreground">
        {production.live ? (
          "error" in production ? <main className="grid min-h-dvh place-items-center px-4"><Shell title="Warmly isn’t configured yet."><p role="alert" className="text-center text-sm">{production.error}</p></Shell></main>
            : <Suspense fallback={<p role="status" className="grid min-h-dvh place-items-center">Loading Warmly...</p>}><LiveApp dark={dark} onDarkChange={setDark} /></Suspense>
        ) : route.mode === "guest" ? (
          <GuestFlow initialStep={route.step} onStepChange={openGuest} onExit={exitGuest} />
        ) : (
          <HostFlow
            step={route.step}
            onStepChange={(step) => setRoute({ mode: "host", step })}
            onPreviewGuest={() => openGuest("invite")}
            dark={dark}
            onDarkChange={setDark}
          />
        )}
        {!production.live ? <p className="px-4 pb-3 text-center text-[10px] text-muted-foreground">Design preview. No real sign-in, invitations, or calendar events.</p> : null}
      </div>
    </TooltipProvider>
  )
}

export default App

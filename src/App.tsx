import { useEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GuestFlow } from "@/features/scheduling/guest-flow"
import { HostFlow } from "@/features/scheduling/host-flow"
import type { HostStep } from "@/features/scheduling/model"

type GuestStep = "invite" | "moments"

function readRoute(): { mode: "host"; step: HostStep } | { mode: "guest"; step: GuestStep } {
  if (window.location.hash === "#guest-moments") return { mode: "guest", step: "moments" }
  if (window.location.hash === "#guest") return { mode: "guest", step: "invite" }
  return { mode: "host", step: "sign-in" }
}

function App() {
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
        {route.mode === "guest" ? (
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
      </div>
    </TooltipProvider>
  )
}

export default App

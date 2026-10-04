import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { GuestFlow } from "@/features/scheduling/guest-flow"
import { HostFlow } from "@/features/scheduling/host-flow"
import type { HostStep } from "@/features/scheduling/model"
import { appMode } from "@/config/environment"
import { Shell } from "@/features/scheduling/host-flow"
import { AppHeader } from "@/components/warmly/app-header"
import { readThemePreference, themeStorageKey } from "@/config/theme"

const LiveApp = lazy(() => import("@/features/scheduling/live-app"))

type GuestStep = "invite" | "moments"
const themeStorage = { getItem: (key: string) => window.localStorage.getItem(key) }

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
  const [dark, setDark] = useState(() => readThemePreference(themeStorage) ?? window.matchMedia("(prefers-color-scheme: dark)").matches)
  const onDarkChange = useCallback((value: boolean) => {
    setDark(value)
    try { window.localStorage.setItem(themeStorageKey, value ? "dark" : "light") } catch { /* Session-only choice when storage is unavailable. */ }
  }, [])
  const standaloneHeader = production.live
    ? "error" in production || window.location.pathname.startsWith("/invite") || window.location.pathname === "/calendar-connected"
    : route.mode === "guest"

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute())
    window.addEventListener("hashchange", syncRoute)
    return () => window.removeEventListener("hashchange", syncRoute)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.style.colorScheme = dark ? "dark" : "light"
  }, [dark])

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const syncSystem = () => {
      if (readThemePreference(themeStorage) === null) setDark(media.matches)
    }
    const syncStorage = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) setDark(readThemePreference(themeStorage) ?? media.matches)
    }
    media.addEventListener("change", syncSystem)
    window.addEventListener("storage", syncStorage)
    return () => {
      media.removeEventListener("change", syncSystem)
      window.removeEventListener("storage", syncStorage)
    }
  }, [])

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
        {standaloneHeader ? <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-7 sm:py-7"><AppHeader dark={dark} onDarkChange={onDarkChange} /></div> : null}
        {production.live ? (
          "error" in production ? <main className="grid min-h-dvh place-items-center px-4"><Shell title="Warmly isn’t configured yet."><p role="alert" className="text-center text-sm">{production.error}</p></Shell></main>
            : <Suspense fallback={<p role="status" className="grid min-h-dvh place-items-center">Loading Warmly...</p>}><LiveApp dark={dark} onDarkChange={onDarkChange} /></Suspense>
        ) : route.mode === "guest" ? (
          <GuestFlow initialStep={route.step} onStepChange={openGuest} onExit={exitGuest} />
        ) : (
          <HostFlow
            step={route.step}
            onStepChange={(step) => setRoute({ mode: "host", step })}
            onPreviewGuest={() => openGuest("invite")}
            dark={dark}
            onDarkChange={onDarkChange}
          />
        )}
        {!production.live ? <footer className="px-4 pb-3 text-center text-[10px] text-muted-foreground">Design preview. No real sign-in, invitations, or calendar events.</footer> : null}
      </div>
    </TooltipProvider>
  )
}

export default App

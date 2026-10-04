import { useCallback, useEffect, useRef, useState } from "react"
import { ApiClientError } from "@/services/api-client"
import type { Identity, ProductionController } from "@/services/production-controller"

export function useRequest() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const running = useRef(false)
  const run = useCallback(async (work: () => Promise<void>) => {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError("")
    try {
      await work()
      return true
    } catch (failure) {
      setError(failure instanceof ApiClientError ? failure.message : "Something went wrong. Please try again.")
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { busy, error, run }
}

export function useLiveIdentity(controller: ProductionController) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    let observed = false
    const stop = controller.observeIdentity((user) => {
      observed = true
      if (active) { setIdentity(user); setReady(true) }
    })
    controller.getIdentity().then((user) => {
      if (active && !observed) { setIdentity(user); setReady(true) }
    }).catch(() => {
      if (active) { setError("Sign-in could not be loaded. Please refresh."); setReady(true) }
    })
    return () => { active = false; stop() }
  }, [controller])
  return { identity, ready, error }
}

export function rememberCalendarReturn(path: string) {
  sessionStorage.setItem("warmly:calendar-return", path)
}

export function restoreCalendarReturn() {
  if (window.location.pathname !== "/calendar-connected") return
  const path = sessionStorage.getItem("warmly:calendar-return") ?? "/"
  sessionStorage.removeItem("warmly:calendar-return")
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/"
  window.history.replaceState(null, "", safe)
}

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { ProductionController } from "@/services/production-controller"
import { Shell } from "./host-flow"
import { restoreCalendarReturn } from "./live-hooks"

export function CalendarAuthorizationReturn({ controller }: { controller: ProductionController }) {
  const [parameters] = useState(() => new URLSearchParams(window.location.hash.slice(1)))
  const completion = useRef<Promise<unknown> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    window.history.replaceState(null, "", "/calendar-connected")
    completion.current ??= controller.api.completeGoogleAuthorization(parameters.get("state") ?? "", parameters.get("code") ?? "")
    completion.current.then(() => {
      if (active) window.location.replace(restoreCalendarReturn() ?? "/")
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [controller, parameters])

  return (
    <main className="grid min-h-dvh w-full place-items-center px-4">
      <Shell title={failed ? "Let’s try connecting again." : "Connecting your calendar."}>
        {failed ? <div className="grid justify-items-center gap-4">
          <p role="alert" className="text-center text-sm">Calendar access could not be completed. Return to Warmly with the account that started this connection, then try again.</p>
          <Button onClick={() => window.location.replace(restoreCalendarReturn() ?? "/")}>Back to Warmly</Button>
        </div> : <p role="status" className="text-center text-sm">Finishing your secure calendar connection…</p>}
      </Shell>
    </main>
  )
}

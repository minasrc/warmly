import { useState } from "react"
import { StandaloneAppHeader } from "@/components/warmly/app-header"
import { getProductionController } from "@/services/production-controller"
import { LiveHostFlow } from "./live-host-flow"
import { LiveGuestFlow } from "./live-guest-flow"
import { Shell } from "./host-flow"
import { restoreCalendarReturn } from "./live-hooks"
import { CalendarAuthorizationReturn } from "./calendar-authorization-return"

export default function LiveApp({ dark, onDarkChange }: { dark: boolean; onDarkChange: (value: boolean) => void }) {
  const [configuration] = useState(() => {
    try {
      if (!new URLSearchParams(window.location.hash.slice(1)).has("code")) restoreCalendarReturn()
      return { controller: getProductionController() }
    } catch (failure) {
      return { error: failure instanceof Error ? failure.message : "App configuration is invalid" }
    }
  })
  const header = <StandaloneAppHeader dark={dark} onDarkChange={onDarkChange} />
  if (!configuration.controller) return <>{header}<main className="grid min-h-dvh place-items-center px-4"><Shell title="Warmly isn’t configured yet."><p role="alert" className="text-center text-sm">{configuration.error}</p></Shell></main></>
  if (window.location.pathname === "/calendar-connected") return <>{header}<CalendarAuthorizationReturn controller={configuration.controller} /></>
  const token = /^\/invite\/([A-Za-z0-9_-]{32,128})\/?$/.exec(window.location.pathname)?.[1]
  if (token) return <>{header}<LiveGuestFlow controller={configuration.controller} token={token} /></>
  if (window.location.pathname.startsWith("/invite")) return <>{header}<main className="grid min-h-dvh place-items-center px-4"><Shell title="This invitation link is invalid."><p className="text-center text-sm">Ask your friend for a new private link.</p></Shell></main></>
  return <LiveHostFlow controller={configuration.controller} dark={dark} onDarkChange={onDarkChange} />
}

import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CalendarConnection } from "@/services/api-types"
import type { ProductionController } from "@/services/production-controller"
import { Shell } from "./host-flow"
import { useRequest, rememberCalendarReturn } from "./live-hooks"

type CalendarOption = { id: string; name: string; primary: boolean }

export function CalendarSelection({ controller, onContinue, onBack }: {
  controller: ProductionController
  onContinue: (connections: CalendarConnection[]) => void
  onBack: () => void
}) {
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [options, setOptions] = useState<Record<string, CalendarOption[]>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const { busy, error, run } = useRequest()
  const [loaded, setLoaded] = useState(false)
  const [failedAccounts, setFailedAccounts] = useState<string[]>([])
  const [savedEmpty, setSavedEmpty] = useState(false)

  const load = useCallback(async () => {
    const { connections: current } = await controller.api.listCalendarConnections()
    const active = current.filter((connection) => connection.status !== "revoked")
    const calendars = await Promise.all(active.filter((connection) => connection.status === "active").map(async (connection) => {
      try {
        const { calendars } = await controller.api.listProviderCalendars(connection.id)
        return { id: connection.id, calendars, failed: false }
      } catch { return { id: connection.id, calendars: [] as CalendarOption[], failed: true } }
    }))
    setConnections(active)
    const available = Object.fromEntries(calendars.map((result) => [result.id, result.calendars]))
    setOptions(available)
    setFailedAccounts(calendars.filter((result) => result.failed).map((result) => result.id))
    setSelected(Object.fromEntries(active.filter((connection) => connection.status === "active").map((connection) => [connection.id, connection.selected_calendars.map((calendar) => calendar.provider_calendar_id).filter((id) => available[connection.id]?.some((calendar) => calendar.id === id))])))
    setSavedEmpty(false)
    setLoaded(true)
  }, [controller])

  useEffect(() => { void run(load) }, [load, run])

  const connect = () => run(async () => {
    rememberCalendarReturn(window.location.pathname)
    await controller.connectGoogleCalendar()
  })
  const save = (continueToPlan: boolean) => run(async () => {
    for (const connection of connections.filter((item) => item.status === "active" && !failedAccounts.includes(item.id))) {
      await controller.api.selectCalendars(connection.id, selected[connection.id] ?? [])
    }
    const { connections: updated } = await controller.api.listCalendarConnections()
    setConnections(updated.filter((connection) => connection.status !== "revoked"))
    if (continueToPlan) onContinue(updated.filter((connection) => connection.status === "active"))
    else setSavedEmpty(true)
  })
  const count = Object.values(selected).reduce((total, ids) => total + ids.length, 0)
  const unavailableSelection = connections.some((connection) => (connection.status === "needs_reauth" || failedAccounts.includes(connection.id)) && connection.selected_calendars.length)

  return (
    <fieldset disabled={busy} className="contents">
      <Shell eyebrow="Calendar access" title="Bring your calendars." copy="Choose which calendars count. Only free and busy times are used, never event details."
        footer={<><Button variant="ghost" onClick={onBack}><ArrowLeft /> Back</Button><Button disabled={!count || !loaded || unavailableSelection} onClick={() => save(true)}>Use these calendars <Check /></Button></>}>
        <div className="grid min-w-0 gap-4" aria-busy={busy}>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {!loaded && busy ? <p role="status">Loading your calendars...</p> : null}
          {savedEmpty ? <p role="status" className="text-sm text-muted-foreground">Saved. No calendars will be used to find your availability. Select a calendar to continue.</p> : null}
          {!count && loaded && connections.some((connection) => connection.status === "active" && connection.selected_calendars.length && !failedAccounts.includes(connection.id)) ? <Button variant="outline" disabled={unavailableSelection} onClick={() => save(false)}>Save without calendars</Button> : null}
          {connections.map((connection) => (
            <section key={connection.id} className="grid min-w-0 gap-3 rounded-2xl border p-4">
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <p className="min-w-0 truncate text-sm font-semibold" title={connection.account_email}>{connection.account_email}</p>
                <Button variant="ghost" size="icon" aria-label={`Disconnect ${connection.account_email}`} onClick={() => run(async () => { await controller.api.disconnectCalendar(connection.id); await load() })}><Trash2 /></Button>
              </div>
              {connection.status === "needs_reauth" ? <p className="text-sm text-muted-foreground">Reconnect this account to restore access.</p> : null}
              {failedAccounts.includes(connection.id) ? <p role="alert" className="text-sm text-destructive">This account could not be loaded. Retry, reconnect, or disconnect it before continuing.</p> : null}
              {(options[connection.id] ?? []).map((calendar) => (
                <label key={calendar.id} className="flex min-w-0 items-center gap-3 text-sm pointer-coarse:min-h-11">
                  <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={(selected[connection.id] ?? []).includes(calendar.id)}
                    onChange={(event) => { setSavedEmpty(false); setSelected((current) => ({ ...current, [connection.id]: event.target.checked ? [...(current[connection.id] ?? []), calendar.id] : (current[connection.id] ?? []).filter((id) => id !== calendar.id) })) }} />
                  <span className="min-w-0">{calendar.name}{calendar.primary ? " (primary)" : ""}</span>
                </label>
              ))}
            </section>
          ))}
          <Button variant="outline" className="mx-auto min-w-0 max-w-full rounded-full whitespace-normal" onClick={connect}><Plus /> Connect Google Calendar</Button>
          {error || failedAccounts.length ? <Button variant="ghost" onClick={() => run(load)}>Retry loading calendars</Button> : null}
        </div>
      </Shell>
    </fieldset>
  )
}

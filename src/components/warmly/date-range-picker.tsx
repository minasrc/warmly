import type { CalendarDate } from "@internationalized/date"
import type { RangeValue } from "@react-types/shared"
import { useCallback, useLayoutEffect, useRef } from "react"
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DateField,
  DateRangePicker,
  DateSegment,
  FieldError,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  RangeCalendar,
} from "react-aria-components"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { dateRangeError } from "@/features/scheduling/model"

type Props = {
  value: RangeValue<CalendarDate>
  onChange: (value: RangeValue<CalendarDate> | null) => void
  onValidityChange: (complete: boolean) => void
}

export function WarmlyDateRangePicker({ value, onChange, onValidityChange }: Props) {
  const completeness = useRef({ start: true, end: true })
  const endpointChanged = useCallback((endpoint: "start" | "end", complete: boolean) => {
    const previous = completeness.current.start && completeness.current.end
    completeness.current[endpoint] = complete
    const current = completeness.current.start && completeness.current.end
    if (previous !== current) onValidityChange(current)
  }, [onValidityChange])
  return (
    <DateRangePicker<CalendarDate>
      aria-label="Plan date range"
      value={value}
      onChange={onChange}
      startName="startDate"
      endName="endDate"
      isRequired
      validationBehavior="native"
      validate={dateRangeError}
      className="grid gap-2"
    >
      <Label className="text-sm font-semibold">Between which days?</Label>
      <Group className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40 min-[380px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <DateEndpoint slot="start" onCompletenessChange={endpointChanged} />
        <span className="text-muted-foreground" aria-hidden>to</span>
        <DateEndpoint slot="end" onCompletenessChange={endpointChanged} />
        <Button className="col-span-3 grid size-9 place-items-center justify-self-center rounded-xl text-primary outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring min-[380px]:col-span-1">
          <CalendarDays className="size-4" aria-hidden />
        </Button>
      </Group>
      <FieldError className="text-sm text-destructive" />
      <Popover className="w-[min(92vw,22rem)] rounded-3xl border bg-popover p-4 text-popover-foreground shadow-xl outline-none motion-safe:entering:animate-in entering:fade-in motion-safe:exiting:animate-out exiting:fade-out motion-reduce:animate-none">
        <Dialog className="outline-none">
          <RangeCalendar>
            <header className="mb-3 grid grid-cols-[auto_1fr_auto] items-center">
              <Button slot="previous" className="grid size-9 place-items-center rounded-full hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Heading className="text-center font-heading text-lg font-semibold" />
              <Button slot="next" className="grid size-9 place-items-center rounded-full hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </header>
            <CalendarGrid className="w-full border-separate border-spacing-1">
              <CalendarGridHeader>
                {(day) => <CalendarHeaderCell className="pb-1 text-xs font-medium text-muted-foreground">{day}</CalendarHeaderCell>}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className="grid size-9 cursor-pointer place-items-center rounded-full text-sm outline-none outside-month:text-muted-foreground/40 hover:bg-secondary selected:bg-primary selected:text-primary-foreground selection-start:rounded-full selection-end:rounded-full focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </RangeCalendar>
        </Dialog>
      </Popover>
    </DateRangePicker>
  )
}

type Endpoint = "start" | "end"

function DateEndpoint({ slot, onCompletenessChange }: { slot: Endpoint; onCompletenessChange: (endpoint: Endpoint, complete: boolean) => void }) {
  return <DateField<CalendarDate> slot={slot} validationBehavior="native" className="min-w-0">
    {({ state }) => <>
    <DateInput className="flex min-w-0 justify-center rounded-xl bg-secondary/70 px-1 py-2.5 text-sm min-[380px]:px-3">
      {(segment) => <DateSegment segment={segment} className="rounded px-0.5 outline-none focus:bg-primary focus:text-primary-foreground" />}
    </DateInput>
    <EndpointCompleteness endpoint={slot} complete={state.segments.every((segment) => !segment.isEditable || !segment.isPlaceholder)} onChange={onCompletenessChange} />
    </>}
  </DateField>
}

function EndpointCompleteness({ endpoint, complete, onChange }: { endpoint: Endpoint; complete: boolean; onChange: (endpoint: Endpoint, complete: boolean) => void }) {
  useLayoutEffect(() => onChange(endpoint, complete), [endpoint, complete, onChange])
  return null
}

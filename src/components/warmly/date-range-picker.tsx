import type { CalendarDate } from "@internationalized/date"
import type { RangeValue } from "@react-types/shared"
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DateRangePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Label,
  Popover,
  RangeCalendar,
} from "react-aria-components"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

type Props = {
  value: RangeValue<CalendarDate>
  onChange: (value: RangeValue<CalendarDate> | null) => void
}

export function WarmlyDateRangePicker({ value, onChange }: Props) {
  return (
    <DateRangePicker
      aria-label="Plan date range"
      value={value}
      onChange={onChange}
      className="grid gap-2"
    >
      <Label className="text-sm font-semibold">Between which days?</Label>
      <Group className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/40">
        <DateInput slot="start" className="flex min-w-0 justify-center rounded-xl bg-secondary/70 px-3 py-2.5 text-sm">
          {(segment) => <DateSegment segment={segment} className="rounded px-0.5 outline-none focus:bg-primary focus:text-primary-foreground" />}
        </DateInput>
        <span className="text-muted-foreground" aria-hidden>to</span>
        <DateInput slot="end" className="flex min-w-0 justify-center rounded-xl bg-secondary/70 px-3 py-2.5 text-sm">
          {(segment) => <DateSegment segment={segment} className="rounded px-0.5 outline-none focus:bg-primary focus:text-primary-foreground" />}
        </DateInput>
        <Button className="grid size-9 place-items-center rounded-xl text-primary outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring">
          <CalendarDays className="size-4" aria-hidden />
        </Button>
      </Group>
      <Popover className="w-[min(92vw,22rem)] rounded-3xl border bg-popover p-4 text-popover-foreground shadow-xl outline-none entering:animate-in entering:fade-in exiting:animate-out exiting:fade-out">
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

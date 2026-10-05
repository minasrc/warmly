import { CalendarDate } from "@internationalized/date"
import { createElement, Fragment, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { WarmlyDateRangePicker } from "./date-range-picker"

vi.mock("react-aria-components", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-aria-components")>(),
  Popover: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
}))

describe("calendar range presentation", () => {
  it("styles the actual React Aria selected and focus states in a fluid seven-column grid", () => {
    const markup = renderToStaticMarkup(createElement(WarmlyDateRangePicker, {
      value: { start: new CalendarDate(2026, 10, 13), end: new CalendarDate(2026, 10, 16) },
      onChange: () => {},
      onValidityChange: () => {},
    }))
    const cells = markup.match(/<div[^>]+data-react-aria-pressable[^>]*>/g) ?? []
    const selected = cells.filter((cell) => cell.includes('data-selected="true"'))
    expect(selected).toHaveLength(4)
    for (const cell of selected) {
      expect(cell).toContain("data-selected:bg-primary")
      expect(cell).toContain("data-selected:text-primary-foreground")
      expect(cell).toContain("data-focus-visible:ring-2")
      expect(cell).toContain("data-outside-month:text-muted-foreground/40")
      expect(cell).toContain("h-11 w-full")
    }
    expect(markup).toContain("table-fixed")
  })
})

import { describe, expect, it } from "vitest"
import { readThemePreference, themeStorageKey } from "./theme"

describe("theme preference", () => {
  it.each([["dark", true], ["light", false], [null, null], ["invalid", null]] as const)("reads %s without overriding system fallback", (value, expected) => {
    expect(readThemePreference({ getItem: (key) => key === themeStorageKey ? value : null })).toBe(expected)
  })

  it("allows system fallback when storage is blocked", () => {
    expect(readThemePreference({ getItem: () => { throw new Error("Storage blocked") } })).toBeNull()
  })
})

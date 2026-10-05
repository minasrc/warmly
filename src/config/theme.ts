export const themeStorageKey = "warmly:theme"

export function readThemePreference(storage: Pick<Storage, "getItem">, manualOverride: boolean | null = null): boolean | null {
  if (manualOverride !== null) return manualOverride
  try {
    const value = storage.getItem(themeStorageKey)
    return value === "dark" ? true : value === "light" ? false : null
  } catch {
    return null
  }
}

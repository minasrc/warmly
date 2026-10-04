export const themeStorageKey = "warmly:theme"

export function readThemePreference(storage: Pick<Storage, "getItem">): boolean | null {
  try {
    const value = storage.getItem(themeStorageKey)
    return value === "dark" ? true : value === "light" ? false : null
  } catch {
    return null
  }
}

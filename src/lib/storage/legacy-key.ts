/**
 * Read a localStorage value, falling back to the key it used to live
 * under before the product was renamed to Ootrix CRM.
 *
 * Renaming a storage key silently resets whatever it held — a user's
 * theme, their collapsed panels, their editor layout. Individually
 * small, collectively the app appears to forget every preference the
 * first time it loads after a deploy, with nothing to explain it.
 *
 * On the first read the legacy value is migrated to the new key and the
 * old one removed, so this only runs once per browser and the fallback
 * list can be deleted after a reasonable window.
 */
export function readMigratedItem(
  key: string,
  legacyKeys: readonly string[],
): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;

    for (const legacy of legacyKeys) {
      const value = localStorage.getItem(legacy);
      if (value !== null) {
        localStorage.setItem(key, value);
        localStorage.removeItem(legacy);
        return value;
      }
    }
    return null;
  } catch {
    // localStorage throws in private-browsing and sandboxed contexts.
    // Every caller treats null as "no preference saved", which is the
    // right behaviour here too.
    return null;
  }
}

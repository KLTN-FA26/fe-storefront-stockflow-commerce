/**
 * Per-viewer data a signed-in customer leaves in this browser (an unsent draft, for example) that
 * the next person to sign in on the same device must not read. Keys under this prefix go when the
 * session ends (`endSession`); a feature names its keys with `signedInStorageKey`.
 */
export const SIGNED_IN_STORAGE_PREFIX = "stockflow:signed-in:";

/** The `localStorage` key for `name`, cleared when the session ends. */
export const signedInStorageKey = (name: string) => `${SIGNED_IN_STORAGE_PREFIX}${name}`;

/** Removes every key under `SIGNED_IN_STORAGE_PREFIX`; nothing where storage is missing or blocked. */
export function clearSignedInStorage(): void {
  try {
    if (typeof window === "undefined") return;
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(SIGNED_IN_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage blocked (private mode, policy): there is nothing of ours to clear.
  }
}

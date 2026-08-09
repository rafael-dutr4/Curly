/**
 * Keeping the buffer across a reload.
 *
 * Opening and saving real files lands with the File System Access API later.
 * This is the smaller promise: whatever is in the editor survives closing the
 * tab, so a model is never lost to a refresh.
 *
 * Every call is guarded. localStorage throws in private browsing on some
 * browsers and when the quota is full, and losing autosave is never a reason
 * to take the application down with it.
 */

const KEY = "curly.buffer";

export function loadBuffer(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveBuffer(source: string): void {
  try {
    globalThis.localStorage?.setItem(KEY, source);
  } catch {
    // Autosave is a convenience, not a guarantee.
  }
}

export function clearBuffer(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // As above.
  }
}

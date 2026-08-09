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

const BUFFER = "curly.buffer";
const PROJECT = "curly.project";
const THEME = "curly.theme";
const LOCALE = "curly.locale";

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Persistence is a convenience, not a guarantee.
  }
}

export function loadBuffer(): string | null {
  return read(BUFFER);
}

export function saveBuffer(source: string): void {
  write(BUFFER, source);
}

export function clearBuffer(): void {
  try {
    globalThis.localStorage?.removeItem(BUFFER);
  } catch {
    // As above.
  }
}

export function loadProjectName(): string | null {
  return read(PROJECT);
}

export function saveProjectName(name: string): void {
  write(PROJECT, name);
}

/** Null means no preference has been expressed, so the system decides. */
export function loadTheme(): "light" | "dark" | null {
  const stored = read(THEME);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function saveTheme(theme: "light" | "dark"): void {
  write(THEME, theme);
}

/** Null means nobody has chosen, so the browser's own languages decide. */
export function loadLocale(): string | null {
  return read(LOCALE);
}

export function saveLocale(locale: string): void {
  write(LOCALE, locale);
}

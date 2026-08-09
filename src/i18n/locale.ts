import { type Locale, type Message, type MessageKey, type Params, say, translate } from "./messages.ts";

/**
 * Which language the interface is speaking right now.
 *
 * One module-level variable and a set of listeners, rather than threading a
 * translator through every function that draws something. The alternative was
 * passing a `t` down from `main.ts` into the context menu six calls away, for
 * a value that is the same everywhere and changes about twice in a session.
 *
 * Nothing here touches the DOM or storage. `t()` is read at the moment a piece
 * of text is produced, so anything built on demand — a menu, a dialog — is
 * already in the current language, and anything already on screen is redrawn
 * by whoever subscribed:
 *
 *     onLocaleChange(() => renderList(list, entries, ...))
 */

let current: Locale = "en";

const listeners = new Set<() => void>();

export function locale(): Locale {
  return current;
}

export function setLocale(next: Locale): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params);
}

/** The same, for a message the compiler or the linter already put together. */
export function tm(message: Message): string {
  return say(current, message);
}

/** Returns the unsubscribe, which the app itself never needs and a test does. */
export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

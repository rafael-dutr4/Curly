import { locale, onLocaleChange, setLocale, t } from "../i18n/locale.ts";
import { isLocale, isMessageKey, matchLocale, otherLocale } from "../i18n/messages.ts";
import { loadLocale, saveLocale } from "./storage.ts";

/**
 * The language, where it meets the page.
 *
 * The static markup carries keys instead of words, so a button in `index.html`
 * says what it means and the table says how to say it:
 *
 *     <button id="file-open" data-i18n="toolbar.open" data-i18n-tip="toolbar.open.tip">
 *
 * `data-i18n` writes the text, `data-i18n-tip` writes the `data-tip` the
 * tooltip reads, and `data-i18n-aria` writes `aria-label`. Repainting is then
 * one pass over the document, which is cheap enough to run on every switch and
 * leaves no chance of a label that was translated once at startup and then
 * forgotten.
 *
 * The first language is the stored choice, then what the browser asks for, and
 * English if neither says anything. `<html lang>` is kept in step so a screen
 * reader changes voice with the page.
 */

const KEY_TEXT = "i18n";
const KEY_TIP = "i18nTip";
const KEY_ARIA = "i18nAria";

/** An unknown key shows itself on screen, which is how a typo in the markup gets noticed. */
function say(key: string): string {
  return isMessageKey(key) ? t(key) : key;
}

export function paintStaticText(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset[KEY_TEXT];
    if (key) element.textContent = say(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-tip]")) {
    const key = element.dataset[KEY_TIP];
    if (key) element.dataset.tip = say(key);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = element.dataset[KEY_ARIA];
    if (key) element.setAttribute("aria-label", say(key));
  }
}

/** Chosen once at startup, before anything paints. */
export function initialLocale(): ReturnType<typeof locale> {
  const stored = loadLocale();
  if (isLocale(stored)) return stored;
  return matchLocale(globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? "en"]);
}

export function attachLanguage(): void {
  setLocale(initialLocale());

  const button = document.getElementById("toggle-locale") as HTMLButtonElement | null;

  const label = (): void => {
    document.documentElement.lang = locale();
    if (!button) return;
    button.textContent = t("language.toggle");
    button.dataset.tip = t("language.tip");
  };

  button?.addEventListener("click", () => {
    const next = otherLocale(locale());
    setLocale(next);
    saveLocale(next);
  });

  // Through the subscription rather than in the handler, so the button is also
  // correct if something else ever changes the language.
  onLocaleChange(() => {
    paintStaticText();
    label();
  });

  paintStaticText();
  label();
}

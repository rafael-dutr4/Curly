/**
 * Light and dark.
 *
 * The page already followed the operating system through
 * `prefers-color-scheme`, which is the right default: nobody should have to
 * set a preference twice. What was missing is the ability to disagree with it,
 * for the times the room is bright and the machine still thinks it is night.
 *
 * The choice is written to the root element as `data-theme`, and the CSS is
 * layered so it works in all three states:
 *
 *     :root                                        the light palette
 *     @media (dark) :root:not([data-theme=light])  dark unless light was asked for
 *     :root[data-theme=dark]                       dark whatever the system says
 *
 * The middle rule is why the attribute has to be written for light as well as
 * for dark: without it, choosing light on a machine set to dark would be
 * overridden by the media query.
 */

export type Theme = "light" | "dark";

export function systemTheme(): Theme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

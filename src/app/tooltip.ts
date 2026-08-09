/**
 * Tooltips.
 *
 * The native `title` attribute waits about a second before it appears, cannot
 * be styled, cannot be positioned, and never shows up at all for a disabled
 * control, which is exactly the case where the explanation matters most.
 *
 * This is one element reused for every tip, driven by delegated listeners, so
 * a button only has to say what it wants to explain:
 *
 *     <button data-tip="Download one JSON Schema per collection">
 *
 * Keyboard users get the same thing on focus, and `aria-describedby` points at
 * the tip while it is up so a screen reader reads what a pointer user sees.
 */

import { onLocaleChange } from "../i18n/locale.ts";

/** Long enough not to flicker while the pointer crosses a toolbar. */
const DELAY = 130;

/** After one tip has been shown, the next few appear at once. */
const WARM = 600;

const MARGIN = 8;

export function attachTooltips(root: Document = document): void {
  const tip = root.createElement("div");
  tip.className = "curly-tooltip";
  tip.id = "curly-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  root.body.append(tip);

  let showTimer: number | undefined;
  let warmTimer: number | undefined;
  let warm = false;
  let current: HTMLElement | null = null;

  const hide = (): void => {
    if (showTimer !== undefined) clearTimeout(showTimer);
    showTimer = undefined;
    if (!current) return;

    current.removeAttribute("aria-describedby");
    current = null;
    tip.hidden = true;

    // Moving between neighbours should not re-wait. The warm window closes on
    // its own, which is why nothing here reads a clock.
    warm = true;
    if (warmTimer !== undefined) clearTimeout(warmTimer);
    warmTimer = setTimeout(() => (warm = false), WARM);
  };

  const show = (target: HTMLElement): void => {
    const text = target.dataset.tip;
    if (!text) return;

    current = target;
    tip.textContent = text;
    tip.hidden = false;
    target.setAttribute("aria-describedby", tip.id);
    place(tip, target);
  };

  const request = (target: HTMLElement): void => {
    if (current === target) return;
    hide();
    if (warm) {
      show(target);
      return;
    }
    showTimer = setTimeout(() => show(target), DELAY);
  };

  const tipTarget = (node: EventTarget | null): HTMLElement | null =>
    node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null;

  root.addEventListener("pointerover", (event: PointerEvent) => {
    const target = tipTarget(event.target);
    if (target) request(target);
    else if (current) hide();
  });

  root.addEventListener("pointerout", (event: PointerEvent) => {
    // Leaving for a child of the same element is not leaving.
    const to = event.relatedTarget;
    if (current && to instanceof Node && current.contains(to)) return;
    hide();
  });

  root.addEventListener("focusin", (event) => {
    const target = tipTarget(event.target);
    if (target) show(target);
  });

  // A tip is a copy of `data-tip`, taken when it was shown. Switching the
  // language rewrites the attribute underneath it, and a tip left on screen
  // saying the old thing is the one place the change would look incomplete.
  onLocaleChange(() => {
    if (current) tip.textContent = current.dataset.tip ?? "";
  });

  root.addEventListener("focusout", hide);
  // A tip that outlives what it describes is worse than no tip.
  root.addEventListener("pointerdown", hide, true);
  root.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") hide();
  });
  globalThis.addEventListener("scroll", hide, true);
  globalThis.addEventListener("blur", hide);
}

/**
 * Below the element by default, above when there is no room, and always
 * inside the window. A tip that hangs off the edge explains nothing.
 */
function place(tip: HTMLElement, target: HTMLElement): void {
  const anchor = target.getBoundingClientRect();
  const size = tip.getBoundingClientRect();

  let top = anchor.bottom + 6;
  if (top + size.height > globalThis.innerHeight - MARGIN) top = anchor.top - size.height - 6;

  const left = Math.min(
    Math.max(MARGIN, anchor.left + anchor.width / 2 - size.width / 2),
    globalThis.innerWidth - size.width - MARGIN,
  );

  tip.style.top = `${Math.max(MARGIN, top)}px`;
  tip.style.left = `${left}px`;
}

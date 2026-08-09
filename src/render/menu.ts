import { CLASS } from "./theme.ts";

/**
 * The context menu.
 *
 * Everything the diagram can do is reachable by pointing at a thing and
 * pressing the right button. The inline editing and the hover controls are
 * faster once you know they exist; this is what makes them findable, and it is
 * the only place for the operations that have no obvious shape on the diagram,
 * like making a field optional or turning it into an array.
 *
 * It is plain HTML positioned over the diagram rather than anything drawn in
 * SVG, because a menu is a list of buttons and the browser already knows how
 * to lay out and focus a list of buttons.
 */

export interface MenuItem {
  readonly label: string;
  readonly run: () => void;
  readonly danger?: boolean;
}

/** Sections are separated by a rule. Empty sections are dropped. */
export type MenuSection = readonly MenuItem[];

let openMenu: HTMLElement | null = null;

export function closeMenu(): void {
  openMenu?.remove();
  openMenu = null;
}

export function showMenu(
  surface: HTMLElement,
  at: { x: number; y: number },
  sections: readonly MenuSection[],
): void {
  closeMenu();

  const filled = sections.filter((section) => section.length > 0);
  if (filled.length === 0) return;

  const menu = surface.ownerDocument.createElement("div");
  menu.className = CLASS.menu;
  menu.setAttribute("role", "menu");

  filled.forEach((section, index) => {
    if (index > 0) {
      const rule = surface.ownerDocument.createElement("hr");
      menu.append(rule);
    }
    for (const item of section) {
      const button = surface.ownerDocument.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.textContent = item.label;
      if (item.danger) button.className = "danger";
      button.addEventListener("click", () => {
        closeMenu();
        item.run();
      });
      menu.append(button);
    }
  });

  // Placed off screen first so it can be measured, then moved to somewhere it
  // actually fits. Opening a menu that runs off the bottom of the window is
  // the usual way this goes wrong.
  menu.style.left = "0";
  menu.style.top = "0";
  menu.style.visibility = "hidden";
  surface.append(menu);

  const bounds = surface.getBoundingClientRect();
  const size = menu.getBoundingClientRect();
  const x = Math.max(4, Math.min(at.x, bounds.width - size.width - 4));
  const y = Math.max(4, Math.min(at.y, bounds.height - size.height - 4));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.style.visibility = "visible";

  openMenu = menu;
  queueMicrotask(() => (menu.firstElementChild as HTMLElement | null)?.focus());

  const dismiss = (event: Event): void => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeMenu();
    detach();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    closeMenu();
    detach();
  };
  const detach = (): void => {
    surface.ownerDocument.removeEventListener("pointerdown", dismiss, true);
    surface.ownerDocument.removeEventListener("keydown", onKey, true);
    globalThis.removeEventListener("blur", closeMenu);
  };

  surface.ownerDocument.addEventListener("pointerdown", dismiss, true);
  surface.ownerDocument.addEventListener("keydown", onKey, true);
  globalThis.addEventListener("blur", closeMenu, { once: true });
}

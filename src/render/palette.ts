import { hash } from "../export/prng.ts";

/**
 * A colour per collection, decided by its name.
 *
 * Boxes that all look the same are hard to tell apart at a glance, and asking
 * someone to choose a colour for every collection is work nobody wants. The
 * name already distinguishes them, so it can decide the colour too: the same
 * model always draws the same way, on any machine, with nothing stored.
 *
 * Hue is the only thing that varies. Saturation and lightness are fixed at
 * values that carry white text and sit correctly on a light or a dark canvas,
 * so a header never has to know which theme is on.
 */

const SATURATION = 58;
const LIGHTNESS = 46;

/**
 * Hues are spread by the golden angle rather than taken straight from the
 * hash. Consecutive hashes land anywhere, and anywhere includes right next to
 * each other; stepping by 137.5 degrees keeps neighbours apart no matter how
 * many collections there are.
 */
const GOLDEN_ANGLE = 137.508;

export function collectionHue(name: string): number {
  return (hash(name) * GOLDEN_ANGLE) % 360;
}

export function collectionColor(name: string): string {
  return `hsl(${collectionHue(name).toFixed(1)} ${SATURATION}% ${LIGHTNESS}%)`;
}

/** The same colour, faint, for an embedded document's header inside its parent. */
export function nestedColor(name: string): string {
  return `hsl(${collectionHue(name).toFixed(1)} ${SATURATION}% ${LIGHTNESS}% / 18%)`;
}

/** Marks the field a reference points at. */
export const KEY_COLOR = "#d8a13c";

/** Marks a field that points somewhere else. */
export const REF_COLOR = "#5a8fd6";

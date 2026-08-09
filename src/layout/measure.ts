/**
 * Measuring text is normally done with `canvas.measureText`, which drags the
 * DOM into the layout code and makes it impossible to test in Node.
 *
 * Curly sidesteps the problem instead of solving it: the diagram draws in one
 * monospace font at one size, so every character is the same width and the
 * width of a string is multiplication. Layout becomes arithmetic, runs
 * anywhere, and can be checked with golden numbers in a test.
 *
 * The cost is that the constant below has to match the font the renderer
 * actually uses. A monospace advance is very close to 0.6 of the font size,
 * and the boxes have enough padding to absorb the small differences between
 * one monospace family and another.
 */

export const FONT_SIZE = 12;
export const CHAR_ADVANCE = FONT_SIZE * 0.6;

/** Vertical space for one field row. */
export const LINE_HEIGHT = 20;

/** The title bar of a box, measured from the top of the box to the first row. */
export const HEADER_HEIGHT = 26;

export const PADDING_X = 10;
export const PADDING_Y = 8;

/** How far an embedded document is indented inside its parent. */
export const EMBED_INDENT = 12;

/** Gap between a field name and its type, in characters. */
export const NAME_TYPE_GAP = 2;

export const MIN_BOX_WIDTH = 140;

/**
 * Space reserved at the right of every row for its delete control, and the
 * height of the "add field" row at the bottom of every box.
 *
 * Both are reserved in the geometry even though they only appear on hover. If
 * the layout changed when the pointer entered a box, the box would resize
 * under the cursor, which is worse than a little permanent padding.
 */
export const ROW_ACTION_WIDTH = 18;

/** Horizontal distance between two layers of the reference graph. */
export const COLUMN_GAP = 80;

/** Vertical distance between two boxes stacked in the same layer. */
export const BOX_GAP = 32;

/** Space kept around the whole drawing. */
export const MARGIN = 40;

export function textWidth(text: string): number {
  return text.length * CHAR_ADVANCE;
}

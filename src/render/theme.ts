/**
 * What the renderer needs in the markup itself. Colors are deliberately not
 * here: they live in `style.css` against these class names, so the diagram
 * follows the page (including a dark theme) without the renderer knowing
 * anything about it.
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/** Must match the font in style.css, because the width arithmetic assumes it. */
export const FONT_STACK = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

export const CLASS = {
  edges: "curly-edges",
  edge: "curly-edge",
  boxes: "curly-boxes",
  box: "curly-box",
  nested: "curly-box-nested",
  pinned: "curly-box-pinned",
  frame: "curly-frame",
  header: "curly-header",
  title: "curly-title",
  row: "curly-row",
  name: "curly-name",
  type: "curly-type",
  badge: "curly-badge",
  unknown: "curly-unknown",
  action: "curly-action",
  handle: "curly-handle",
  addRow: "curly-add",
  addHit: "curly-add-hit",
  addLabel: "curly-add-label",
  editing: "curly-editing",
  linking: "curly-linking",
} as const;

export const ARROW_MARKER_ID = "curly-arrow";
export const CORNER_RADIUS = 6;

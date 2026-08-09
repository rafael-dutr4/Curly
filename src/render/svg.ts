import type { Layout, LayoutBox, LayoutEdge, LayoutRow } from "../layout/layout.ts";
import { HEADER_HEIGHT, KEY_COLUMN, LINE_HEIGHT, PADDING_X, ROW_ACTION_WIDTH } from "../layout/measure.ts";
import { collectionColor, KEY_COLOR, nestedColor, REF_COLOR } from "./palette.ts";
import type { Span } from "../lang/token.ts";
import { ARROW_MARKER_ID, CLASS, CORNER_RADIUS, SVG_NS } from "./theme.ts";

/**
 * Geometry in, SVG out. The renderer makes no decisions: everything it draws
 * was already decided by the layout stage, which is why layout can be tested
 * without a browser and this file can stay boring.
 *
 * It rebuilds the whole drawing on every change instead of diffing the
 * existing nodes. That is immediate mode rendering, and it is the right
 * default here: a realistic model is a few hundred elements, well under one
 * frame, and diffing is the kind of complexity that earns its place only once
 * something is measurably slow. The `layout -> geometry` boundary is already
 * the seam to add it at if that day comes.
 *
 * Every element carries `data-span-start` and `data-span-end`. That single
 * attribute pair is the whole hit testing story: a click reads
 * `event.target.closest("[data-span-start]")` and knows which piece of source
 * text it landed on, in exactly the form the edit layer wants. No scene graph
 * and no second tree to keep in sync with the drawing.
 */

export function renderDiagram(svg: SVGSVGElement, drawing: Layout): void {
  const document = svg.ownerDocument;

  const defs = create(document, "defs");
  defs.append(arrowMarker(document));

  const edges = create(document, "g", { class: CLASS.edges });
  for (const edge of drawing.edges) edges.append(renderEdge(document, edge));

  const boxes = create(document, "g", { class: CLASS.boxes });
  for (const box of drawing.boxes) boxes.append(renderBox(document, box, false, []));

  // Edges first so boxes paint over them.
  svg.replaceChildren(defs, edges, boxes);
}

function renderBox(
  document: Document,
  box: LayoutBox,
  nested: boolean,
  path: readonly string[],
  owner: string = box.name,
): SVGElement {
  const classes: string[] = [CLASS.box];
  if (nested) classes.push(CLASS.nested);
  if (box.pinned) classes.push(CLASS.pinned);

  const group = create(document, "g", {
    class: classes.join(" "),
    transform: `translate(${round(box.x)}, ${round(box.y)})`,
    ...spanAttributes(box.span),
  });
  // Only a collection carries a name the operations can address. A nested box
  // is reached through the path of the field that holds it.
  if (!nested) group.dataset.collection = box.name;
  group.dataset.containerPath = path.join(".");

  group.append(
    create(document, "rect", {
      class: CLASS.frame,
      x: 0,
      y: 0,
      width: round(box.width),
      height: round(box.height),
      rx: CORNER_RADIUS,
    }),
  );

  // The header is a separate rect clipped to the top corners by sitting under
  // the frame's stroke, which avoids needing a clip path for two rounded ends.
  // The header colour is data, not theme, so it is set as an attribute rather
  // than left to the stylesheet. That also means it survives into an export.
  group.append(
    create(document, "path", {
      class: CLASS.header,
      d: headerPath(box.width, Math.min(HEADER_HEIGHT, box.height)),
      fill: nested ? nestedColor(owner) : collectionColor(owner),
    }),
  );

  group.append(
    create(
      document,
      "text",
      {
        class: CLASS.title,
        x: PADDING_X,
        y: HEADER_HEIGHT / 2,
        "dominant-baseline": "middle",
        "data-part": nested ? "embedded-title" : "title",
        ...spanAttributes(box.nameSpan),
      },
      box.name,
    ),
  );

  if (!nested) group.append(action(document, box.width - PADDING_X, HEADER_HEIGHT / 2, "delete-collection"));

  for (const row of box.rows) group.append(renderRow(document, row, box.width, path, owner));
  group.append(renderAddRow(document, box, path));

  return group;
}

/**
 * `containerWidth` is passed down so every type in a box ends at the same
 * right edge. Aligning each type to the end of its own row instead would leave
 * the column ragged, which makes a box much harder to scan.
 */
function renderRow(
  document: Document,
  row: LayoutRow,
  containerWidth: number,
  path: readonly string[],
  owner: string,
): SVGElement {
  const group = create(document, "g", { class: CLASS.row, ...spanAttributes(row.span) });
  const fieldPath = [...path, row.name];
  group.dataset.path = fieldPath.join(".");

  if (row.nested) {
    // An embedded document draws its own box; the field name is that box's title.
    group.append(renderBox(document, row.nested, true, fieldPath, owner));
    return group;
  }

  const baseline = row.y + LINE_HEIGHT / 2;

  // `_id` is what a reference points at, and a ref is what points away. Those
  // are the two facts worth seeing without reading the type column.
  const marker = row.name === "_id" ? KEY_COLOR : row.typeLabel.startsWith("ref(") ? REF_COLOR : null;
  if (marker) {
    group.append(
      create(document, "circle", {
        class: CLASS.marker,
        cx: round(row.x - KEY_COLUMN / 2),
        cy: round(baseline),
        r: 3.5,
        fill: marker,
      }),
    );
  }

  group.append(
    create(
      document,
      "text",
      {
        class: CLASS.name,
        x: row.x,
        y: baseline,
        "dominant-baseline": "middle",
        "data-part": "name",
        ...spanAttributes(row.nameSpan),
      },
      row.name,
    ),
  );

  group.append(
    create(
      document,
      "text",
      {
        class: CLASS.type,
        x: round(containerWidth - PADDING_X - ROW_ACTION_WIDTH),
        y: baseline,
        "dominant-baseline": "middle",
        "text-anchor": "end",
        "data-part": "type",
      },
      `${badges(row)}${row.typeLabel}`,
    ),
  );

  group.append(action(document, containerWidth - PADDING_X, baseline, "delete-field"));
  // The handle sits on the border, which is where an arrow would leave from.
  group.append(
    create(document, "circle", {
      class: CLASS.handle,
      cx: round(containerWidth),
      cy: round(baseline),
      r: 4,
      "data-action": "link",
    }),
  );

  return group;
}

/** The strip at the bottom of a box that adds a field. Hidden until the box is hovered. */
function renderAddRow(document: Document, box: LayoutBox, path: readonly string[]): SVGElement {
  const group = create(document, "g", { class: CLASS.addRow });
  group.dataset.action = "add-field";
  group.dataset.containerPath = path.join(".");

  group.append(
    create(document, "rect", {
      class: CLASS.addHit,
      x: 1,
      y: round(box.addRow.y),
      width: round(box.width - 2),
      height: round(box.addRow.height),
      fill: "transparent",
    }),
  );
  group.append(
    create(
      document,
      "text",
      {
        class: CLASS.addLabel,
        x: PADDING_X,
        y: round(box.addRow.y + box.addRow.height / 2),
        "dominant-baseline": "middle",
      },
      "+ field",
    ),
  );
  return group;
}

/** A small hover-only control, drawn as a glyph rather than a button. */
function action(document: Document, x: number, y: number, name: string): SVGElement {
  const element = create(
    document,
    "text",
    { class: CLASS.action, x: round(x), y: round(y), "dominant-baseline": "middle", "text-anchor": "end" },
    "\u00d7",
  );
  element.setAttribute("data-action", name);
  return element;
}

function renderEdge(document: Document, edge: LayoutEdge): SVGElement {
  const group = create(document, "g", { class: CLASS.edge, ...spanAttributes(edge.span) });
  group.dataset.from = edge.from;
  group.dataset.to = edge.to;
  group.append(
    create(document, "path", { d: edgePath(edge), "marker-end": `url(#${ARROW_MARKER_ID})`, fill: "none" }),
  );
  return group;
}

function arrowMarker(document: Document): SVGElement {
  const marker = create(document, "marker", {
    id: ARROW_MARKER_ID,
    viewBox: "0 0 10 10",
    refX: 9,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: "auto-start-reverse",
  });
  marker.append(create(document, "path", { d: "M 0 0 L 10 5 L 0 10 z" }));
  return marker;
}

// --- pure helpers, unit tested --------------------------------------------

/**
 * A self reference cannot be a straight line, so it leaves the right side and
 * comes back to it as a bezier that bulges outwards.
 */
export function edgePath(edge: LayoutEdge): string {
  const { x1, y1, x2, y2 } = edge;
  if (!edge.selfLoop) return `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`;

  const bulge = 34;
  return `M ${round(x1)} ${round(y1)} C ${round(x1 + bulge)} ${round(y1)}, ${round(x2 + bulge)} ${round(y2)}, ${round(x2)} ${round(y2)}`;
}

/** A rectangle with only the top corners rounded, for the box header. */
export function headerPath(width: number, height: number): string {
  const r = Math.min(CORNER_RADIUS, height);
  return [
    `M 0 ${round(height)}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    `L ${round(width - r)} 0`,
    `Q ${round(width)} 0 ${round(width)} ${r}`,
    `L ${round(width)} ${round(height)}`,
    "Z",
  ].join(" ");
}

/** Short markers for the annotations that change how a field behaves. */
export function badges(row: { unique: boolean; indexed: boolean }): string {
  const marks = [row.unique ? "U" : "", row.indexed ? "I" : ""].filter(Boolean);
  return marks.length === 0 ? "" : `${marks.join("")}  `;
}

export function spanAttributes(span: Span): Record<string, number> {
  return { "data-span-start": span.start, "data-span-end": span.end };
}

/** Keeps the emitted geometry short and, more importantly, byte stable. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function create(
  document: Document,
  name: string,
  attributes: Record<string, string | number> = {},
  text?: string,
): SVGElement {
  const element = document.createElementNS(SVG_NS, name) as SVGElement;
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  if (text !== undefined) element.textContent = text;
  return element;
}

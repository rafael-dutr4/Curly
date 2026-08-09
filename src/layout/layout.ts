import { baseFieldType, type FieldType, type Model, type ModelCollection, type ModelField } from "../lang/model.ts";
import type { Span } from "../lang/token.ts";
import {
  BOX_GAP,
  COLUMN_GAP,
  EMBED_INDENT,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  MARGIN,
  MIN_BOX_WIDTH,
  NAME_TYPE_GAP,
  PADDING_X,
  PADDING_Y,
  textWidth,
} from "./measure.ts";

/**
 * Layout turns a Model into pure geometry: numbers only, no DOM, no colors.
 * The renderer takes what comes out of here and does nothing but draw it,
 * which is what lets the hard part be tested with plain assertions.
 *
 * There are two problems to solve, and they are solved in this order.
 *
 * 1. How big is a box? A bottom up recursion, the same shape as the field
 *    tree. An embedded document is a box inside a box, so a parent cannot be
 *    measured until its children are.
 *
 * 2. Where does a box go? Not a layout engine. A collection with `@at` is
 *    pinned exactly there. Everything else is placed by longest path
 *    layering: a collection nothing points at goes in the first column, and
 *    every other collection sits one column to the right of the furthest
 *    thing that points at it. That is the same idea as Graphviz ranks, and
 *    it puts `users -> order -> item` left to right the way a person would
 *    draw it.
 *
 * Coordinates: a box's x and y are absolute. Everything inside a box (rows,
 * nested boxes) is relative to that box, so the renderer can emit one
 * translate per box and forget about the parent.
 */

export interface LayoutRow {
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
  /** The type as written for display, "" when the row is an embedded document. */
  readonly typeLabel: string;
  readonly unique: boolean;
  readonly indexed: boolean;
  /** Relative to the containing box. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Set when the field is an embedded document, positioned relative to the containing box. */
  readonly nested: LayoutBox | null;
}

export interface LayoutBox {
  readonly name: string;
  readonly nameSpan: Span;
  readonly span: Span;
  /** Absolute for a collection, relative to the parent for an embedded document. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rows: readonly LayoutRow[];
  /** True when the position came from `@at` rather than from auto placement. */
  readonly pinned: boolean;
}

export interface LayoutEdge {
  readonly from: string;
  readonly to: string;
  readonly fieldName: string;
  readonly span: Span;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** A collection that references itself, drawn as a loop rather than a line. */
  readonly selfLoop: boolean;
}

export interface Layout {
  readonly boxes: readonly LayoutBox[];
  readonly edges: readonly LayoutEdge[];
  /** Bounds of the drawing, including the margin, for the initial viewBox. */
  readonly width: number;
  readonly height: number;
}

export function layout(model: Model): Layout {
  const sized = model.collections.map((collection) => sizeCollection(collection));
  const placed = place(sized, model);
  const boxes = placed;
  const byName = new Map(boxes.map((b) => [b.name, b]));

  const edges: LayoutEdge[] = [];
  for (const edge of model.edges) {
    const from = byName.get(edge.from);
    const to = byName.get(edge.to);
    if (!from || !to) continue;
    edges.push(connect(from, to, edge.fieldName, edge.span));
  }

  let right = 0;
  let bottom = 0;
  for (const box of boxes) {
    right = Math.max(right, box.x + box.width);
    bottom = Math.max(bottom, box.y + box.height);
  }

  return { boxes, edges, width: right + MARGIN, height: bottom + MARGIN };
}

// --- sizing ---------------------------------------------------------------

interface Sized {
  readonly box: LayoutBox;
  readonly collection: ModelCollection;
}

function sizeCollection(collection: ModelCollection): Sized {
  return { box: sizeBox(collection.name, collection.nameSpan, collection.span, collection.fields, false), collection };
}

/**
 * Measure a box and lay its rows out inside it. Children are measured first,
 * because a parent that contains an embedded document is as wide as that
 * document plus the indent.
 */
function sizeBox(
  title: string,
  nameSpan: Span,
  span: Span,
  fields: readonly ModelField[],
  nestedBox: boolean,
): LayoutBox {
  const rows: LayoutRow[] = [];
  let y = HEADER_HEIGHT;
  let contentWidth = textWidth(title);

  for (const field of fields) {
    const base = baseFieldType(field.type);

    if (base.kind === "embedded") {
      // An embedded document is a box drawn under its field name, indented.
      const nested = sizeBox(
        `${field.name}${wrappers(field.type)}`,
        field.nameSpan,
        field.span,
        base.fields,
        true,
      );
      const height = nested.height + PADDING_Y;
      rows.push({
        name: field.name,
        nameSpan: field.nameSpan,
        span: field.span,
        typeLabel: "",
        unique: field.unique,
        indexed: field.indexed,
        x: PADDING_X + EMBED_INDENT,
        y,
        width: nested.width,
        height,
        nested: { ...nested, x: PADDING_X + EMBED_INDENT, y },
      });
      contentWidth = Math.max(contentWidth, EMBED_INDENT + nested.width);
      y += height;
      continue;
    }

    const typeLabel = labelOf(field.type);
    const width = textWidth(field.name) + NAME_TYPE_GAP * textWidth(" ") + textWidth(typeLabel) + badgeWidth(field);
    rows.push({
      name: field.name,
      nameSpan: field.nameSpan,
      span: field.span,
      typeLabel,
      unique: field.unique,
      indexed: field.indexed,
      x: PADDING_X,
      y,
      width,
      height: LINE_HEIGHT,
      nested: null,
    });
    contentWidth = Math.max(contentWidth, width);
    y += LINE_HEIGHT;
  }

  return {
    name: title,
    nameSpan,
    span,
    x: 0,
    y: 0,
    width: Math.max(nestedBox ? 0 : MIN_BOX_WIDTH, contentWidth + PADDING_X * 2),
    height: y + PADDING_Y,
    rows,
    pinned: false,
  };
}

function badgeWidth(field: ModelField): number {
  const badges = (field.unique ? 1 : 0) + (field.indexed ? 1 : 0);
  return badges === 0 ? 0 : textWidth("  ") + badges * textWidth("U ");
}

/** The `?` and `[]` written after a type, innermost first, as they appear in the source. */
function wrappers(type: FieldType): string {
  if (type.kind === "array") return `${wrappers(type.element)}[]`;
  if (type.kind === "optional") return `${wrappers(type.inner)}?`;
  return "";
}

/** How a type reads on a row: `string?`, `ref(order)[]`. Embedded rows have no label. */
export function labelOf(type: FieldType): string {
  const base = baseFieldType(type);
  const suffix = wrappers(type);
  switch (base.kind) {
    case "scalar":
      return base.name + suffix;
    case "ref":
      return `ref(${base.target})${suffix}`;
    case "embedded":
      return `{ }${suffix}`;
  }
}

// --- placement ------------------------------------------------------------

function place(sized: readonly Sized[], model: Model): LayoutBox[] {
  const pinned: LayoutBox[] = [];
  const flowing: Sized[] = [];

  for (const item of sized) {
    const position = item.collection.position;
    if (position) {
      pinned.push({ ...item.box, x: position.x, y: position.y, pinned: true });
    } else {
      flowing.push(item);
    }
  }

  const layers = assignLayers(
    flowing.map((f) => f.collection.name),
    model,
  );

  // Column x is the running width of every layer to the left, so a layer full
  // of wide boxes pushes the next one further right instead of overlapping it.
  const widthOfLayer = new Map<number, number>();
  for (const item of flowing) {
    const layer = layers.get(item.collection.name) ?? 0;
    widthOfLayer.set(layer, Math.max(widthOfLayer.get(layer) ?? 0, item.box.width));
  }

  const xOfLayer = new Map<number, number>();
  let x = MARGIN;
  for (const layer of [...widthOfLayer.keys()].sort((a, b) => a - b)) {
    xOfLayer.set(layer, x);
    x += widthOfLayer.get(layer)! + COLUMN_GAP;
  }

  const nextY = new Map<number, number>();
  const placed: LayoutBox[] = [];
  for (const item of flowing) {
    const layer = layers.get(item.collection.name) ?? 0;
    const y = nextY.get(layer) ?? MARGIN;
    placed.push({ ...item.box, x: xOfLayer.get(layer) ?? MARGIN, y });
    nextY.set(layer, y + item.box.height + BOX_GAP);
  }

  // Declaration order is preserved so the output is stable and a box does not
  // jump around when an unrelated collection is added.
  const order = new Map(sized.map((s, i) => [s.collection.name, i]));
  return [...placed, ...pinned].sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
}

/**
 * Longest path layering. A node with nothing pointing at it is layer 0, and
 * every other node is one past the furthest node that points at it.
 *
 * Cycles are broken by remembering which nodes are currently being visited: a
 * node that is reached again while it is still on the stack contributes
 * nothing, so `a -> b -> a` lays out instead of recursing forever.
 */
function assignLayers(names: readonly string[], model: Model): Map<string, number> {
  const included = new Set(names);
  const predecessors = new Map<string, string[]>(names.map((n) => [n, []]));

  for (const edge of model.edges) {
    if (edge.from === edge.to) continue; // a self reference cannot rank a node
    if (!included.has(edge.from) || !included.has(edge.to)) continue;
    predecessors.get(edge.to)!.push(edge.from);
  }

  const layers = new Map<string, number>();
  const visiting = new Set<string>();

  const layerOf = (name: string): number => {
    const known = layers.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return 0;

    visiting.add(name);
    let layer = 0;
    for (const predecessor of predecessors.get(name) ?? []) {
      layer = Math.max(layer, layerOf(predecessor) + 1);
    }
    visiting.delete(name);

    layers.set(name, layer);
    return layer;
  };

  for (const name of names) layerOf(name);
  return layers;
}

// --- edges ----------------------------------------------------------------

function connect(from: LayoutBox, to: LayoutBox, fieldName: string, span: Span): LayoutEdge {
  if (from.name === to.name) {
    return {
      from: from.name,
      to: to.name,
      fieldName,
      span,
      x1: from.x + from.width,
      y1: from.y + HEADER_HEIGHT,
      x2: from.x + from.width,
      y2: from.y + Math.min(from.height, HEADER_HEIGHT + LINE_HEIGHT * 2),
      selfLoop: true,
    };
  }

  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  const start = borderPoint(from, toCenter);
  const end = borderPoint(to, fromCenter);

  return { from: from.name, to: to.name, fieldName, span, x1: start.x, y1: start.y, x2: end.x, y2: end.y, selfLoop: false };
}

function centerOf(box: LayoutBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where the line from the box centre towards `target` crosses the box border.
 *
 * Scaling the direction vector so that it just reaches the nearer of the two
 * sides handles all eight directions with no special cases, which is why the
 * edges do not need to know whether the target is left, right, above or below.
 */
function borderPoint(box: LayoutBox, target: { x: number; y: number }): { x: number; y: number } {
  const center = centerOf(box);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (dx === 0 && dy === 0) return center;

  const halfWidth = box.width / 2;
  const halfHeight = box.height / 2;
  const scaleX = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

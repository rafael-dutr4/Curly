import type { CurlyDocument } from "../app/document.ts";
import * as ops from "../edit/ops.ts";
import { CLASS, SVG_NS } from "./theme.ts";
import { screenToModel, type ViewBox } from "./viewport.ts";

/**
 * Gestures. This file is deliberately thin: every change it can make already
 * exists as a tested operation in `src/edit`, so all that happens here is
 * turning a pointer into a call.
 *
 * Nothing in here mutates the diagram. A gesture runs an operation, the
 * document patches its text, and the resulting rerender is what the user sees.
 * The one exception is the live feedback during a drag, which moves a
 * `transform` and is thrown away when the real edit lands.
 *
 * Everything is found through the data attributes the renderer emitted:
 *
 *     data-collection    on a collection box
 *     data-path          on a field row, dotted for nested fields
 *     data-container-path on a box and on its add row
 *     data-part          "title" | "name" | "type"
 *     data-action        "delete-field" | "delete-collection" | "add-field" | "link"
 */

/** How far the pointer must travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 3;

/**
 * Capturing keeps a drag alive when the pointer leaves the element, which is
 * the normal case for dragging a box towards the edge of the diagram.
 *
 * It is allowed to fail: the specification throws when the pointer is no
 * longer active, and the browser drops the capture on its own in a few
 * situations. Losing the whole gesture over that would be worse than
 * continuing without it, so a failure just means the drag works while the
 * pointer stays inside the element.
 */
function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Degrades to an uncaptured drag.
  }
}

export interface InteractionContext {
  readonly svg: SVGSVGElement;
  /** Positioned ancestor the inline input is placed into. */
  readonly surface: HTMLElement;
  readonly document: CurlyDocument;
  readonly view: () => ViewBox;
}

export function attachInteraction(context: InteractionContext): void {
  const { svg } = context;
  const input = createInput(context.surface);

  svg.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target) return;

    const action = target.closest("[data-action]")?.getAttribute("data-action");
    if (action === "link") return startLinking(context, event, target);
    if (action) return; // handled on click, where a press and release both landed

    const box = target.closest<SVGGElement>("[data-collection]");
    if (box) startDragging(context, event, box);
  });

  svg.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target) return;

    const action = target.closest("[data-action]");
    switch (action?.getAttribute("data-action")) {
      case "delete-field": {
        const ref = fieldRefOf(target);
        if (ref) context.document.run((s, m) => ops.deleteField(s, m, ref));
        return;
      }
      case "delete-collection": {
        const name = collectionOf(target);
        if (name) context.document.run((s, m) => ops.deleteCollection(s, m, name));
        return;
      }
      case "add-field":
        return addField(context, action);
      default:
        break;
    }

    const part = target.getAttribute("data-part");
    if (part === "title") return editCollectionName(context, input, target);
    if (part === "name" || part === "embedded-title") return editFieldName(context, input, target);
    if (part === "type") return editFieldType(context, input, target);
  });
}

// --- inline editing -------------------------------------------------------

/**
 * Editing text inside SVG has no good native answer, and `foreignObject` is
 * quirky enough to be worth avoiding. Instead one HTML input is moved over the
 * text being edited. The geometry is already known: the text element reports
 * its own screen rectangle, so no viewBox arithmetic is needed at all.
 */
function createInput(surface: HTMLElement): HTMLInputElement {
  const input = surface.ownerDocument.createElement("input");
  input.type = "text";
  input.className = CLASS.editing;
  input.hidden = true;
  input.spellcheck = false;
  input.autocomplete = "off";
  surface.append(input);
  return input;
}

function openInput(
  surface: HTMLElement,
  input: HTMLInputElement,
  anchor: Element,
  value: string,
  commit: (next: string) => void,
): void {
  const box = anchor.getBoundingClientRect();
  const base = surface.getBoundingClientRect();

  input.hidden = false;
  input.value = value;
  input.style.left = `${box.left - base.left - 3}px`;
  input.style.top = `${box.top - base.top - 2}px`;
  input.style.width = `${Math.max(box.width + 24, 70)}px`;
  input.style.height = `${box.height + 4}px`;
  input.select();
  input.focus();

  let done = false;
  const close = (): void => {
    if (done) return;
    done = true;
    input.hidden = true;
    input.onkeydown = null;
    input.onblur = null;
  };

  input.onkeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const next = input.value.trim();
      close();
      if (next && next !== value) commit(next);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close(); // nothing changed, which is the point of Escape
    }
  };

  // Clicking away is a commit, matching how a rename works nearly everywhere.
  input.onblur = () => {
    const next = input.value.trim();
    close();
    if (next && next !== value) commit(next);
  };
}

function editCollectionName(context: InteractionContext, input: HTMLInputElement, target: Element): void {
  const name = collectionOf(target);
  if (!name) return;
  openInput(context.surface, input, target, name, (next) => {
    context.document.run((s, m) => ops.renameCollection(s, m, name, next));
  });
}

function editFieldName(context: InteractionContext, input: HTMLInputElement, target: Element): void {
  const ref = fieldRefOf(target);
  if (!ref) return;
  // The path is the reliable source of the name. An embedded document's title
  // is drawn with its `[]` and `?` wrappers, which are not part of it.
  const current = ref.path.at(-1)!;
  openInput(context.surface, input, target, current, (next) => {
    context.document.run((s, m) => ops.renameField(s, m, ref, next));
  });
}

function editFieldType(context: InteractionContext, input: HTMLInputElement, target: Element): void {
  const ref = fieldRefOf(target);
  if (!ref) return;
  const { model } = context.document.compilation();
  const field = ops.findField(model, ref);
  if (!field) return;

  // The rendered label carries the badges, so the text to edit comes from the
  // source instead: what the user typed is what they should see in the input.
  const written = context.document.source().slice(field.type.span.start, field.type.span.end);
  openInput(context.surface, input, target, written, (next) => {
    context.document.run((s, m) => ops.setType(s, m, ref, next));
  });
}

function addField(context: InteractionContext, action: Element): void {
  const collection = collectionOf(action);
  if (!collection) return;
  const path = splitPath(action.getAttribute("data-container-path"));
  const container = ops.findContainer(context.document.compilation().model, { collection, path });
  if (!container) return;

  const name = uniqueName(container.fields.map((f) => f.name));
  context.document.run((s, m) => ops.addField(s, m, { collection, path }, name, "string"));
}

/** `field`, then `field2`, `field3`, so adding twice does not collide. */
function uniqueName(taken: readonly string[]): string {
  if (!taken.includes("field")) return "field";
  let n = 2;
  while (taken.includes(`field${n}`)) n += 1;
  return `field${n}`;
}

// --- dragging a box -------------------------------------------------------

/**
 * A drag moves a transform and nothing else, so nothing reparses while the
 * pointer is down and it stays smooth. Exactly one operation runs on release,
 * which is also what makes the whole drag a single undo step.
 */
function startDragging(context: InteractionContext, event: PointerEvent, box: SVGGElement): void {
  const name = box.dataset.collection;
  if (!name) return;

  const origin = translateOf(box);
  const rect = context.svg.getBoundingClientRect();
  const start = screenToModel(context.view(), rect, event.clientX, event.clientY);

  let moved = false;
  capturePointer(context.svg, event.pointerId);

  const move = (moveEvent: PointerEvent): void => {
    const now = screenToModel(context.view(), rect, moveEvent.clientX, moveEvent.clientY);
    const dx = now.x - start.x;
    const dy = now.y - start.y;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    box.setAttribute("transform", `translate(${origin.x + dx}, ${origin.y + dy})`);
  };

  const up = (upEvent: PointerEvent): void => {
    context.svg.removeEventListener("pointermove", move);
    context.svg.removeEventListener("pointerup", up);
    context.svg.removeEventListener("pointercancel", up);
    if (!moved) return; // a press that never moved is a click, handled elsewhere

    const end = screenToModel(context.view(), rect, upEvent.clientX, upEvent.clientY);
    context.document.run((s, m) =>
      ops.setPosition(s, m, name, origin.x + (end.x - start.x), origin.y + (end.y - start.y)),
    );
  };

  context.svg.addEventListener("pointermove", move);
  context.svg.addEventListener("pointerup", up);
  context.svg.addEventListener("pointercancel", up);
}

// --- dragging a reference -------------------------------------------------

/** Drag from a field's handle onto a collection to turn that field into a ref. */
function startLinking(context: InteractionContext, event: PointerEvent, target: Element): void {
  const ref = fieldRefOf(target);
  if (!ref) return;

  event.stopPropagation();
  const rect = context.svg.getBoundingClientRect();
  const from = screenToModel(context.view(), rect, event.clientX, event.clientY);

  const line = context.svg.ownerDocument.createElementNS(SVG_NS, "line");
  line.setAttribute("class", CLASS.linking);
  line.setAttribute("x1", String(from.x));
  line.setAttribute("y1", String(from.y));
  line.setAttribute("x2", String(from.x));
  line.setAttribute("y2", String(from.y));
  context.svg.append(line);
  capturePointer(context.svg, event.pointerId);

  const move = (moveEvent: PointerEvent): void => {
    const now = screenToModel(context.view(), rect, moveEvent.clientX, moveEvent.clientY);
    line.setAttribute("x2", String(now.x));
    line.setAttribute("y2", String(now.y));
  };

  const up = (upEvent: PointerEvent): void => {
    context.svg.removeEventListener("pointermove", move);
    context.svg.removeEventListener("pointerup", up);
    context.svg.removeEventListener("pointercancel", up);
    line.remove();

    // The pointer is captured, so the event target is the svg. Ask the document
    // what is actually under the cursor instead.
    const dropped = context.svg.ownerDocument.elementFromPoint(upEvent.clientX, upEvent.clientY);
    const target_ = dropped?.closest<SVGGElement>("[data-collection]")?.dataset.collection;
    if (!target_) return;
    context.document.run((s, m) => ops.makeReference(s, m, ref, target_));
  };

  context.svg.addEventListener("pointermove", move);
  context.svg.addEventListener("pointerup", up);
  context.svg.addEventListener("pointercancel", up);
}

// --- helpers --------------------------------------------------------------

function collectionOf(target: Element): string | null {
  return target.closest<SVGGElement>("[data-collection]")?.dataset.collection ?? null;
}

function fieldRefOf(target: Element): ops.FieldRef | null {
  const collection = collectionOf(target);
  const row = target.closest<SVGGElement>("[data-path]");
  const path = splitPath(row?.dataset.path ?? null);
  if (!collection || path.length === 0) return null;
  return { collection, path };
}

function splitPath(value: string | null): string[] {
  return value ? value.split(".") : [];
}

/** Read `translate(x, y)` back off a group, so a drag starts from where it is. */
export function translateOf(element: Element): { x: number; y: number } {
  const match = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(element.getAttribute("transform") ?? "");
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: 0, y: 0 };
}

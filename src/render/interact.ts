import type { CurlyDocument } from "../app/document.ts";
import * as ops from "../edit/ops.ts";
import { completionsFor, isTypeValid, splitType, typeCandidates } from "./complete.ts";
import { type MenuSection, showMenu } from "./menu.ts";
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

/**
 * How far the pointer must travel, in screen pixels, before a press counts as
 * a drag rather than a click. A hand resting on a mouse moves a pixel or two,
 * so anything smaller makes clicking unreliable.
 */
const DRAG_THRESHOLD = 5;

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

function releasePointer(element: Element, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Already gone, which is the state we wanted.
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

  svg.addEventListener("contextmenu", (event: MouseEvent) => {
    event.preventDefault();
    const target = event.target as Element | null;
    if (!target) return;

    const bounds = context.surface.getBoundingClientRect();
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const where = screenToModel(context.view(), context.svg.getBoundingClientRect(), event.clientX, event.clientY);

    showMenu(context.surface, at, menuFor(context, input, target, where));
  });
}

/**
 * What the right button offers depends on what it was pressed on: a field, a
 * collection, or the empty canvas. Each level adds the one above it, so the
 * menu on a field can still create a collection.
 */
function menuFor(
  context: InteractionContext,
  input: HTMLInputElement,
  target: Element,
  where: { x: number; y: number },
): MenuSection[] {
  const run = (operation: Parameters<CurlyDocument["run"]>[0]): void => {
    context.document.run(operation);
  };

  const sections: MenuSection[] = [];
  const model = context.document.compilation().model;

  const fieldRef = fieldRefOf(target);
  const field = fieldRef ? ops.findField(model, fieldRef) : null;
  const collection = collectionOf(target);

  if (fieldRef && field) {
    const optional = ops.hasWrapper(field.type, "optional");
    const array = ops.hasWrapper(field.type, "array");
    const has = (name: string): boolean => field.annotations.some((a) => a.name === name);

    sections.push([
      { label: `Rename “${field.name}”`, run: () => editFieldName(context, input, target) },
      { label: "Edit type", run: () => editTypeOfRow(context, input, target) },
    ]);

    sections.push([
      {
        label: optional ? "Make required" : "Make optional",
        run: () => run((s, m) => ops.toggleOptional(s, m, fieldRef)),
      },
      { label: array ? "Make single" : "Make an array", run: () => run((s, m) => ops.toggleArray(s, m, fieldRef)) },
      {
        label: has("unique") ? "Remove @unique" : "Add @unique",
        run: () =>
          run((s, m) =>
            has("unique") ? ops.removeAnnotation(s, m, fieldRef, "unique") : ops.addAnnotation(s, m, fieldRef, "unique"),
          ),
      },
      {
        label: has("index") ? "Remove @index" : "Add @index",
        run: () =>
          run((s, m) =>
            has("index") ? ops.removeAnnotation(s, m, fieldRef, "index") : ops.addAnnotation(s, m, fieldRef, "index"),
          ),
      },
    ]);

    sections.push([
      { label: "Move up", run: () => run((s, m) => ops.moveField(s, m, fieldRef, -1)) },
      { label: "Move down", run: () => run((s, m) => ops.moveField(s, m, fieldRef, 1)) },
      { label: "Delete field", danger: true, run: () => run((s, m) => ops.deleteField(s, m, fieldRef)) },
    ]);
  }

  if (collection) {
    const pinned = Boolean(model.byName.get(collection)?.positionSpan);
    const container = { collection, path: containerPathOf(target) };

    sections.push([
      {
        label: `Rename “${collection}”`,
        run: () => {
          const title = context.svg.querySelector<SVGTextElement>(
            `[data-collection="${CSS.escape(collection)}"] [data-part="title"]`,
          );
          if (title) editCollectionName(context, input, title);
        },
      },
      {
        label: "Add field",
        run: () => {
          const found = ops.findContainer(model, container);
          const name = unusedFieldName(found?.fields.map((f) => f.name) ?? []);
          run((s, m) => ops.addField(s, m, container, name, "string"));
        },
      },
      ...(pinned ? [{ label: "Unpin from this position", run: () => run((s, m) => ops.clearPosition(s, m, collection)) }] : []),
      { label: "Delete collection", danger: true, run: () => run((s, m) => ops.deleteCollection(s, m, collection)) },
    ]);
  }

  sections.push([
    {
      label: "New collection here",
      run: () => {
        const name = ops.unusedCollectionName(model);
        context.document.run((s, m) => ops.addCollection(s, m, name, where));
      },
    },
  ]);

  return sections;
}

/**
 * Open the type editor for the row that was clicked, whichever part of the row
 * the pointer actually landed on. The menu is opened from a name as often as
 * from a type, and it should not matter which.
 */
function editTypeOfRow(context: InteractionContext, input: HTMLInputElement, target: Element): void {
  const type = target.closest("[data-path]")?.querySelector('[data-part="type"]');
  if (type) editFieldType(context, input, type);
}

function unusedFieldName(taken: readonly string[]): string {
  if (!taken.includes("field")) return "field";
  let n = 2;
  while (taken.includes(`field${n}`)) n += 1;
  return `field${n}`;
}

/** The container a click landed in: the collection, or an embedded document inside it. */
function containerPathOf(target: Element): string[] {
  const box = target.closest<SVGGElement>("[data-container-path]");
  return splitPath(box?.dataset.containerPath ?? null);
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

/** Optional completion behaviour, used when the thing being edited is a type. */
interface Completion {
  readonly candidates: readonly string[];
  readonly isValid: (text: string) => boolean;
}

function openInput(
  surface: HTMLElement,
  input: HTMLInputElement,
  anchor: Element,
  value: string,
  commit: (next: string) => void,
  completion?: Completion,
): void {
  const box = anchor.getBoundingClientRect();
  const base = surface.getBoundingClientRect();

  input.hidden = false;
  input.value = value;
  input.style.left = `${box.left - base.left - 3}px`;
  input.style.top = `${box.top - base.top - 2}px`;
  input.style.width = `${Math.max(box.width + 24, 110)}px`;
  input.style.height = `${box.height + 4}px`;
  input.select();
  input.focus();

  const list = completion ? createList(surface, input) : null;
  let options: string[] = [];
  let active = -1;

  const paint = (): void => {
    if (!completion || !list) return;

    const valid = completion.isValid(input.value);
    input.classList.toggle("invalid", !valid && input.value.trim() !== "");

    const { base: typed, suffix } = splitType(input.value);
    options = completionsFor(completion.candidates, typed);
    // An exact single match is not worth a menu that covers the diagram.
    if (options.length === 1 && options[0] === typed) options = [];
    active = options.length > 0 ? Math.min(Math.max(active, 0), options.length - 1) : -1;

    list.replaceChildren(
      ...options.map((option, index) => {
        const item = surface.ownerDocument.createElement("li");
        item.textContent = option + suffix;
        if (index === active) item.className = "active";
        // pointerdown, not click: the input must not blur before this runs.
        item.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          accept(option);
        });
        return item;
      }),
    );
    list.hidden = options.length === 0;
  };

  let done = false;
  const close = (): void => {
    if (done) return;
    done = true;
    input.hidden = true;
    input.classList.remove("invalid");
    input.onkeydown = null;
    input.onblur = null;
    input.oninput = null;
    list?.remove();
  };

  /** Take a candidate, keeping whatever `?` and `[]` were already written. */
  const accept = (option: string): void => {
    const { suffix } = splitType(input.value);
    input.value = option + suffix;
    active = -1;
    paint();
    input.focus();
  };

  const finish = (): void => {
    const next = input.value.trim();
    // Refuse to commit a type the model would only reject. Escape still
    // leaves, so this holds the mistake without trapping anyone in the field.
    if (completion && next && !completion.isValid(next)) {
      input.classList.add("invalid");
      return;
    }
    close();
    if (next && next !== value) commit(next);
  };

  input.oninput = paint;

  input.onkeydown = (event: KeyboardEvent) => {
    if (list && !list.hidden && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : options.length - 1)) % options.length;
      paint();
      return;
    }
    if (event.key === "Tab" && active >= 0 && options[active]) {
      event.preventDefault();
      accept(options[active]!);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0 && options[active]) {
        accept(options[active]!);
        return;
      }
      finish();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      // The first Escape dismisses the suggestions, the second abandons the
      // edit, so a list in the way never costs the whole change.
      if (list && !list.hidden) {
        list.hidden = true;
        active = -1;
        return;
      }
      close();
    }
  };

  // Clicking away is a commit, matching how a rename works nearly everywhere.
  input.onblur = finish;

  paint();
}

function createList(surface: HTMLElement, input: HTMLInputElement): HTMLUListElement {
  const list = surface.ownerDocument.createElement("ul");
  list.className = CLASS.complete;
  list.hidden = true;
  list.style.left = input.style.left;
  list.style.top = `${Number.parseFloat(input.style.top) + Number.parseFloat(input.style.height)}px`;
  list.style.minWidth = input.style.width;
  surface.append(list);
  return list;
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
  openInput(
    context.surface,
    input,
    target,
    written,
    (next) => {
      context.document.run((s, m) => ops.setType(s, m, ref, next));
    },
    {
      candidates: typeCandidates(model),
      isValid: (text) => isTypeValid(context.document.source(), context.document.compilation().model, text),
    },
  );
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
  const startedAt = { x: event.clientX, y: event.clientY };

  let moved = false;

  const move = (moveEvent: PointerEvent): void => {
    const now = screenToModel(context.view(), rect, moveEvent.clientX, moveEvent.clientY);
    const dx = now.x - start.x;
    const dy = now.y - start.y;

    // The threshold is in screen pixels, not model units. In model units the
    // same small hand movement counts as a drag when zoomed out and as a click
    // when zoomed in, which is exactly the kind of thing that makes an editor
    // feel like it works only sometimes.
    const travelled = Math.hypot(moveEvent.clientX - startedAt.x, moveEvent.clientY - startedAt.y);
    if (!moved && travelled < DRAG_THRESHOLD) return;

    if (!moved) {
      // Captured here rather than on pointerdown, and this matters. Capturing
      // retargets every later event to the capture element, so the `click`
      // that follows a simple press would arrive on the svg root instead of on
      // the text that was pressed, and inline editing would never open.
      // Capture only once this is definitely a drag and not a click.
      capturePointer(context.svg, moveEvent.pointerId);
    }
    moved = true;
    box.setAttribute("transform", `translate(${origin.x + dx}, ${origin.y + dy})`);
  };

  const up = (upEvent: PointerEvent): void => {
    context.svg.removeEventListener("pointermove", move);
    context.svg.removeEventListener("pointerup", up);
    context.svg.removeEventListener("pointercancel", up);
    if (!moved) return; // a press that never moved is a click, handled elsewhere
    releasePointer(context.svg, upEvent.pointerId);

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
    releasePointer(context.svg, upEvent.pointerId);
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

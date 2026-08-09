import type { Layout } from "../layout/layout.ts";
import { MARGIN } from "../layout/measure.ts";
import { CLASS } from "./theme.ts";

/**
 * Pan and zoom, which in SVG is one attribute rather than a transform stack.
 *
 *     viewBox="minX minY width height"
 *
 * The viewBox says which rectangle of the drawing's own coordinate space is
 * mapped onto the element. Panning moves minX and minY; zooming scales width
 * and height. Nothing per element ever has to change, which is also why the
 * renderer can rebuild the whole tree without disturbing the current view.
 */

export interface ViewBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const MIN_ZOOM_WIDTH = 120;
export const MAX_ZOOM_WIDTH = 20000;

export function toAttribute(view: ViewBox): string {
  return `${round(view.minX)} ${round(view.minY)} ${round(view.width)} ${round(view.height)}`;
}

/**
 * Screen pixels to drawing coordinates. Needed for hit testing and for
 * dragging, where the pointer moves in pixels but the model thinks in its own
 * units, and the two differ by whatever the current zoom is.
 */
export function screenToModel(view: ViewBox, rect: { left: number; top: number; width: number; height: number }, x: number, y: number): Point {
  return {
    x: view.minX + ((x - rect.left) / rect.width) * view.width,
    y: view.minY + ((y - rect.top) / rect.height) * view.height,
  };
}

/**
 * Zoom by `factor` while keeping `anchor` (a point in drawing coordinates)
 * under the same pixel. Without the anchor the drawing slides away from the
 * cursor as you scroll, which feels broken.
 *
 * The anchor sits at a fixed fraction of the view, so keeping that fraction
 * constant while the width changes gives the new origin directly:
 *
 *     minX' = anchor.x - (anchor.x - minX) * factor
 */
export function zoomAt(view: ViewBox, factor: number, anchor: Point): ViewBox {
  const width = clamp(view.width * factor, MIN_ZOOM_WIDTH, MAX_ZOOM_WIDTH);
  const applied = width / view.width;
  return {
    minX: anchor.x - (anchor.x - view.minX) * applied,
    minY: anchor.y - (anchor.y - view.minY) * applied,
    width,
    height: view.height * applied,
  };
}

export function panBy(view: ViewBox, dx: number, dy: number): ViewBox {
  return { ...view, minX: view.minX - dx, minY: view.minY - dy };
}

/**
 * The view that shows the whole drawing, keeping the element's aspect ratio.
 *
 * The origin comes from the drawing rather than being assumed to be zero,
 * because a box dragged up or left sits at a negative coordinate and would
 * otherwise be framed out of its own diagram.
 */
export function fit(drawing: Layout, aspect: number): ViewBox {
  const width = Math.max(drawing.width, MARGIN * 4);
  const height = Math.max(drawing.height, MARGIN * 4);
  const minX = drawing.minX;
  const minY = drawing.minY;
  // Grow one axis rather than shrink the other, so nothing is ever cut off.
  if (width / height > aspect) return { minX, minY, width, height: width / aspect };
  return { minX, minY, width: height * aspect, height };
}

/**
 * Wire wheel zoom and background drag panning onto an svg element.
 *
 * Panning only starts on empty space. A pointerdown on a box belongs to the
 * box, which is how dragging a collection stays separate from dragging the
 * canvas.
 */
export function attachViewport(svg: SVGSVGElement, initial: ViewBox): { get(): ViewBox; set(view: ViewBox): void } {
  let view = initial;

  const apply = (next: ViewBox): void => {
    view = next;
    svg.setAttribute("viewBox", toAttribute(view));
  };

  apply(initial);

  svg.addEventListener(
    "wheel",
    (event: WheelEvent) => {
      event.preventDefault();
      const anchor = screenToModel(view, svg.getBoundingClientRect(), event.clientX, event.clientY);
      apply(zoomAt(view, Math.exp(event.deltaY * 0.001), anchor));
    },
    { passive: false },
  );

  svg.addEventListener("pointerdown", (event: PointerEvent) => {
    const target = event.target as Element | null;
    if (target?.closest(`.${CLASS.box}`)) return;

    const rect = svg.getBoundingClientRect();
    const scale = view.width / rect.width;
    let lastX = event.clientX;
    let lastY = event.clientY;

    try {
      svg.setPointerCapture(event.pointerId);
    } catch {
      // A pan without capture still works while the pointer stays inside.
    }
    svg.classList.add("panning");

    const move = (moveEvent: PointerEvent): void => {
      apply(panBy(view, (moveEvent.clientX - lastX) * scale, (moveEvent.clientY - lastY) * scale));
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    };

    const up = (): void => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
      svg.classList.remove("panning");
    };

    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
  });

  return { get: () => view, set: apply };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

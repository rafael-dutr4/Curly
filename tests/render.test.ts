import test from "node:test";
import assert from "node:assert/strict";

import { badges, edgePath, headerPath, spanAttributes } from "../src/render/svg.ts";
import { translateOf } from "../src/render/interact.ts";
import { fit, panBy, screenToModel, toAttribute, zoomAt, MIN_ZOOM_WIDTH, MAX_ZOOM_WIDTH } from "../src/render/viewport.ts";
import { compile } from "../src/lang/compile.ts";
import { layout } from "../src/layout/layout.ts";

/**
 * The DOM building itself is checked in the browser. What is tested here is
 * everything that is arithmetic or string building, which is where the bugs
 * that are hard to see actually live.
 */

const RECT = { left: 0, top: 0, width: 800, height: 400 };
const VIEW = { minX: 0, minY: 0, width: 800, height: 400 };

// --- paths ----------------------------------------------------------------

test("a normal edge is a straight line between its endpoints", () => {
  const edge = { x1: 10, y1: 20, x2: 300, y2: 40, selfLoop: false } as never;
  assert.equal(edgePath(edge), "M 10 20 L 300 40");
});

test("a self edge bulges out and comes back", () => {
  const edge = { x1: 100, y1: 20, x2: 100, y2: 60, selfLoop: true } as never;
  assert.equal(edgePath(edge), "M 100 20 C 134 20, 134 60, 100 60");
});

test("geometry is rounded so the output is stable", () => {
  const edge = { x1: 10.00001, y1: 20.567, x2: 300, y2: 40, selfLoop: false } as never;
  assert.equal(edgePath(edge), "M 10 20.57 L 300 40");
});

test("the header path closes and only rounds the top corners", () => {
  const path = headerPath(140, 26);
  assert.match(path, /^M 0 26/, "starts at the bottom left");
  assert.match(path, /Z$/, "closes");
  assert.match(path, /Q 0 0 6 0/, "rounds the top left");
  assert.match(path, /Q 140 0 140 6/, "rounds the top right");
});

test("the header stays sane when the box is shorter than the corner radius", () => {
  assert.doesNotThrow(() => headerPath(140, 2));
  assert.match(headerPath(140, 2), /^M 0 2/);
});

// --- small helpers --------------------------------------------------------

test("badges appear only for the annotations that are set", () => {
  assert.equal(badges({ unique: false, indexed: false }), "");
  assert.equal(badges({ unique: true, indexed: false }), "U  ");
  assert.equal(badges({ unique: false, indexed: true }), "I  ");
  assert.equal(badges({ unique: true, indexed: true }), "UI  ");
});

test("span attributes carry the offsets hit testing needs", () => {
  assert.deepEqual(spanAttributes({ start: 4, end: 9, line: 1, col: 5 }), {
    "data-span-start": 4,
    "data-span-end": 9,
  });
});

// --- viewbox --------------------------------------------------------------

test("the viewBox attribute is the four numbers in order", () => {
  assert.equal(toAttribute({ minX: -5, minY: 0, width: 800, height: 400 }), "-5 0 800 400");
});

test("screen pixels map to drawing coordinates through the current view", () => {
  // The view is 1:1 with the element here, so the mapping is the identity.
  assert.deepEqual(screenToModel(VIEW, RECT, 400, 200), { x: 400, y: 200 });

  // Zoomed in 2x, the same pixel is half as far into the drawing.
  const zoomed = { minX: 0, minY: 0, width: 400, height: 200 };
  assert.deepEqual(screenToModel(zoomed, RECT, 400, 200), { x: 200, y: 100 });

  // Panned, the offset is added.
  const panned = { minX: 100, minY: 50, width: 800, height: 400 };
  assert.deepEqual(screenToModel(panned, RECT, 400, 200), { x: 500, y: 250 });
});

test("zooming keeps the anchor point under the same pixel", () => {
  const anchor = { x: 600, y: 300 };
  for (const factor of [0.5, 0.8, 1.25, 2]) {
    const after = zoomAt(VIEW, factor, anchor);
    // The anchor's fraction across the view must not have moved.
    const before = (anchor.x - VIEW.minX) / VIEW.width;
    const now = (anchor.x - after.minX) / after.width;
    assert.ok(Math.abs(before - now) < 1e-9, `x drifted at factor ${factor}`);

    const beforeY = (anchor.y - VIEW.minY) / VIEW.height;
    const nowY = (anchor.y - after.minY) / after.height;
    assert.ok(Math.abs(beforeY - nowY) < 1e-9, `y drifted at factor ${factor}`);
  }
});

test("zooming preserves the aspect ratio", () => {
  const after = zoomAt(VIEW, 0.4, { x: 10, y: 10 });
  assert.ok(Math.abs(after.width / after.height - VIEW.width / VIEW.height) < 1e-9);
});

test("zoom is clamped at both ends", () => {
  let view = VIEW;
  for (let i = 0; i < 200; i += 1) view = zoomAt(view, 0.5, { x: 0, y: 0 });
  assert.equal(view.width, MIN_ZOOM_WIDTH);

  view = VIEW;
  for (let i = 0; i < 200; i += 1) view = zoomAt(view, 2, { x: 0, y: 0 });
  assert.equal(view.width, MAX_ZOOM_WIDTH);
});

test("clamped zoom still preserves the aspect ratio", () => {
  let view = VIEW;
  for (let i = 0; i < 200; i += 1) view = zoomAt(view, 0.5, { x: 0, y: 0 });
  assert.ok(Math.abs(view.width / view.height - VIEW.width / VIEW.height) < 1e-9);
});

test("panning moves the origin against the drag, so content follows the pointer", () => {
  assert.deepEqual(panBy(VIEW, 30, 10), { minX: -30, minY: -10, width: 800, height: 400 });
});

test("fit shows the whole drawing and never crops it", () => {
  const drawing = layout(compile("users @at(0, 0) { a: int }\nfar @at(2000, 1200) { b: int }").model);

  for (const aspect of [0.5, 1, 1.5, 3]) {
    const view = fit(drawing, aspect);
    assert.ok(view.width >= drawing.width, `too narrow at aspect ${aspect}`);
    assert.ok(view.height >= drawing.height, `too short at aspect ${aspect}`);
    assert.ok(Math.abs(view.width / view.height - aspect) < 1e-9, `wrong aspect ${aspect}`);
  }
});

test("fit has a floor, so an empty model does not produce a zero sized view", () => {
  const view = fit(layout(compile("").model), 1.5);
  assert.ok(view.width > 0 && view.height > 0);
});

test("a translate is read back off a group, so a drag starts where the box is", () => {
  const element = { getAttribute: () => "translate(120, 40)" } as unknown as Element;
  assert.deepEqual(translateOf(element), { x: 120, y: 40 });
});

test("translate parsing copes with the shapes SVG allows", () => {
  const cases: [string, { x: number; y: number }][] = [
    ["translate(0, 0)", { x: 0, y: 0 }],
    ["translate(-8.5, 12.25)", { x: -8.5, y: 12.25 }],
    ["translate( 4 8 )", { x: 4, y: 8 }],
    ["", { x: 0, y: 0 }],
    ["scale(2)", { x: 0, y: 0 }],
  ];
  for (const [attribute, expected] of cases) {
    const element = { getAttribute: () => attribute } as unknown as Element;
    assert.deepEqual(translateOf(element), expected, `for ${JSON.stringify(attribute)}`);
  }
});

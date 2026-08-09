import test from "node:test";
import assert from "node:assert/strict";

import { compile } from "../src/lang/compile.ts";
import { labelOf, layout, type LayoutBox } from "../src/layout/layout.ts";
import { BODY_GAP, BOX_GAP, COLUMN_GAP, HEADER_HEIGHT, LINE_HEIGHT, MARGIN, MIN_BOX_WIDTH } from "../src/layout/measure.ts";

function boxes(source: string): LayoutBox[] {
  return [...layout(compile(source).model).boxes];
}

function box(source: string, name: string): LayoutBox {
  const found = boxes(source).find((b) => b.name === name);
  assert.ok(found, `no box named ${name}`);
  return found;
}

function columnsOf(source: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const b of boxes(source)) result[b.name] = b.x;
  return result;
}

test("a box is at least the minimum width", () => {
  assert.equal(box("users { a: int }", "users").width, MIN_BOX_WIDTH);
});

test("a box grows to fit its widest row", () => {
  const narrow = box("users { a: int }", "users").width;
  const wide = box("users { averyveryverylongfieldname: timestamp }", "users").width;
  assert.ok(wide > narrow, `${wide} should exceed ${narrow}`);
});

test("box height is the header plus one line per field", () => {
  const one = box("users { a: int }", "users").height;
  const two = box("users { a: int, b: int }", "users").height;
  assert.equal(two - one, LINE_HEIGHT);
});

test("rows stack down the box, starting a gap below the header", () => {
  const users = box("users { a: int, b: int, c: int }", "users");
  const first = HEADER_HEIGHT + BODY_GAP;
  assert.deepEqual(
    users.rows.map((r) => r.y),
    [first, first + LINE_HEIGHT, first + LINE_HEIGHT * 2],
  );
});

test("the first field is not pressed against the coloured header", () => {
  const users = box("users { a: int }", "users");
  assert.ok(users.rows[0]!.y > HEADER_HEIGHT, "a gap separates the list from the bar above it");
});

test("row coordinates are relative to the box, so the box can be translated", () => {
  const pinned = box("users @at(500, 300) { a: int }", "users");
  assert.equal(pinned.x, 500);
  assert.equal(pinned.rows[0]!.y, HEADER_HEIGHT + BODY_GAP); // not 300 + HEADER_HEIGHT
});

test("an embedded document becomes a nested box inside the row", () => {
  const users = box("users { profile: { name: string, avatar: string } }", "users");
  const row = users.rows[0]!;
  assert.ok(row.nested, "the row should carry a nested box");
  assert.equal(row.nested.rows.length, 2);
  assert.equal(row.typeLabel, "", "an embedded row draws a box, not a type label");
});

test("a parent is wide enough to hold its embedded document and the indent", () => {
  const users = box("users { profile: { someprettylongfieldname: timestamp } }", "users");
  const nested = users.rows[0]!.nested!;
  assert.ok(users.width > nested.width, `${users.width} should exceed ${nested.width}`);
});

test("sizing recurses, so a document inside a document is measured first", () => {
  const shallow = box("users { p: { a: int } }", "users").height;
  const deep = box("users { p: { a: int, q: { b: int } } }", "users").height;
  assert.ok(deep > shallow);
});

// --- placement ------------------------------------------------------------

test("a lone collection starts at the margin", () => {
  const users = box("users { a: int }", "users");
  assert.equal(users.x, MARGIN);
  assert.equal(users.y, MARGIN);
});

test("references lay out left to right, one column per step", () => {
  const source = "users { o: ref(order) }\norder { i: ref(item) }\nitem { a: int }";
  const x = columnsOf(source);
  assert.ok(x["users"]! < x["order"]!, "users should be left of order");
  assert.ok(x["order"]! < x["item"]!, "order should be left of item");
});

test("a column is as far right as the widest box in the column before it", () => {
  const source = "users { o: ref(order) }\norder { a: int }";
  const users = box(source, "users");
  const order = box(source, "order");
  assert.equal(order.x, users.x + users.width + COLUMN_GAP);
});

test("collections in the same layer stack vertically", () => {
  const source = "a { x: int }\nb { x: int }";
  const first = box(source, "a");
  const second = box(source, "b");
  assert.equal(first.x, second.x, "same layer means same column");
  assert.equal(second.y, first.y + first.height + BOX_GAP);
});

test("a collection with @at is pinned exactly there", () => {
  const users = box("users @at(640, 120) { a: int }", "users");
  assert.equal(users.x, 640);
  assert.equal(users.y, 120);
  assert.equal(users.pinned, true);
});

test("a pinned collection does not take a slot in the flow", () => {
  const source = "pinned @at(900, 900) { a: int }\nauto { b: int }";
  const auto = box(source, "auto");
  assert.equal(auto.x, MARGIN, "auto placement ignores the pinned box");
  assert.equal(auto.y, MARGIN);
});

test("a reference cycle lays out instead of recursing forever", () => {
  const source = "a { b: ref(b) }\nb { a: ref(a) }";
  assert.doesNotThrow(() => layout(compile(source).model));
  assert.equal(boxes(source).length, 2);
});

test("a self reference does not push the collection into a later column", () => {
  const node = box("node { parent: ref(node)? }", "node");
  assert.equal(node.x, MARGIN);
});

test("boxes come back in declaration order, whatever their position", () => {
  const source = "third @at(0, 0) { a: int }\nfirst { b: int }\nsecond { c: int }";
  assert.deepEqual(
    boxes(source).map((b) => b.name),
    ["third", "first", "second"],
  );
});

test("layout is deterministic", () => {
  const source = "users { o: ref(order) }\norder { p: { a: int } }";
  assert.deepEqual(layout(compile(source).model), layout(compile(source).model));
});

// --- edges ----------------------------------------------------------------

test("an edge starts on the border of one box and ends on the border of the other", () => {
  const source = "users { o: ref(order) }\norder { a: int }";
  const drawing = layout(compile(source).model);
  const users = drawing.boxes.find((b) => b.name === "users")!;
  const order = drawing.boxes.find((b) => b.name === "order")!;
  const edge = drawing.edges[0]!;

  // order sits to the right, so the line leaves the right side of users and
  // arrives at the left side of order.
  assert.equal(edge.x1, users.x + users.width);
  assert.equal(edge.x2, order.x);
  assert.ok(edge.y1 >= users.y && edge.y1 <= users.y + users.height);
});

test("an edge finds the border whichever way the target sits", () => {
  const above = "a @at(0, 400) { r: ref(b) }\nb @at(0, 0) { x: int }";
  const edge = layout(compile(above).model).edges[0]!;
  const a = layout(compile(above).model).boxes.find((box) => box.name === "a")!;
  assert.equal(edge.y1, a.y, "the line should leave the top of a");
});

test("an unresolved reference draws no edge", () => {
  assert.deepEqual(layout(compile("users { o: ref(nope) }").model).edges, []);
});

test("a self reference is marked as a loop", () => {
  const edge = layout(compile("node { parent: ref(node) }").model).edges[0]!;
  assert.equal(edge.selfLoop, true);
});

test("a reference from inside an embedded document is still drawn", () => {
  const source = "users { profile: { org: ref(org) } }\norg { a: int }";
  const edges = layout(compile(source).model).edges;
  assert.equal(edges.length, 1);
  assert.equal(edges[0]!.fieldName, "org");
});

// --- bounds and labels ----------------------------------------------------

test("the drawing bounds cover every box plus the margin", () => {
  const source = "users @at(600, 400) { a: int }";
  const drawing = layout(compile(source).model);
  const users = drawing.boxes[0]!;
  assert.equal(drawing.minX, users.x - MARGIN);
  assert.equal(drawing.minY, users.y - MARGIN);
  assert.equal(drawing.minX + drawing.width, users.x + users.width + MARGIN);
  assert.equal(drawing.minY + drawing.height, users.y + users.height + MARGIN);
});

test("an automatic layout still starts at the origin", () => {
  // Nothing changes for a model nobody has dragged: placement begins at
  // MARGIN, so the margin subtracted back off lands exactly on zero.
  const drawing = layout(compile("users { a: int }\norder { b: int }").model);
  assert.equal(drawing.minX, 0);
  assert.equal(drawing.minY, 0);
});

test("a box dragged above or left of the origin is still inside the bounds", () => {
  // This is what cut the top off an exported picture: @at takes the
  // coordinates it is given, and dragging upwards makes them negative.
  const drawing = layout(compile("a @at(-120, -60) { x: int }\nb @at(300, 200) { y: int }").model);
  const highest = drawing.boxes.find((box) => box.name === "a")!;

  assert.equal(drawing.minX, -160, "the margin sits outside the leftmost box");
  assert.equal(drawing.minY, -100);
  for (const box of drawing.boxes) {
    assert.ok(box.x >= drawing.minX, `${box.name} starts left of the frame`);
    assert.ok(box.y >= drawing.minY, `${box.name} starts above the frame`);
    assert.ok(box.x + box.width <= drawing.minX + drawing.width, `${box.name} runs past the right`);
    assert.ok(box.y + box.height <= drawing.minY + drawing.height, `${box.name} runs past the bottom`);
  }
  assert.ok(highest.y < 0, "the fixture really does use a negative coordinate");
});

test("an empty model has no boxes and no edges", () => {
  const drawing = layout(compile("").model);
  assert.deepEqual(drawing.boxes, []);
  assert.deepEqual(drawing.edges, []);
});

test("type labels read the way the type was written", () => {
  const cases: [string, string][] = [
    ["users { a: string }", "string"],
    ["users { a: string? }", "string?"],
    ["users { a: string[] }", "string[]"],
    ["users { a: string?[] }", "string?[]"],
    ["users { a: string[]? }", "string[]?"],
    ["users { a: ref(users)[] }", "ref(users)[]"],
  ];
  for (const [source, expected] of cases) {
    const field = compile(source).model.collections[0]!.fields[0]!;
    assert.equal(labelOf(field.type), expected, `for ${source}`);
  }
});

test("laying out a broken model does not throw", () => {
  for (const source of ["users {", "users { a: }", "%%%", "users { a: ref( }", ""]) {
    assert.doesNotThrow(() => layout(compile(source).model), `threw on ${JSON.stringify(source)}`);
  }
});

test("every box reserves an add-field row at the bottom", () => {
  const users = box("users { a: int, b: int }", "users");
  const lastRow = users.rows.at(-1)!;
  assert.equal(users.addRow.y, lastRow.y + lastRow.height, "the strip sits under the last field");
  assert.equal(users.addRow.height, LINE_HEIGHT);
  assert.ok(users.height >= users.addRow.y + users.addRow.height, "the box is tall enough to hold it");
});

test("an embedded document reserves one too, so nested fields can be added", () => {
  const nested = box("users { profile: { name: string } }", "users").rows[0]!.nested!;
  assert.equal(nested.addRow.height, LINE_HEIGHT);
});

test("the reserved space does not change when a box is hovered, because it is always there", () => {
  // Guarded by construction: the geometry has no notion of hover at all.
  const empty = box("users {}", "users");
  assert.equal(empty.addRow.y, HEADER_HEIGHT + BODY_GAP);
});

test("a picture of a dragged model would contain all of it", () => {
  // The export frames the drawing with viewBox="minX minY width height", so
  // this is the arithmetic that decides whether anything is cut off.
  const source = "up @at(0, -200) { a: int }\nleft @at(-300, 0) { b: int }\nfar @at(900, 700) { c: int }";
  const drawing = layout(compile(source).model);

  for (const box of drawing.boxes) {
    assert.ok(box.x >= drawing.minX && box.y >= drawing.minY, `${box.name} above or left of the frame`);
    assert.ok(
      box.x + box.width <= drawing.minX + drawing.width && box.y + box.height <= drawing.minY + drawing.height,
      `${box.name} past the right or bottom of the frame`,
    );
  }
});

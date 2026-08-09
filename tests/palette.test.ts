import test from "node:test";
import assert from "node:assert/strict";

import { collectionColor, collectionHue, nestedColor } from "../src/render/palette.ts";

test("a name always gets the same colour", () => {
  assert.equal(collectionColor("users"), collectionColor("users"));
  assert.equal(collectionHue("order"), collectionHue("order"));
});

test("different names get different colours", () => {
  assert.notEqual(collectionColor("users"), collectionColor("order"));
});

test("hues stay in range", () => {
  for (const name of ["a", "users", "order", "a-very-long-collection-name", "_", "ção"]) {
    const hue = collectionHue(name);
    assert.ok(hue >= 0 && hue < 360, `${name} gave ${hue}`);
  }
});

test("a realistic set of names spreads out rather than clumping", () => {
  // Consecutive hashes can land next to each other, which is why the hue is
  // stepped by the golden angle instead of used directly.
  const names = ["users", "order", "product", "customer", "invoice", "payment", "review", "cart"];
  const hues = names.map(collectionHue).sort((a, b) => a - b);

  let tightest = 360;
  for (let i = 1; i < hues.length; i += 1) tightest = Math.min(tightest, hues[i]! - hues[i - 1]!);
  assert.ok(tightest > 8, `two collections only ${tightest.toFixed(1)} degrees apart`);
});

test("the colour is a plain hsl value an SVG attribute can take", () => {
  assert.match(collectionColor("users"), /^hsl\(\d+(\.\d+)? \d+% \d+%\)$/);
});

test("an embedded document takes a faint version of the same hue", () => {
  const hue = collectionHue("users");
  const nested = nestedColor("users");
  assert.ok(nested.includes(hue.toFixed(1)), "same hue as its parent");
  assert.match(nested, /\/ \d+%\)$/, "and mostly transparent");
});

test("renaming a collection changes its colour, which is the point of naming it", () => {
  assert.notEqual(collectionColor("user"), collectionColor("users"));
});

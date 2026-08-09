import test from "node:test";
import assert from "node:assert/strict";

import { inlineVariables, svgDocument } from "../src/export/image.ts";

const PALETTE: Record<string, string> = {
  "--bg": "#17171a",
  "--text": "#e8e8ec",
  "--border": "#3a3a42",
  "--empty": "",
};
const lookup = (name: string): string => PALETTE[name] ?? "";

// --- inlining the custom properties ---------------------------------------

test("a custom property becomes the value it resolves to", () => {
  assert.equal(inlineVariables(".a { fill: var(--bg); }", lookup), ".a { fill: #17171a; }");
});

test("several on one line are all replaced", () => {
  assert.equal(
    inlineVariables(".a { fill: var(--bg); stroke: var(--border); }", lookup),
    ".a { fill: #17171a; stroke: #3a3a42; }",
  );
});

test("whitespace inside the var is tolerated", () => {
  assert.equal(inlineVariables(".a { fill: var( --bg ); }", lookup), ".a { fill: #17171a; }");
});

test("a fallback is used when the property has no value", () => {
  assert.equal(inlineVariables(".a { fill: var(--empty, #fff); }", lookup), ".a { fill: #fff; }");
  assert.equal(inlineVariables(".a { fill: var(--nope, red); }", lookup), ".a { fill: red; }");
});

test("a var nested in a fallback is resolved too", () => {
  assert.equal(inlineVariables(".a { fill: var(--nope, var(--text)); }", lookup), ".a { fill: #e8e8ec; }");
});

test("an unknown property with no fallback leaves something paintable", () => {
  // Better a visible colour than the literal text `var(--nope)`, which would
  // make the shape vanish from the picture.
  assert.equal(inlineVariables(".a { fill: var(--nope); }", lookup), ".a { fill: currentColor; }");
});

test("css without variables is untouched", () => {
  const css = ".a { fill: #123456; stroke-width: 1.5; }";
  assert.equal(inlineVariables(css, lookup), css);
});

test("inlining terminates on input designed to loop", () => {
  const cyclic = (name: string): string => (name === "--a" ? "var(--a)" : "");
  assert.doesNotThrow(() => inlineVariables(".x { fill: var(--a); }", cyclic));
});

// --- the document ---------------------------------------------------------

test("the document is standalone and correctly sized", () => {
  const svg = svgDocument({ body: "<g/>", css: ".a{fill:red}", width: 300, height: 200, background: "#fff" });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /width="300"/);
  assert.match(svg, /height="200"/);
  assert.match(svg, /viewBox="0 0 300 200"/);
  assert.match(svg, /<style>\.a\{fill:red\}<\/style>/);
  assert.ok(svg.endsWith("</svg>"));
});

test("the whole drawing is exported, so a fractional size rounds up", () => {
  const svg = svgDocument({ body: "", css: "", width: 300.2, height: 199.6, background: null });
  assert.match(svg, /width="301"/);
  assert.match(svg, /height="200"/);
  assert.match(svg, /viewBox="0 0 301 200"/);
});

test("a background is painted behind everything, and is optional", () => {
  const withBackground = svgDocument({ body: "<g id='x'/>", css: "", width: 10, height: 10, background: "#000" });
  assert.ok(withBackground.indexOf('<rect width="10"') < withBackground.indexOf("<g id='x'/>"), "behind the drawing");

  const without = svgDocument({ body: "<g/>", css: "", width: 10, height: 10, background: null });
  assert.ok(!without.includes("<rect"));
});

test("an empty model still produces a valid picture", () => {
  const svg = svgDocument({ body: "", css: "", width: 0, height: 0, background: "#fff" });
  assert.match(svg, /width="1"/, "never zero sized, which no encoder accepts");
  assert.match(svg, /height="1"/);
});

test("the frame starts at the drawing's own origin, not at zero", () => {
  // A box dragged up or left has negative coordinates, and a viewBox that
  // began at zero simply cut them off. This is the bug that lost the top of
  // an exported model.
  const svg = svgDocument({ body: "<g/>", css: "", minX: -160, minY: -100, width: 500, height: 400, background: "#fff" });
  assert.match(svg, /viewBox="-160 -100 500 400"/);
  assert.match(svg, /<rect x="-160" y="-100" width="500" height="400"/, "the backdrop covers the same rectangle");
  assert.match(svg, /width="500"/, "the file is still the size of the content");
});

test("an origin at zero is written plainly, as before", () => {
  const svg = svgDocument({ body: "", css: "", minX: 0, minY: 0, width: 300, height: 200, background: null });
  assert.match(svg, /viewBox="0 0 300 200"/);
});

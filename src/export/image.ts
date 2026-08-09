/**
 * Exporting the diagram as a picture.
 *
 * The renderer deliberately keeps no colour of its own: the SVG on screen is
 * structure and geometry, and everything visible about it comes from the
 * stylesheet. That is the right call for the application and the whole
 * problem for an export, because a serialized `<svg>` carries none of it and
 * renders as black text on nothing.
 *
 * So an export is three steps:
 *
 *   1. copy the drawing, without the controls that only exist for a pointer
 *   2. inline the rules that style it, with every var() resolved to a value
 *   3. hand that to an <img>, paint it on a canvas, and read a PNG back
 *
 * The rules are read from the live stylesheet rather than written out again
 * here. A second copy of the diagram's appearance would drift from the first
 * the day either changes, and then the picture stops matching the screen.
 */

import type { Layout } from "../layout/layout.ts";

/** Drawn at twice the size, so the text is not soft on a normal display. */
export const DEFAULT_SCALE = 2;

/** Controls that exist only for a pointer and mean nothing in a picture. */
const INTERACTIVE = [".curly-action", ".curly-handle", ".curly-add", ".curly-linking"];

/**
 * Replace every `var(--name)` with what it currently resolves to.
 *
 * Custom properties are inherited from the document, and the exported SVG has
 * no document to inherit from, so they have to be flattened at export time.
 * A fallback inside the var() is used when the property itself is empty.
 */
export function inlineVariables(css: string, lookup: (name: string) => string): string {
  // Innermost first, because a fallback can itself be a var().
  const pattern = /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g;
  let previous = "";
  let result = css;
  while (result !== previous) {
    previous = result;
    result = result.replace(pattern, (_match, name: string, fallback?: string) => {
      const value = lookup(name).trim();
      return value || (fallback ?? "").trim() || "currentColor";
    });
  }
  return result;
}

/** Wrap the drawing in a standalone SVG document that needs nothing else. */
export function svgDocument(options: {
  readonly body: string;
  readonly css: string;
  readonly width: number;
  readonly height: number;
  readonly background: string | null;
}): string {
  const { body, css, width, height, background } = options;
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  // A picture with no background is unreadable the moment it is pasted onto a
  // page the opposite colour, so the theme's own background is painted in.
  const backdrop = background ? `<rect width="${w}" height="${h}" fill="${background}"/>` : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<style>${css}</style>`,
    backdrop,
    body,
    "</svg>",
  ].join("");
}

/**
 * Every rule that styles the diagram, taken from the stylesheet the page is
 * actually using.
 *
 * `:hover` rules are dropped: a picture has no pointer, and keeping them would
 * only be dead text. Cross origin stylesheets throw when read, which is not an
 * error worth reporting, so they are skipped.
 */
export function diagramCss(owner: Document): string {
  const collected: string[] = [];

  for (const sheet of Array.from(owner.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules ?? [])) {
      if (!(rule instanceof CSSStyleRule)) continue;
      const selector = rule.selectorText;
      if (!selector.includes("curly-")) continue;
      if (selector.includes(":hover")) continue;
      collected.push(rule.cssText);
    }
  }

  const computed = getComputedStyle(owner.documentElement);
  return inlineVariables(collected.join("\n"), (name) => computed.getPropertyValue(name));
}

/**
 * The whole model, at its natural size, not whatever is currently on screen.
 *
 * Exporting the viewport would make the picture depend on where the diagram
 * happened to be scrolled, which is never what someone wants from a file.
 */
export function diagramSvg(svg: SVGSVGElement, drawing: Layout, background: string | null): string {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  for (const selector of INTERACTIVE) {
    for (const node of Array.from(copy.querySelectorAll(selector))) node.remove();
  }

  return svgDocument({
    body: copy.innerHTML,
    css: diagramCss(svg.ownerDocument),
    width: drawing.width,
    height: drawing.height,
    background,
  });
}

/**
 * Rasterize by letting the browser do it: an SVG loaded into an image is
 * rendered by the same engine that drew it on screen, so nothing has to
 * reimplement text layout or path filling.
 *
 * The SVG references nothing outside itself, which is what keeps the canvas
 * untainted and `toBlob` allowed to read the pixels back.
 */
export async function svgToPng(svgText: string, scale = DEFAULT_SCALE): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await load(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("this browser gave no 2d canvas to draw on");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("the canvas produced no image"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("the diagram could not be rendered as an image")));
    image.src = url;
  });
}

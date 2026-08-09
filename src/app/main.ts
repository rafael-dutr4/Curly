import { layout } from "../layout/layout.ts";
import { attachInteraction } from "../render/interact.ts";
import { renderDiagram } from "../render/svg.ts";
import { attachViewport, fit } from "../render/viewport.ts";
import { createDocument } from "./document.ts";
import { attachEditor, attachHistoryShortcuts } from "./editor.ts";
import { loadBuffer, saveBuffer } from "./storage.ts";
import { STARTER } from "./starter.ts";

/**
 * Wiring, and nothing else. The pipeline runs in one direction:
 *
 *   document (a string)
 *     -> compile (lex, parse, resolve)
 *     -> layout   (geometry)
 *     -> render   (SVG)
 *
 * and every change, whether typed or made on the diagram, goes back through
 * the document rather than touching the screen directly.
 */

const textarea = document.getElementById("source") as HTMLTextAreaElement | null;
const diagnostics = document.getElementById("diagnostics");
const svg = document.getElementById("diagram") as SVGSVGElement | null;

if (textarea && diagnostics && svg) {
  const model = createDocument(loadBuffer() ?? STARTER);

  attachEditor(textarea, diagnostics, model);
  attachHistoryShortcuts(window, model);

  const rect = svg.getBoundingClientRect();
  const aspect = rect.height > 0 ? rect.width / rect.height : 1.5;
  const viewport = attachViewport(svg, fit(layout(model.compilation().model), aspect));

  attachInteraction({
    svg,
    surface: svg.parentElement ?? document.body,
    document: model,
    view: viewport.get,
  });

  const draw = (): void => {
    renderDiagram(svg, layout(model.compilation().model));
  };

  /**
   * Typing debounces; anything else draws at once.
   *
   * A full reparse is microseconds, so the debounce is not about the parser.
   * It is about not rebuilding a few hundred SVG elements between two letters
   * of a word. A gesture has no such problem: there is one of it, and the
   * result has to appear under the pointer immediately.
   */
  let pending: number | undefined;
  model.subscribe((change) => {
    saveBuffer(change.source);
    if (change.origin === "typing") {
      if (pending !== undefined) clearTimeout(pending);
      pending = setTimeout(draw, 150);
      return;
    }
    if (pending !== undefined) clearTimeout(pending);
    draw();
  });

  draw();
}

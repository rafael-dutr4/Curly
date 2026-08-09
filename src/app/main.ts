import { layout } from "../layout/layout.ts";
import { attachInteraction } from "../render/interact.ts";
import { renderDiagram } from "../render/svg.ts";
import { attachViewport, fit } from "../render/viewport.ts";
import { toJsonSchema, toMongoValidators } from "../export/jsonschema.ts";
import { sampleDocuments } from "../export/samples.ts";
import { createDocument, type CurlyDocument } from "./document.ts";
import { downloadJson } from "./download.ts";
import { type FileHandleLike, openModel, saveModel } from "./files.ts";
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
  wireFiles(model);

  /**
   * Exporting a model that does not resolve would produce a schema with holes
   * in it, so the buttons turn off while there are errors rather than handing
   * over something quietly wrong. Warnings are fine.
   */
  const exporters: [string, () => void][] = [
    ["export-schema", () => downloadJson("curly.schema.json", toJsonSchema(model.compilation().model))],
    ["export-validator", () => downloadJson("curly.validators.json", toMongoValidators(model.compilation().model))],
    ["export-samples", () => downloadJson("curly.samples.json", sampleDocuments(model.compilation().model))],
  ];

  const buttons = exporters.map(([id, run]) => {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    button?.addEventListener("click", run);
    return button;
  });

  const updateExports = (): void => {
    const broken = model.compilation().diagnostics.some((d) => d.severity === "error");
    for (const button of buttons) {
      if (!button) continue;
      button.disabled = broken;
      button.title = broken ? "Fix the errors before exporting" : "";
    }
  };

  let pending: number | undefined;
  model.subscribe((change) => {
    saveBuffer(change.source);
    updateExports();
    if (change.origin === "typing") {
      if (pending !== undefined) clearTimeout(pending);
      pending = setTimeout(draw, 150);
      return;
    }
    if (pending !== undefined) clearTimeout(pending);
    draw();
  });

  draw();
  updateExports();
}

/**
 * Open, Save, and the example menu.
 *
 * The open file's handle is remembered so Save writes back to it instead of
 * dropping a second copy in the downloads folder. Loading anything new clears
 * the handle, because saving after that should ask where to put it rather
 * than quietly overwrite the file that happens to still be open.
 */
function wireFiles(model: CurlyDocument): void {
  let handle: FileHandleLike | null = null;
  let name = "model.curly";

  document.getElementById("file-open")?.addEventListener("click", async () => {
    const opened = await openModel();
    if (!opened) return;
    handle = opened.handle;
    name = opened.name;
    model.set(opened.text, "load");
  });

  document.getElementById("file-save")?.addEventListener("click", async () => {
    handle = await saveModel(model.source(), handle, name);
  });

  const examples = document.getElementById("examples") as HTMLSelectElement | null;
  examples?.addEventListener("change", async () => {
    const path = examples.value;
    examples.value = "";
    if (!path) return;

    const response = await fetch(path);
    if (!response.ok) return;
    handle = null;
    name = path.split("/").at(-1) ?? "model.curly";
    model.set(await response.text(), "load");
  });
}

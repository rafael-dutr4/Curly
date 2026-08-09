import { layout } from "../layout/layout.ts";
import { attachInteraction } from "../render/interact.ts";
import { renderDiagram } from "../render/svg.ts";
import { attachViewport, fit } from "../render/viewport.ts";
import { toJsonSchema, toMongoValidators } from "../export/jsonschema.ts";
import { sampleDocuments } from "../export/samples.ts";
import { createDocument, type CurlyDocument } from "./document.ts";
import { chooseExample, confirmDiscard } from "./dialog.ts";
import { downloadJson } from "./download.ts";
import { EXAMPLES } from "./examples.ts";
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

  const workspace = document.getElementById("workspace");
  const sourceToggle = document.getElementById("toggle-source") as HTMLButtonElement | null;

  /** Reveal the text pane, used by the Source button and by clicking a diagnostic. */
  const showSource = (visible: boolean): void => {
    workspace?.classList.toggle("source-hidden", !visible);
    sourceToggle?.setAttribute("aria-pressed", String(visible));
  };

  sourceToggle?.addEventListener("click", () => {
    showSource(workspace?.classList.contains("source-hidden") ?? true);
  });

  // A diagnostic selects its span in the textarea, which is no use if the
  // textarea is not on screen.
  attachEditor(textarea, diagnostics, model, () => showSource(true));
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
    // The markup already explains what each export is. Keep that and add the
    // reason on top when the button is off, rather than replacing it.
    return { button, explanation: button?.title ?? "" };
  });

  const updateExports = (): void => {
    const broken = model.compilation().diagnostics.some((d) => d.severity === "error");
    for (const { button, explanation } of buttons) {
      if (!button) continue;
      button.disabled = broken;
      button.title = broken ? `Fix the errors first. ${explanation}` : explanation;
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

  /**
   * The text as it was the last time it was loaded or saved. Anything else on
   * screen is unsaved work, and replacing it has to be asked about first.
   *
   * Comparing the whole string is exact and costs nothing at this size, which
   * beats a dirty flag that has to be cleared in every path that changes the
   * document and goes wrong the first time one is missed.
   */
  let pristine = model.source();
  const isDirty = (): boolean => model.source() !== pristine;

  /** True when it is safe to throw the current model away. */
  const mayReplace = async (what: string): Promise<boolean> => {
    if (!isDirty()) return true;
    return confirmDiscard(
      "Discard your changes?",
      `You have edits that are not saved to a file. Loading ${what} replaces them, and this cannot be undone.`,
    );
  };

  document.getElementById("file-open")?.addEventListener("click", async () => {
    if (!(await mayReplace("another model"))) return;
    const opened = await openModel();
    if (!opened) return;
    handle = opened.handle;
    name = opened.name;
    model.set(opened.text, "load");
    pristine = opened.text;
  });

  document.getElementById("file-save")?.addEventListener("click", async () => {
    const saved = model.source();
    handle = await saveModel(saved, handle, name);
    // Saved is saved whether it went to a handle or to the downloads folder.
    pristine = saved;
  });

  document.getElementById("load-example")?.addEventListener("click", async () => {
    // Asked before the chooser opens, so a cancelled confirmation does not
    // leave a second dialog behind it.
    if (!(await mayReplace("an example"))) return;

    const example = await chooseExample(EXAMPLES);
    if (!example) return;

    const response = await fetch(example.path);
    if (!response.ok) return;

    const text = await response.text();
    handle = null;
    name = example.path.split("/").at(-1) ?? "model.curly";
    model.set(text, "load");
    pristine = text;
  });
}

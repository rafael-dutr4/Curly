import { compile } from "../lang/compile.ts";
import { layout } from "../layout/layout.ts";
import { renderDiagram } from "../render/svg.ts";
import { attachViewport, fit } from "../render/viewport.ts";

/**
 * Entry point. The pipeline, wired end to end:
 *
 *   source text -> compile (lex, parse, resolve) -> layout -> render
 *
 * There is one piece of state and it is the textarea's string. Everything on
 * screen is derived from it on every change, which is the whole reason the two
 * panes cannot disagree.
 *
 * The full app shell (undo, autosave, clickable diagnostics) lands in its own
 * milestone. This is the smallest wiring that draws.
 */

const STARTER = `// A model reads like a sample document.
// Embedding is a nested {} and draws as a box inside a box.
// A reference is ref(other) and draws as an arrow.

users {
  _id: objectId,
  email: string @unique,
  createdAt: timestamp,
  profile: {
    name: string,
    avatar: string?
  },
  orders: ref(order)[]
}

order {
  _id: objectId,
  total: decimal,
  placedAt: timestamp @index,
  items: [{
    sku: string,
    qty: int
  }]
}

item @at(880, 60) {
  _id: objectId,
  sku: string @unique,
  name: string
}
`;

const sourceInput = document.getElementById("source") as HTMLTextAreaElement | null;
const diagnosticList = document.getElementById("diagnostics");
const svg = document.getElementById("diagram") as SVGSVGElement | null;

if (sourceInput && svg) {
  sourceInput.value = STARTER;

  const rect = svg.getBoundingClientRect();
  const aspect = rect.height > 0 ? rect.width / rect.height : 1.5;
  const viewport = attachViewport(svg, fit(layout(compile(STARTER).model), aspect));

  const draw = (): void => {
    const compilation = compile(sourceInput.value);
    renderDiagram(svg, layout(compilation.model));
    showDiagnostics(compilation.diagnostics);
  };

  // A full reparse per keystroke is microseconds, but rebuilding the SVG on
  // every character is wasted work while someone is mid word.
  let pending: number | undefined;
  sourceInput.addEventListener("input", () => {
    if (pending !== undefined) clearTimeout(pending);
    pending = setTimeout(draw, 150);
  });

  draw();
  viewport.set(viewport.get());
}

function showDiagnostics(diagnostics: readonly { severity: string; message: string; span: { line: number } }[]): void {
  if (!diagnosticList) return;
  diagnosticList.replaceChildren(
    ...diagnostics.map((d) => {
      const item = document.createElement("li");
      item.className = d.severity;
      item.textContent = `line ${d.span.line}: ${d.message}`;
      return item;
    }),
  );
}

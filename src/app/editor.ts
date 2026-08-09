import type { Compilation } from "../lang/compile.ts";
import type { Span } from "../lang/token.ts";
import { replace, type TextEdit } from "../edit/textedit.ts";
import { type Fix, lint } from "../lint/lint.ts";
import type { CurlyDocument } from "./document.ts";
import { highlight, lineAt, lineCount } from "./highlight.ts";

/**
 * The text pane: a numbered, highlighted view of the model.
 *
 * A textarea cannot colour its own text, so the pane is three layers that
 * have to agree to the pixel:
 *
 *     gutter      the line numbers, scrolled with the text
 *     <pre>       the highlighted copy, painted underneath
 *     <textarea>  transparent text, visible caret, all the real behaviour
 *
 * Keeping the textarea is the point. Selection, the caret, undo shortcuts,
 * IME and accessibility all come free, and none of them would if this were a
 * contenteditable div pretending to be an editor.
 *
 * The textarea is still a view of the document, not a second copy. When a
 * diagram gesture, an undo or an applied fix changes the text, the value is
 * written back here and the caret restored.
 */

/**
 * A line in the list under the diagram. Errors and warnings come from
 * compiling; notes and advice come from the linter. They share a list because
 * from where the user sits they are the same thing: something worth reading
 * about the model, attached to a place in it.
 */
interface Entry {
  readonly level: string;
  readonly label: string;
  readonly message: string;
  readonly span: Span;
  readonly fix?: Fix;
}

export interface EditorParts {
  readonly textarea: HTMLTextAreaElement;
  readonly mirror: HTMLElement;
  readonly gutter: HTMLElement;
  readonly band: HTMLElement;
  readonly list: HTMLElement;
}

export function attachEditor(parts: EditorParts, document_: CurlyDocument, reveal: () => void = () => {}): void {
  const { textarea, mirror, gutter, band, list } = parts;
  let typing = false;
  /** A line called out by clicking a finding, kept until the text changes. */
  let flagged: number | null = null;

  const paint = (source: string): void => {
    mirror.innerHTML = highlight(source);
    paintGutter(gutter, lineCount(source));
    syncScroll();
  };

  /**
   * The mirror and the gutter are moved, not scrolled.
   *
   * Setting their scrollTop looked equivalent and was not: a scroll container
   * clamps at its own maximum, and the textarea's maximum is larger because
   * its horizontal scrollbar takes 15px of height that the other two layers
   * do not lose. Near the bottom of a file with long lines the three drifted
   * apart by up to that scrollbar, which is the misalignment that was
   * reported. A transform has no maximum to clamp against.
   */
  const syncScroll = (): void => {
    mirror.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    gutter.style.transform = `translateY(${-textarea.scrollTop}px)`;
    positionBand();
  };

  const positionBand = (): void => {
    const line = flagged ?? lineAt(textarea.value, textarea.selectionStart);
    const height = lineHeightOf(textarea);
    band.style.height = `${height}px`;
    band.style.transform = `translateY(${(line - 1) * height - textarea.scrollTop}px)`;
    band.classList.toggle("flagged", flagged !== null);
    markCurrentLine(gutter, line);
  };

  const select = (entry: Entry): void => {
    reveal();
    flagged = entry.span.line;
    textarea.focus();
    textarea.setSelectionRange(entry.span.start, entry.span.end);
    scrollLineIntoView(textarea, entry.span.line);
    positionBand();
  };

  const applyFix = (entry: Entry): void => {
    if (!entry.fix) return;
    flagged = null;
    // One operation, so accepting a fix is one undo step and as easy to reject.
    document_.run(() => [...entry.fix!.edits]);
  };

  textarea.value = document_.source();
  paint(textarea.value);

  textarea.addEventListener("input", () => {
    typing = true;
    flagged = null; // the call-out belonged to the text as it was
    document_.set(textarea.value, "typing");
    typing = false;
    paint(textarea.value);
  });

  textarea.addEventListener("scroll", syncScroll, { passive: true });
  for (const event of ["click", "keyup", "select", "focus"]) {
    textarea.addEventListener(event, positionBand);
  }
  textarea.addEventListener("blur", () => document_.commit());

  document_.subscribe((change) => {
    if (!typing && textarea.value !== change.source) {
      const caret = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = change.source;
      const limit = change.source.length;
      textarea.setSelectionRange(Math.min(caret, limit), Math.min(end, limit));
      paint(change.source);
    }
    renderList(list, entriesFor(change.compilation), select, applyFix);
  });

  renderList(list, entriesFor(document_.compilation()), select, applyFix);
}

/**
 * Compile first, then lint, and only lint a model that resolves. Advice about
 * the shape of a model that does not parse is noise stacked on an error the
 * user is already reading.
 */
function entriesFor(compilation: Compilation): Entry[] {
  const entries: Entry[] = compilation.diagnostics.map((d) => ({
    level: d.severity,
    label: d.severity,
    message: d.message,
    span: d.span,
    // A diagnostic only ever knows one repair: replace what it points at.
    ...(d.fix ? { fix: { title: d.fix.title, edits: [replace(d.span, d.fix.replaceWith)] as TextEdit[] } } : {}),
  }));

  if (!compilation.diagnostics.some((d) => d.severity === "error")) {
    for (const finding of lint(compilation.model, compilation.source)) {
      entries.push({
        level: finding.level,
        label: finding.rule,
        message: finding.message,
        span: finding.span,
        ...(finding.fix ? { fix: finding.fix } : {}),
      });
    }
  }

  return entries;
}

function renderList(
  list: HTMLElement,
  entries: readonly Entry[],
  select: (entry: Entry) => void,
  applyFix: (entry: Entry) => void,
): void {
  list.replaceChildren(
    ...entries.map((entry) => {
      const item = list.ownerDocument.createElement("li");
      item.className = entry.level;

      const label = list.ownerDocument.createElement("span");
      label.className = "label";
      label.textContent = entry.label;

      // A button, not a list item with a handler: it is keyboard reachable
      // and announces itself without any aria of our own.
      const message = list.ownerDocument.createElement("button");
      message.type = "button";
      message.className = "message";
      message.textContent = `line ${entry.span.line}: ${entry.message}`;
      message.addEventListener("click", () => select(entry));

      item.append(label, message);

      if (entry.fix) {
        const fix = list.ownerDocument.createElement("button");
        fix.type = "button";
        fix.className = "fix";
        fix.textContent = entry.fix.title;
        fix.title = "Apply this change to the model";
        fix.addEventListener("click", () => applyFix(entry));
        item.append(fix);
      }

      return item;
    }),
  );
}

function paintGutter(gutter: HTMLElement, lines: number): void {
  // Rebuilding a thousand divs on every keystroke would be silly, and the
  // count only changes when a line is added or removed.
  if (gutter.childElementCount === lines) return;
  const owner = gutter.ownerDocument;
  gutter.replaceChildren(
    ...Array.from({ length: lines }, (_, i) => {
      const line = owner.createElement("div");
      line.textContent = String(i + 1);
      return line;
    }),
  );
}

function markCurrentLine(gutter: HTMLElement, line: number): void {
  gutter.querySelector(".current")?.classList.remove("current");
  gutter.children[line - 1]?.classList.add("current");
}

function scrollLineIntoView(textarea: HTMLTextAreaElement, line: number): void {
  const height = lineHeightOf(textarea);
  const top = (line - 1) * height;
  const visible = textarea.clientHeight;
  if (top < textarea.scrollTop || top > textarea.scrollTop + visible - height) {
    // A third of the way down, rather than at the very top, so the line has
    // some of its context above it.
    textarea.scrollTop = Math.max(0, top - visible / 3);
  }
}

/** Read from the stylesheet rather than assumed, so the three layers cannot drift. */
function lineHeightOf(element: HTMLElement): number {
  const value = Number.parseFloat(getComputedStyle(element).lineHeight);
  return Number.isFinite(value) && value > 0 ? value : 20;
}

/**
 * Undo and redo are handled by the document, not by the textarea.
 *
 * The browser keeps its own undo stack for a textarea, and it knows nothing
 * about the edits a diagram gesture or an applied fix made. Two stacks would
 * disagree the first time someone accepts a fix and presses the shortcut.
 */
export function attachHistoryShortcuts(target: Window, document_: CurlyDocument): void {
  target.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) document_.redo();
    else document_.undo();
  });
}

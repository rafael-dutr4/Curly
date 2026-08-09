import type { Diagnostic } from "../lang/diagnostic.ts";
import type { CurlyDocument } from "./document.ts";

/**
 * The text pane: a plain textarea plus the diagnostics under it.
 *
 * The textarea is a view of the document, not a second copy of it. When a
 * diagram gesture or an undo changes the text, the value is written back here
 * and the caret is restored, because the alternative (letting the textarea
 * keep its own idea of the text) is exactly the two-sources-of-truth problem
 * the whole design exists to avoid.
 *
 * There is no syntax highlighting yet. A textarea cannot colour its own text,
 * so it needs a `<pre>` mirrored underneath, and the lexer already makes that
 * straightforward when it is worth doing.
 */

export function attachEditor(
  textarea: HTMLTextAreaElement,
  list: HTMLElement,
  document_: CurlyDocument,
  /** Called before a diagnostic is revealed, so the pane can be opened first. */
  reveal: () => void = () => {},
): void {
  let typing = false;

  textarea.value = document_.source();

  textarea.addEventListener("input", () => {
    typing = true;
    document_.set(textarea.value, "typing");
    typing = false;
  });

  // Leaving the field ends the undo run, so coming back starts a fresh step.
  textarea.addEventListener("blur", () => document_.commit());

  document_.subscribe((change) => {
    // A change that came from this textarea is already on screen. Writing the
    // value back would move the caret to the end for no reason.
    if (!typing && textarea.value !== change.source) {
      const caret = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = change.source;
      const limit = change.source.length;
      textarea.setSelectionRange(Math.min(caret, limit), Math.min(end, limit));
    }
    renderDiagnostics(list, textarea, change.compilation.diagnostics, reveal);
  });

  renderDiagnostics(list, textarea, document_.compilation().diagnostics, reveal);
}

/**
 * Undo and redo are handled by the document, not by the textarea.
 *
 * The browser keeps its own undo stack for a textarea, and it knows nothing
 * about the edits a diagram gesture made. Two stacks would disagree the first
 * time someone drags a box and presses the shortcut, so the native one is
 * suppressed and there is exactly one history for both kinds of change.
 *
 * Bound on the window rather than the textarea so the shortcut also works
 * while the pointer is over the diagram.
 */
export function attachHistoryShortcuts(target: Window, document_: CurlyDocument): void {
  target.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) document_.redo();
    else document_.undo();
  });
}

function renderDiagnostics(
  list: HTMLElement,
  textarea: HTMLTextAreaElement,
  diagnostics: readonly Diagnostic[],
  reveal: () => void,
): void {
  list.replaceChildren(
    ...diagnostics.map((diagnostic) => {
      const item = list.ownerDocument.createElement("li");
      item.className = diagnostic.severity;
      item.textContent = `line ${diagnostic.span.line}: ${diagnostic.message}`;
      item.tabIndex = 0;

      // The span is already the right thing to select, which is the payoff for
      // carrying it from the lexer all the way here.
      const select = (): void => {
        reveal();
        textarea.focus();
        textarea.setSelectionRange(diagnostic.span.start, diagnostic.span.end);
      };
      item.addEventListener("click", select);
      item.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });

      return item;
    }),
  );
}

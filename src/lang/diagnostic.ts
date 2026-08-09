import type { Message } from "../i18n/messages.ts";
import type { Span } from "./token.ts";

export type Severity = "error" | "warning";

/**
 * A problem found in the source, attached to the exact place it happened.
 *
 * Nothing in the pipeline throws. Every stage returns its result together with
 * the diagnostics it produced, so a file with mistakes still yields a partial
 * model and the diagram keeps drawing whatever was understood.
 */
/**
 * A repair the user can accept with one click.
 *
 * It is deliberately the smallest possible thing: replace the text the
 * diagnostic already points at. That covers every case where the checker
 * knows the answer (a misspelled type, a reference to the wrong name, an
 * annotation nothing understands) without letting this module know anything
 * about editing. Bigger repairs belong to the linter, which can build real
 * patches.
 */
export interface Suggestion {
  readonly title: Message;
  readonly replaceWith: string;
}

export interface Diagnostic {
  readonly severity: Severity;
  /**
   * What to say, not the words to say it in. The checker is pure and runs the
   * same in every language, so it names a message and hands over the parts
   * that vary; `src/app/editor.ts` words it when it paints the list.
   */
  readonly message: Message;
  readonly span: Span;
  readonly fix?: Suggestion;
}

export function error(span: Span, message: Message, fix?: Suggestion): Diagnostic {
  return fix ? { severity: "error", message, span, fix } : { severity: "error", message, span };
}

export function warning(span: Span, message: Message, fix?: Suggestion): Diagnostic {
  return fix ? { severity: "warning", message, span, fix } : { severity: "warning", message, span };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

import type { Span } from "./token.ts";

export type Severity = "error" | "warning";

/**
 * A problem found in the source, attached to the exact place it happened.
 *
 * Nothing in the pipeline throws. Every stage returns its result together with
 * the diagnostics it produced, so a file with mistakes still yields a partial
 * model and the diagram keeps drawing whatever was understood.
 */
export interface Diagnostic {
  readonly severity: Severity;
  readonly message: string;
  readonly span: Span;
}

export function error(span: Span, message: string): Diagnostic {
  return { severity: "error", message, span };
}

export function warning(span: Span, message: string): Diagnostic {
  return { severity: "warning", message, span };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

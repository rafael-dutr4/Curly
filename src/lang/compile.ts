import type { Diagnostic } from "./diagnostic.ts";
import type { FileNode } from "./ast.ts";
import type { Model } from "./model.ts";
import { parse } from "./parser.ts";
import { resolve } from "./resolve.ts";

/**
 * The whole front end in one call: text in, model and diagnostics out.
 *
 * Everything downstream (layout, rendering, the exporters, the edit layer)
 * takes a Compilation, and the app recomputes one on every change. There is no
 * incremental anything, because a full pass over a model file is microseconds.
 */
export interface Compilation {
  readonly source: string;
  readonly file: FileNode;
  readonly model: Model;
  readonly diagnostics: readonly Diagnostic[];
}

export function compile(source: string): Compilation {
  const parsed = parse(source);
  const resolved = resolve(parsed.file);
  return {
    source,
    file: parsed.file,
    model: resolved.model,
    diagnostics: [...parsed.diagnostics, ...resolved.diagnostics],
  };
}

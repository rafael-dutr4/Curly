import { lex } from "./lexer.ts";
import { type Diagnostic, error } from "./diagnostic.ts";
import { describeKind, type Span, type Token, type TokenKind } from "./token.ts";
import type {
  AnnotationNode,
  ArgNode,
  BlockNode,
  CollectionNode,
  DirectiveNode,
  EntryNode,
  FieldNode,
  FileNode,
  NameNode,
  TypeNode,
} from "./ast.ts";

/**
 * Recursive descent: every grammar rule becomes a function, and a rule that
 * mentions another rule calls it. `parseBlock` is `block := "{" field* "}"`
 * written out, and nothing more clever than that is happening anywhere here.
 *
 * The parser never throws. In a live editor the file is broken on almost every
 * keystroke, so an exception would mean a blank diagram most of the time.
 * Instead it records a diagnostic and recovers by skipping to a token that
 * reliably starts the next construct (panic mode recovery), which is why
 *
 *     users {
 *       email string,     <- the colon is missing
 *       name: string
 *     }
 *
 * still produces a `users` collection containing `name`, with one error
 * pointing at line 2.
 */

export interface ParseResult {
  readonly file: FileNode;
  readonly diagnostics: readonly Diagnostic[];
}

export function parse(source: string): ParseResult {
  const lexed = lex(source);
  // Comments are never part of the tree. They survive because editing patches
  // the source text rather than regenerating it from the tree.
  const tokens = lexed.tokens.filter((t) => t.kind !== "comment");
  const diagnostics: Diagnostic[] = [...lexed.diagnostics];

  let index = 0;

  const peek = (offset = 0): Token =>
    tokens[Math.max(0, Math.min(index + offset, tokens.length - 1))]!;
  const check = (kind: TokenKind): boolean => peek().kind === kind;
  const atEnd = (): boolean => check("eof");

  const next = (): Token => {
    const token = peek();
    if (index < tokens.length - 1) index += 1;
    return token;
  };

  const report = (span: Span, message: string): void => {
    diagnostics.push(error(span, message));
  };

  const expect = (kind: TokenKind, what: string): Token | undefined => {
    if (check(kind)) return next();
    report(peek().span, `expected ${what}, found ${describeKind(peek().kind)}`);
    return undefined;
  };

  /**
   * Skip to the start of the next field. Nested braces are stepped over as a
   * unit, so an error deep inside an embedded document does not stop at that
   * document's closing brace and mistake it for the end of the outer block.
   * Returns false when the file ran out.
   */
  const syncInBlock = (): boolean => {
    let depth = 0;
    while (!atEnd()) {
      const kind = peek().kind;
      if (kind === "lbrace" || kind === "lbracket" || kind === "lparen") {
        depth += 1;
      } else if (kind === "rbrace" || kind === "rbracket" || kind === "rparen") {
        if (depth === 0) return kind === "rbrace";
        depth -= 1;
      } else if (kind === "comma" && depth === 0) {
        next();
        return true;
      }
      next();
    }
    return false;
  };

  /**
   * Skip to something that looks like the start of a top level entry: a name in
   * the first column, or an `@` in the first column for a directive.
   */
  const syncTopLevel = (): void => {
    next();
    while (!atEnd()) {
      const token = peek();
      if ((token.kind === "ident" || token.kind === "at") && token.span.col === 1) return;
      next();
    }
  };

  function parseName(what: string): NameNode | undefined {
    const token = expect("ident", what);
    if (!token) return undefined;
    return { kind: "name", text: token.text, span: token.span };
  }

  function parseArg(): ArgNode | undefined {
    const token = peek();
    switch (token.kind) {
      case "number":
        next();
        return { kind: "number", value: Number(token.text), span: token.span };
      case "string":
        next();
        return { kind: "string", value: decodeString(token.text), span: token.span };
      case "ident":
        next();
        return { kind: "nameArg", value: token.text, span: token.span };
      default:
        report(token.span, `expected an annotation argument, found ${describeKind(token.kind)}`);
        return undefined;
    }
  }

  function parseArgList(): ArgNode[] {
    const args: ArgNode[] = [];
    if (!check("lparen")) return args;
    next();
    while (!check("rparen") && !atEnd()) {
      const before = index;
      const arg = parseArg();
      if (arg) args.push(arg);
      if (check("comma")) next();
      else if (!check("rparen")) break;
      if (index === before) next();
    }
    expect("rparen", "')' to close the annotation arguments");
    return args;
  }

  function parseAnnotation(): AnnotationNode | undefined {
    const at = next(); // '@'
    const name = parseName("an annotation name after '@'");
    if (!name) return undefined;
    const args = parseArgList();
    const end = args.length > 0 ? peek(-1).span : name.span;
    return { kind: "annotation", name, args, span: between(at.span, end) };
  }

  function parseAnnotations(): AnnotationNode[] {
    const annotations: AnnotationNode[] = [];
    while (check("at")) {
      const before = index;
      const annotation = parseAnnotation();
      if (annotation) annotations.push(annotation);
      if (index === before) next();
    }
    return annotations;
  }

  /** `ref` `(` name `)` */
  function parseRef(): TypeNode | undefined {
    const keyword = next(); // 'ref'
    expect("lparen", "'(' after ref");
    const target = parseName("the name of the referenced collection");
    const close = expect("rparen", "')' to close ref");
    if (!target) return undefined;
    return { kind: "ref", target, span: between(keyword.span, (close ?? target).span) };
  }

  function parseBaseType(): TypeNode | undefined {
    const token = peek();

    if (token.kind === "lbrace") {
      const block = parseBlock();
      return { kind: "embedded", block, span: block.span };
    }

    // `[{ ... }]`: an array written around its element rather than after it.
    if (token.kind === "lbracket") {
      const open = next();
      const element = parseType();
      const close = expect("rbracket", "']' to close the array");
      if (!element) return undefined;
      return { kind: "array", element, span: between(open.span, (close ?? element).span) };
    }

    if (token.kind === "ident") {
      if (token.text === "ref" && peek(1).kind === "lparen") return parseRef();
      const name = next();
      return { kind: "scalar", name: { kind: "name", text: name.text, span: name.span }, span: name.span };
    }

    report(token.span, `expected a type, found ${describeKind(token.kind)}`);
    return undefined;
  }

  /**
   * Postfix modifiers are a loop, not recursion. Each `?` or `[]` wraps what
   * has been built so far, so `string?[]` becomes Array(Optional(string))
   * without needing a grammar rule per combination.
   */
  function parseType(): TypeNode | undefined {
    let type = parseBaseType();
    if (!type) return undefined;

    for (;;) {
      if (check("question")) {
        const mark = next();
        type = { kind: "optional", inner: type, span: between(type.span, mark.span) };
        continue;
      }
      if (check("lbracket") && peek(1).kind === "rbracket") {
        next();
        const close = next();
        type = { kind: "array", element: type, span: between(type.span, close.span) };
        continue;
      }
      return type;
    }
  }

  function parseField(): FieldNode | undefined {
    const name = parseName("a field name");
    if (!name) {
      syncInBlock();
      return undefined;
    }
    if (!expect("colon", `':' after the field name '${name.text}'`)) {
      syncInBlock();
      return undefined;
    }
    const type = parseType();
    if (!type) {
      syncInBlock();
      return undefined;
    }
    const annotations = parseAnnotations();
    const end = annotations.at(-1)?.span ?? type.span;
    return { kind: "field", name, type, annotations, span: between(name.span, end) };
  }

  function parseBlock(): BlockNode {
    const open = expect("lbrace", "'{'") ?? peek();
    const fields: FieldNode[] = [];

    while (!check("rbrace") && !atEnd()) {
      const before = index;

      if (!check("ident")) {
        report(peek().span, `expected a field name, found ${describeKind(peek().kind)}`);
        if (!syncInBlock()) break;
        if (index === before) next();
        continue;
      }

      const field = parseField();
      if (field) {
        fields.push(field);
        if (check("comma")) {
          next();
        } else if (!check("rbrace") && !atEnd()) {
          report(peek().span, `expected ',' or '}' after the field '${field.name.text}'`);
          // A name here means the user just forgot the comma, so the next field
          // is right there and skipping to one would throw it away. Anything
          // else is unrecognizable and worth skipping.
          if (!check("ident")) syncInBlock();
        }
      }

      if (index === before) next();
    }

    const close = expect("rbrace", "'}' to close the block");
    return { kind: "block", fields, span: between(open.span, (close ?? peek(-1)).span) };
  }

  function parseCollection(): CollectionNode {
    const name = parseName("a collection name")!;
    const annotations = parseAnnotations();
    const block = parseBlock();
    return { kind: "collection", name, annotations, block, span: between(name.span, block.span) };
  }

  function parseDirective(): DirectiveNode | undefined {
    const at = next(); // '@'
    const name = parseName("a directive name after '@'");
    if (!name) {
      syncTopLevel();
      return undefined;
    }
    const args: ArgNode[] = [];
    while (!check("lbrace") && !atEnd()) {
      const before = index;
      const arg = parseArg();
      if (!arg) break;
      args.push(arg);
      if (check("comma")) next();
      if (index === before) next();
    }
    const block = parseBlock();
    return { kind: "directive", name, args, block, span: between(at.span, block.span) };
  }

  function parseFile(): FileNode {
    const entries: EntryNode[] = [];
    const start = peek().span;

    while (!atEnd()) {
      const before = index;

      if (check("ident")) {
        entries.push(parseCollection());
      } else if (check("at")) {
        const directive = parseDirective();
        if (directive) entries.push(directive);
      } else {
        report(peek().span, `expected a collection name, found ${describeKind(peek().kind)}`);
        syncTopLevel();
      }

      if (index === before) next();
    }

    return {
      kind: "file",
      entries,
      span: { start: 0, end: source.length, line: start.line, col: 1 },
    };
  }

  return { file: parseFile(), diagnostics };
}

function between(from: Span, to: Span): Span {
  return { start: from.start, end: to.end, line: from.line, col: from.col };
}

function decodeString(text: string): string {
  return text.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

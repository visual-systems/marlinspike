/**
 * Base-lisp: a general-purpose S-expression reader, EDN-inspired.
 *
 * Token types (a subset of Clojure/EDN):
 *   symbol   — bare identifier: A, my-node, spike.topology.pipeline
 *   keyword  — :foo :bar — metadata keys and named parameters
 *   string   — "double-quoted"
 *   number   — 42, 3.14
 *   boolean  — true, false
 *   nil      — nil
 *   list     — (...) — primary structural form
 *   vector   — [...] — ordered collections (schemas, ports, etc.)
 *   map      — {:key val ...} — properties / metadata bags
 *   tagged   — #TagName value — reader extension; used for semantic variants
 *
 * Comments: ; to end of line (stripped by reader).
 * Commas: treated as whitespace (EDN convention).
 */

export type SExp =
  | { type: "symbol"; value: string; meta?: SExp }
  | { type: "keyword"; value: string; meta?: SExp }
  | { type: "string"; value: string; meta?: SExp }
  | { type: "number"; value: number; meta?: SExp }
  | { type: "boolean"; value: boolean; meta?: SExp }
  | { type: "nil"; meta?: SExp }
  | { type: "list"; items: SExp[]; meta?: SExp }
  | { type: "vector"; items: SExp[]; meta?: SExp }
  | { type: "map"; entries: [SExp, SExp][]; meta?: SExp }
  | { type: "tagged"; tag: string; value: SExp; meta?: SExp };

export class ParseError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(`${message} (at position ${pos})`);
    this.name = "ParseError";
  }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

class Reader {
  private pos = 0;

  constructor(private readonly input: string) {}

  readAll(): SExp[] {
    const results: SExp[] = [];
    this.skipGarbage();
    while (this.pos < this.input.length) {
      results.push(this.readOne());
      this.skipGarbage();
    }
    return results;
  }

  private readOne(): SExp {
    this.skipGarbage();
    if (this.pos >= this.input.length) {
      throw new ParseError("Unexpected end of input", this.pos);
    }
    const ch = this.input[this.pos];
    if (ch === "(") return this.readList();
    if (ch === "[") return this.readVector();
    if (ch === "{") return this.readMap();
    if (ch === '"') return this.readString();
    if (ch === ":") return this.readKeyword();
    if (ch === "#") return this.readTagged();
    if (ch === "^" && this.peekIsMetaMap()) return this.readReaderMeta();
    return this.readAtom();
  }

  /**
   * Does `^` at the current position introduce reader metadata (`^{...}`)?
   *
   * We only treat `^` as a reader-metadata macro when the very next
   * non-whitespace form is a map literal. This keeps `^Type` in param
   * positions (e.g. `^float x`) reading as a symbol prefix, preserving
   * spike-clojure's existing port-type-hint handling.
   *
   * Full Clojure `^` semantics (keyword/symbol/string meta) are future work —
   * tracked in the plan's "reference semantics" open question.
   */
  private peekIsMetaMap(): boolean {
    let peek = this.pos + 1; // past '^'
    while (peek < this.input.length) {
      const c = this.input[peek];
      if (c === ";") {
        while (peek < this.input.length && this.input[peek] !== "\n") peek++;
      } else if (c === "," || /\s/.test(c)) {
        peek++;
      } else {
        break;
      }
    }
    return peek < this.input.length && this.input[peek] === "{";
  }

  private readReaderMeta(): SExp {
    const start = this.pos;
    this.pos++; // consume '^'
    this.skipGarbage();
    if (this.pos >= this.input.length || this.input[this.pos] !== "{") {
      throw new ParseError("Expected `{` after `^` for reader metadata", start);
    }
    const meta = this.readMap();
    this.skipGarbage();
    if (this.pos >= this.input.length) {
      throw new ParseError("Expected form after `^{...}` metadata", start);
    }
    const value = this.readOne();
    // Merge: later metadata maps take precedence over earlier ones (Clojure convention).
    const combined: SExp = value.meta && value.meta.type === "map" && meta.type === "map"
      ? { ...value, meta: mergeMetaMaps(value.meta, meta) }
      : { ...value, meta };
    return combined;
  }

  private readList(): SExp {
    return this.readDelimited("(", ")", "list", (items) => ({
      type: "list",
      items,
    }));
  }

  private readVector(): SExp {
    return this.readDelimited("[", "]", "vector", (items) => ({
      type: "vector",
      items,
    }));
  }

  private readDelimited<T extends SExp>(
    _open: string,
    close: string,
    name: string,
    build: (items: SExp[]) => T,
  ): T {
    const start = this.pos;
    this.pos++; // consume open delimiter
    const items: SExp[] = [];
    this.skipGarbage();
    while (this.pos < this.input.length && this.input[this.pos] !== close) {
      items.push(this.readOne());
      this.skipGarbage();
    }
    if (this.pos >= this.input.length) {
      throw new ParseError(`Unclosed ${name}`, start);
    }
    this.pos++; // consume close delimiter
    return build(items);
  }

  private readMap(): SExp {
    const start = this.pos;
    this.pos++; // consume '{'
    const entries: [SExp, SExp][] = [];
    this.skipGarbage();
    while (this.pos < this.input.length && this.input[this.pos] !== "}") {
      const key = this.readOne();
      this.skipGarbage();
      if (this.pos >= this.input.length || this.input[this.pos] === "}") {
        throw new ParseError("Map has odd number of forms", this.pos);
      }
      const val = this.readOne();
      entries.push([key, val]);
      this.skipGarbage();
    }
    if (this.pos >= this.input.length) {
      throw new ParseError("Unclosed map", start);
    }
    this.pos++; // consume '}'
    return { type: "map", entries };
  }

  private readString(): SExp {
    const start = this.pos;
    this.pos++; // consume opening '"'
    let value = "";
    while (this.pos < this.input.length && this.input[this.pos] !== '"') {
      if (this.input[this.pos] === "\\") {
        this.pos++;
        if (this.pos >= this.input.length) break;
        const esc = this.input[this.pos];
        switch (esc) {
          case '"':
            value += '"';
            break;
          case "\\":
            value += "\\";
            break;
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case "r":
            value += "\r";
            break;
          default:
            value += "\\" + esc;
        }
      } else {
        value += this.input[this.pos];
      }
      this.pos++;
    }
    if (this.pos >= this.input.length) {
      throw new ParseError("Unclosed string", start);
    }
    this.pos++; // consume closing '"'
    return { type: "string", value };
  }

  private readKeyword(): SExp {
    const start = this.pos;
    this.pos++; // consume ':'
    const value = this.readSymbolChars();
    if (!value) {
      throw new ParseError("Empty keyword", start);
    }
    return { type: "keyword", value };
  }

  private readTagged(): SExp {
    const start = this.pos;
    this.pos++; // consume '#'
    const tag = this.readSymbolChars();
    if (!tag) {
      throw new ParseError("Empty tag name", start);
    }
    this.skipGarbage();
    if (this.pos >= this.input.length) {
      throw new ParseError(`Missing value for tag #${tag}`, start);
    }
    const value = this.readOne();
    return { type: "tagged", tag, value };
  }

  private readAtom(): SExp {
    const start = this.pos;
    const raw = this.readSymbolChars();
    if (!raw) {
      throw new ParseError(
        `Unexpected character: '${this.input[this.pos]}'`,
        this.pos,
      );
    }
    if (raw === "true") return { type: "boolean", value: true };
    if (raw === "false") return { type: "boolean", value: false };
    if (raw === "nil") return { type: "nil" };
    // Number: try parsing; require it to look numeric (avoid "1abc" → NaN quietly)
    if (/^-?\d/.test(raw)) {
      const num = Number(raw);
      if (!isNaN(num)) return { type: "number", value: num };
      throw new ParseError(`Invalid number: '${raw}'`, start);
    }
    return { type: "symbol", value: raw };
  }

  private readSymbolChars(): string {
    const start = this.pos;
    while (this.pos < this.input.length && !isDelimiter(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  /** Skip whitespace, commas (EDN: commas are whitespace), and ; line comments. */
  private skipGarbage(): void {
    while (this.pos < this.input.length) {
      const ch = this.input[this.pos];
      if (ch === ";") {
        while (this.pos < this.input.length && this.input[this.pos] !== "\n") {
          this.pos++;
        }
      } else if (ch === "," || /\s/.test(ch)) {
        this.pos++;
      } else {
        break;
      }
    }
  }
}

function isDelimiter(ch: string): boolean {
  return /[\s,()[\]{}"`;]/.test(ch);
}

/**
 * Merge two metadata map SExps. Later (outer) entries win for the same key,
 * matching Clojure's right-to-left stacking of `^{...}` readers.
 */
function mergeMetaMaps(
  earlier: SExp & { type: "map" },
  later: SExp & { type: "map" },
): SExp {
  const result: [SExp, SExp][] = [...earlier.entries];
  for (const [k, v] of later.entries) {
    const idx = result.findIndex(([ek]) => sameKey(ek, k));
    if (idx >= 0) result[idx] = [k, v];
    else result.push([k, v]);
  }
  return { type: "map", entries: result };
}

function sameKey(a: SExp, b: SExp): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "keyword" && b.type === "keyword") return a.value === b.value;
  if (a.type === "symbol" && b.type === "symbol") return a.value === b.value;
  if (a.type === "string" && b.type === "string") return a.value === b.value;
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Parse a base-lisp string into a sequence of top-level SExp values. */
export function parse(input: string): SExp[] {
  return new Reader(input).readAll();
}

/** Parse a base-lisp string expected to contain exactly one top-level form. */
export function parseOne(input: string): SExp {
  const results = parse(input);
  if (results.length === 0) throw new ParseError("Empty input", 0);
  if (results.length > 1) {
    throw new ParseError(
      `Expected one form, got ${results.length}`,
      0,
    );
  }
  return results[0];
}

// ---------------------------------------------------------------------------
// Printer
// ---------------------------------------------------------------------------

/** Render an SExp back to a base-lisp string. */
export function print(sexp: SExp): string {
  const prefix = sexp.meta ? `^${print({ ...sexp.meta, meta: undefined })} ` : "";
  return prefix + printBody(sexp);
}

function printBody(sexp: SExp): string {
  switch (sexp.type) {
    case "symbol":
      return sexp.value;
    case "keyword":
      return `:${sexp.value}`;
    case "string":
      return `"${escapeString(sexp.value)}"`;
    case "number":
      return String(sexp.value);
    case "boolean":
      return String(sexp.value);
    case "nil":
      return "nil";
    case "list":
      return `(${sexp.items.map(print).join(" ")})`;
    case "vector":
      return `[${sexp.items.map(print).join(" ")}]`;
    case "map": {
      const pairs = sexp.entries
        .map(([k, v]) => `${print(k)} ${print(v)}`)
        .join(" ");
      return `{${pairs}}`;
    }
    case "tagged":
      return `#${sexp.tag} ${print(sexp.value)}`;
  }
}

function escapeString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

// ---------------------------------------------------------------------------
// Helpers for working with SExp values
// ---------------------------------------------------------------------------

/** Assert an SExp is a symbol and return its value. */
export function asSymbol(sexp: SExp, context?: string): string {
  if (sexp.type !== "symbol") {
    throw new ParseError(
      `Expected symbol${context ? ` (${context})` : ""}, got ${sexp.type}`,
      0,
    );
  }
  return sexp.value;
}

/** Assert an SExp is a keyword and return its value (without the colon). */
export function asKeyword(sexp: SExp, context?: string): string {
  if (sexp.type !== "keyword") {
    throw new ParseError(
      `Expected keyword${context ? ` (${context})` : ""}, got ${sexp.type}`,
      0,
    );
  }
  return sexp.value;
}

/** Assert an SExp is a string and return its value. */
export function asString(sexp: SExp, context?: string): string {
  if (sexp.type !== "string") {
    throw new ParseError(
      `Expected string${context ? ` (${context})` : ""}, got ${sexp.type}`,
      0,
    );
  }
  return sexp.value;
}

/** Assert an SExp is a list and return its items. */
export function asList(sexp: SExp, context?: string): SExp[] {
  if (sexp.type !== "list") {
    throw new ParseError(
      `Expected list${context ? ` (${context})` : ""}, got ${sexp.type}`,
      0,
    );
  }
  return sexp.items;
}

/**
 * Extract keyword arguments from a list tail.
 * Given items like [:label "Foo" :id "bar" child1 child2],
 * returns { kwargs: { label: SExp, id: SExp }, rest: [child1, child2] }.
 */
export function extractKwargs(
  items: SExp[],
): { kwargs: Record<string, SExp>; rest: SExp[] } {
  const kwargs: Record<string, SExp> = {};
  const rest: SExp[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.type === "keyword" && i + 1 < items.length) {
      kwargs[item.value] = items[i + 1];
      i += 2;
    } else {
      rest.push(...items.slice(i));
      break;
    }
  }
  return { kwargs, rest };
}

/**
 * Spike-Clojure evaluator.
 *
 * Evaluates `defn` forms in Spike-Clojure source text against concrete input
 * values, using a caller-supplied function environment.  Designed to verify
 * semantic equivalence between the original and round-tripped programs.
 *
 * The evaluator is deliberately narrow — it only handles the subset that
 * Spike-Clojure uses:
 *   - `defn` with an optional `{:ports …}` attr-map and `^Type` hints (skipped)
 *   - `(let [bindings…] body)` bodies
 *   - Direct call or map bodies without a let block
 *   - Numeric, string, boolean, nil literals
 *   - Symbol lookup in the local environment
 *   - Nested calls as arguments
 *   - Map returns `{:key expr …}` → `Record<string, EvalValue>`
 *
 * Functions are supplied externally; there is no built-in function library.
 */

import type { SExp } from "../graph/base_lisp.ts";
import { parse } from "../graph/base_lisp.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvalValue =
  | number
  | string
  | boolean
  | null
  | EvalValue[]
  | { [key: string]: EvalValue };

/** General function environment: maps names to implementations. */
export type FnEnv = Record<string, (...args: EvalValue[]) => EvalValue>;

/**
 * Convenience type for purely-numeric function environments — lets callers
 * write clean `(x, y) => x + y` signatures without EvalValue casts.
 */
export type NumericFnEnv = Record<string, (...args: number[]) => number>;

/**
 * Wrap a purely-numeric function map into a general `FnEnv` for use with
 * `evaluateSpike`.
 */
export function numericEnv(env: NumericFnEnv): FnEnv {
  const result: FnEnv = {};
  for (const [name, fn] of Object.entries(env)) {
    result[name] = (...args: EvalValue[]) => fn(...(args as number[]));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the named `defn` in `src` with the given inputs and functions.
 *
 * @param src      - Spike-Clojure source text (may contain multiple forms).
 * @param inputs   - Input values keyed by parameter name.
 * @param fns      - Function implementations, keyed by function name.
 * @param defnName - Which defn to evaluate; defaults to the first one found.
 */
export function evaluateSpike(
  src: string,
  inputs: Record<string, EvalValue>,
  fns: FnEnv,
  defnName?: string,
): EvalValue {
  const forms = parse(src);
  for (const form of forms) {
    if (form.type !== "list" || form.items.length < 3) continue;
    const [head, nameForm] = form.items;
    if (head.type !== "symbol" || head.value !== "defn") continue;
    if (nameForm.type !== "symbol") continue;
    if (defnName && nameForm.value !== defnName) continue;
    return evalDefn(form.items, inputs, fns);
  }
  throw new Error(
    `No ${defnName ? `defn '${defnName}'` : "defn"} found in source`,
  );
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

type Env = Record<string, EvalValue>;

function evalDefn(
  formItems: SExp[], // full list: [defn, name, ...rest]
  inputs: Record<string, EvalValue>,
  fns: FnEnv,
): EvalValue {
  const rest = formItems.slice(2); // skip `defn` and name

  // Extract param names from the param vector (skip `^Type` hints)
  const paramVec = rest.find((f) => f.type === "vector");
  const params: string[] = [];
  if (paramVec?.type === "vector") {
    for (const item of paramVec.items) {
      if (item.type === "symbol" && !item.value.startsWith("^")) {
        params.push(item.value);
      }
    }
  }

  // Build environment from provided inputs
  const env: Env = {};
  for (const p of params) {
    if (Object.prototype.hasOwnProperty.call(inputs, p)) {
      env[p] = inputs[p];
    }
  }

  // Everything after the param vector is the body region.
  // This naturally skips any {:ports …} attr-map that precedes the params.
  const paramVecIdx = rest.findIndex((f) => f.type === "vector");
  const bodyRegion = paramVecIdx >= 0 ? rest.slice(paramVecIdx + 1) : rest;

  // Find `(let [bindings…] body)`
  const letForm = bodyRegion.find(
    (f) =>
      f.type === "list" &&
      f.items[0]?.type === "symbol" &&
      f.items[0].value === "let",
  );

  if (letForm?.type === "list") {
    const bindingVec = letForm.items[1];
    const body = letForm.items[2];
    if (bindingVec?.type === "vector") {
      for (let i = 0; i + 1 < bindingVec.items.length; i += 2) {
        const bname = bindingVec.items[i];
        const expr = bindingVec.items[i + 1];
        if (bname.type === "symbol") {
          env[bname.value] = evalExpr(expr, env, fns);
        }
      }
    }
    return evalExpr(body, env, fns);
  }

  // No let: the body is the first list or map in the body region
  const body = bodyRegion.find((f) => f.type === "list" || f.type === "map");
  return body ? evalExpr(body, env, fns) : null;
}

function evalExpr(expr: SExp, env: Env, fns: FnEnv): EvalValue {
  switch (expr.type) {
    case "number":
      return expr.value;
    case "string":
      return expr.value;
    case "boolean":
      return expr.value;
    case "nil":
      return null;

    case "keyword":
      // Keywords in expression position (rare in Spike-Clojure) become strings
      return `:${expr.value}`;

    case "symbol": {
      if (Object.prototype.hasOwnProperty.call(env, expr.value)) {
        return env[expr.value];
      }
      throw new Error(`Unbound symbol: '${expr.value}'`);
    }

    case "list": {
      if (expr.items.length === 0) return null;
      const head = expr.items[0];
      if (head.type !== "symbol") {
        throw new Error(`Function position must be a symbol, got ${head.type}`);
      }
      const fnName = head.value;
      const args = expr.items.slice(1).map((a) => evalExpr(a, env, fns));
      if (Object.prototype.hasOwnProperty.call(fns, fnName)) {
        return fns[fnName](...args);
      }
      throw new Error(`Unknown function: '${fnName}'`);
    }

    case "map": {
      const result: Record<string, EvalValue> = {};
      for (const [k, v] of expr.entries) {
        const key = k.type === "keyword" || k.type === "symbol"
          ? k.value
          : String(evalExpr(k, env, fns));
        result[key] = evalExpr(v, env, fns);
      }
      return result;
    }

    case "vector":
      return expr.items.map((item) => evalExpr(item, env, fns));

    case "tagged":
      // Tagged literals — evaluate the inner value, ignore the tag
      return evalExpr(expr.value, env, fns);
  }
}

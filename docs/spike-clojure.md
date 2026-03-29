# Spike-Clojure

Spike-Clojure is the Clojure variant of the Spike graph notation — a round-trippable text representation of a graph that is simultaneously valid, idiomatic Clojure. A reader who ignores graph semantics sees ordinary typed functions; a reader who cares sees the graph structure layered on top. The two readings coexist without conflict.

It is the first language variant of the Spike notation. Future variants (TypeScript, Scheme, etc.) will follow the same isomorphism principle in their respective host languages.

See `src/ui/stories/candidate-spike-lisp-syntaxes.stories.tsx` for interactive examples of all the syntax patterns described here.

---

## Two-layer architecture

Spike-Clojure is built on two layers:

1. **Base-lisp** — a general-purpose EDN-inspired S-expression reader (`src/graph/base_lisp.ts`). Produces a typed `SExp` AST with no graph semantics. Language-agnostic; shared across all future variants.

2. **Spike-Clojure semantic layer** — maps Clojure forms (`def`, `defn`, `fn`, `let`) to graph concepts. No new syntax is introduced; graph semantics are read out of ordinary Clojure structure.

---

## Base reader token types

| Type | Syntax | Example |
|---|---|---|
| `symbol` | bare identifier | `A`, `my-node`, `spike.topology.pipeline` |
| `keyword` | `:foo` | `:ports`, `:subgraph` |
| `string` | `"..."` | `"spike://acme/backend"` |
| `number` | integer or float | `42`, `3.14` |
| `boolean` | `true` / `false` | `true` |
| `nil` | `nil` | `nil` |
| `list` | `(...)` | `(A B C)` |
| `vector` | `[...]` | `[^float a ^float b]` |
| `map` | `{:k v ...}` | `{:ports {:x1 float :x2 float}}` |
| `tagged` | `#Tag value` | `#Subgraph (...)`, `#Call (A B)` |

Comments: `;` to end of line. Commas: treated as whitespace (EDN convention).

---

## Core forms

Three Clojure definition forms carry the graph semantics:

| Form | Clojure meaning | Spike-Clojure meaning |
|---|---|---|
| `def` | named value | structural container — nodes present, no implied call order |
| `defn` | named function | callable node — has input/output ports, can be invoked |
| `fn` | anonymous function | anonymous sub-subgraph |

---

## Structural containers — `def`

`def` declares a named collection of nodes without implying call order. The body is a vector of node references. It is not callable.

```clojure
(def oidc-provider
  [parse-auth-request
   validate-client
   authenticate-user
   issue-auth-code
   exchange-code
   build-response])
```

**Nested containers** can be defined separately (cleaner when shared or reused) or inline as shorthand:

```clojure
; Separate — C is a top-level definition, can be referenced elsewhere
(def C [D])
(def A [B C])

; Inline — shorthand for the above; (def C [D]) defines and names C in one form
(def A [B (def C [D])])
```

Both forms produce the same graph.

---

## Callable nodes — `defn`

`defn` declares a callable node with named input ports (function arguments) and output ports.

**Single output** — `^Type` hint before the name (standard Clojure type hint):

```clojure
(defn ^float discriminant [^float a ^float b ^float c] ...)
(defn ^string transform [^bytes input] ...)
```

**Multiple outputs** — `{:ports {:name Type ...}}` in the attr-map position (valid Clojure, same position used for `:deprecated`, `:arglists`, etc.):

```clojure
(defn real-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  ...)
```

**Abstract interface** — no body; just the signature:

```clojure
(defn ^float discriminant [^float a ^float b ^float c])
```

**URI-referenced implementation** — body replaced by `:subgraph` in the attr-map:

```clojure
(defn processor {:subgraph "spike://acme/backend/processor"} [input] ...)
```

**Node properties** — additional keys in the attr-map:

```clojure
(defn worker
  {:retry-limit 3 :timeout-ms 5000 :tags ["critical" "async"]}
  [input]
  ...)
```

---

## Inline subgraph — `defn` with body

When a `defn` has a `let` body, the `let` structure becomes the subgraph topology. Each binding is a call site; the return value is the output. The body is plain Clojure — no graph-specific syntax inside it:

```clojure
(defn quadratic-roots
  {:ports {:x1 float :x2 float}}
  [^float a ^float b ^float c]
  (let [neg-b  (negate b)
        disc   (subtract (square b) (multiply 4.0 (multiply a c)))
        sqrt-d (sqrt disc)
        two-a  (multiply 2.0 a)]
    {:x1 (divide (add      neg-b sqrt-d) two-a)
     :x2 (divide (subtract neg-b sqrt-d) two-a)}))
```

This is valid Clojure top to bottom. The graph semantics (nodes, edges, output ports) emerge from the `let` structure without any annotation.

---

## Call topology patterns

### Chain (A → B → C)

```clojure
(defn pipeline [input]
  (let [a (A input)
        b (B a)]
    (C b)))
```

### Fan-out (A → B, A → C)

```clojure
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)]
    {:b b :c c}))
```

### Fan-in (A → C, B → C)

```clojure
(defn pipeline [x y]
  (let [a (A x)
        b (B y)
        c (C a b)]
    c))
```

### Diamond (A → B → D, A → C → D)

```clojure
(defn pipeline [input]
  (let [a (A input)
        b (B a)
        c (C a)
        d (D b c)]
    d))
```

The diamond emerges naturally from `let`: `a` is bound once and reused in both `b` and `c`; both flow into `d`.

---

## Port selection — Clojure destructuring

When a node has multiple named output ports, select a specific port using standard Clojure map destructuring:

```clojure
(defn oidc-flow [^http.Request http-request]
  (let [parsed            (parse-auth-request http-request)
        {:keys [client]}  (validate-client parsed)   ; select :client port
        {:keys [session]} (authenticate-user parsed)  ; select :session port
        code              (issue-auth-code session client)
        {:keys [tokens]}  (exchange-code code)]
    (build-response tokens)))
```

No graph-specific `:from` keyword — standard Clojure destructuring.

---

## Port syntax summary

| Case | Syntax |
|---|---|
| Single output, typed | `(defn ^float foo [^float x] ...)` |
| Single output, untyped | `(defn foo [x] ...)` |
| Multiple outputs | `(defn foo {:ports {:x1 float :x2 float}} [^float a] ...)` |
| Abstract (no impl) | `(defn ^float foo [^float x])` |
| URI-referenced impl | `(defn foo {:subgraph "spike://..."} [args] ...)` |
| Select named port | `(let [{:keys [port-name]} (node args)] ...)` |
| Structural container | `(def name [node1 node2 ...])` |
| Inline named sub-container | `(def outer [A (def inner [B C])])` |

---

## Optional explicit annotations — `#Subgraph` and `#Call`

`#Subgraph` and `#Call` are EDN reader tags retained as optional explicit semantic annotations. They are not required — `def`/`defn`/`fn` carry the same semantics without them. They serve as the extensibility hook for user-defined semantic variants.

```clojure
; Optional — tags make the intended semantic explicit
#Subgraph [ingress processor egress]
#Call (validate (enrich respond))
```

---

## Explicit edge declaration

For attaching properties to edges (which have no slot in the `let` structure), edges can be declared explicitly within a `def` container:

```clojure
(def auth-service
  {:schemas [spike.topology.pipeline io.http]
   :nodes   [ingress validator]
   :edges   [(edge :from [ingress p-out] :to [validator p-in])
             (edge :from [validator p-err] :to [ingress p-in]
                   :props {:label "retry"})]})
```

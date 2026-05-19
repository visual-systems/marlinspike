# @marlinspike/theme

Generic theme infrastructure — role-based style resolution with structural typing.

## What it does

This package provides the machinery for defining and resolving visual themes without knowing what
roles exist. It answers one question: given a role name and optional per-element overrides, what are
the resolved style properties?

The package is intentionally small. It defines the `ThemeDefinition` interface (what a theme
_does_), provides `resolveProps` for sparse merge of overrides over role defaults, and maps geometry
string identifiers to opaque `NodeGeometry` singletons from `@marlinspike/canvas`.

## Relationship to Marlinspike

In the Marlinspike IDE, nodes have **visual roles** (`"leaf"`, `"container"`, `"ref"`, etc.) that
determine their default appearance. The CLASSIC theme maps these roles to colors, stroke widths, and
geometry. Constraints can override individual style properties per-node (e.g. making workspace nodes
rectangular).

This package provides the generic machinery. The application defines which roles must exist via a
**semantic identifiers** interface. A valid marlinspike theme satisfies both:

```
ThemeDefinition & MarlinSemanticIdentifiers
```

This separation means the theme package has no knowledge of marlinspike's domain — it could be used
by any application that wants role-based theming with sparse overrides.

## Quick start

```typescript
import type { ThemeDefinition } from "@marlinspike/theme";
import { resolveGeometryFromProps, resolveProps } from "@marlinspike/theme";

// 1. Define a theme — pure data: role→style mappings + constants
const myTheme: ThemeDefinition = {
  roles: {
    primary: {
      geometry: "circle",
      fill: "#111125",
      stroke: "#252545",
      strokeWidth: 1,
      labelFill: "#777799",
    },
    secondary: {
      geometry: "rect",
      fill: "#0f0f28",
      stroke: "#1e1e44",
      strokeWidth: 1,
      labelFill: "#888888",
    },
  },
  constants: {
    groupPadding: 32,
    labelH: 22,
    leafRadius: 26,
  },
};

// 2. Resolve style for a role (returns the role's base NodeStyleProps)
const style = resolveProps(myTheme.roles, "primary");
// → { geometry: "circle", fill: "#111125", stroke: "#252545", ... }

// 3. Merge per-element overrides (sparse — only overridden fields change)
const overridden = resolveProps(myTheme.roles, "primary", { fill: "#ff0000", strokeWidth: 3 });
// → { geometry: "circle", fill: "#ff0000", stroke: "#252545", strokeWidth: 3, ... }

// 4. Resolve geometry string to NodeGeometry singleton
const geometry = resolveGeometryFromProps(style.geometry);
// → CIRCLE_GEOMETRY (opaque NodeGeometry object with SDF, rendering, clipping methods)
```

## Structural intersection pattern

The key architectural idea: **separate mechanism from domain contract**.

`ThemeDefinition` is the mechanism — it says "a theme has roles (string→props) and constants". It
doesn't care _which_ roles exist. The application defines the domain contract:

```typescript
// Application code (not in this package)
interface MarlinSemanticIdentifiers {
  readonly roles: Record<
    "leaf" | "container" | "collapsed-subgraph" | "ref" | "leaf-rect",
    NodeStyleProps
  >;
}

// A valid theme satisfies both
const classicTheme: ThemeDefinition & MarlinSemanticIdentifiers = {
  roles: {
    leaf: {/* ... */},
    container: {/* ... */},
    "collapsed-subgraph": {/* ... */},
    ref: {/* ... */},
    "leaf-rect": {/* ... */},
  },
  constants: { groupPadding: 32, labelH: 22, leafRadius: 26 },
};
```

Why intersection over generics (`ThemeDefinition<Roles>`)? Because:

- **Open extension** — plugins add `& ExtensionRoles` without modifying ThemeDefinition
- **Multi-app composition** — `ThemeDefinition & AppA & AppB` composes additively
- **TS idiom** — generics suit containers (`Array<T>`); intersections suit "satisfies multiple
  contracts"

## API

### Types

| Type              | Description                                                   |
| ----------------- | ------------------------------------------------------------- |
| `ThemeDefinition` | Generic theme machinery: `roles` (string→props) + `constants` |
| `RoleDefs`        | Alias for `Record<string, NodeStyleProps>`                    |

### Functions

| Function                        | Description                                                |
| ------------------------------- | ---------------------------------------------------------- |
| `resolveProps(defs, role, ov?)` | Merge role defaults with optional sparse overrides         |
| `resolveGeometryFromProps(geo)` | Map `"circle"` / `"rect"` string to NodeGeometry singleton |

### Re-exported from `@marlinspike/canvas`

`NodeStyleProps`, `ThemeConstants` — the shared vocabulary types used by both this package and the
canvas rendering pipeline.

## Design rationale

**Why a separate package?** The canvas package provides `CanvasTheme<S>` — the full rendering
interface with style resolvers, decorations, and interaction-dependent logic. The theme package
provides _just_ the resolution machinery: role→props lookup and sparse merge. This is the part
that's reusable across different rendering contexts and app-specific theme types.

**Style representation (native TS, not JSON).** Themes are TypeScript objects, not serialized JSON.
Interaction-dependent styles (hover glow, selection highlight, error tint) are _computed functions_,
not declarative data — they depend on transient state that doesn't belong in a static definition.
Base role definitions are pure data; the surrounding logic is TS.

**Deferred: JSON serialization.** A `fromJSON()` helper could validate and hydrate JSON into the
native interface, enabling documentation, authorship metadata, and meta-style capabilities (styles
stored _in_ the graph). Deferred until those use cases become concrete.

**Deferred: bidirectional codec.** A single definition yielding parser + serializer + schema + types
(like Haskell's [autodocodec](https://hackage.haskell.org/package/autodocodec)) would eliminate
redundant schema/parser definitions. The recursive possibility — a codec defined as a marlinspike
graph that validates other graphs — connects to the broader "domain app" vision.

## Live demos

- [Theme stories](https://marlinspike.sordina.deno.net/stories) — theme resolution, custom themes,
  style override merging

## Dependencies

- `@marlinspike/canvas` — for `NodeStyleProps`, `ThemeConstants`, `NodeGeometry`, and geometry
  singletons

## License

Part of the [Marlinspike](https://github.com/visual-systems/marlinspike) project.

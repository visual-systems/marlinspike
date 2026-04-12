/// <reference lib="dom" />
/**
 * SurrealDB connection manager.
 *
 * At runtime in the browser the SDK is loaded dynamically from esm.sh
 * because @deno/emit cannot bundle npm packages. Type-only imports from
 * the npm specifiers are used for compile-time checking and are erased
 * before they reach the bundler.
 */

import type { Surreal, SurrealSession } from "surrealdb";
import type { Engines } from "surrealdb";

// ---------------------------------------------------------------------------
// Dynamic loader — fetches SurrealDB from esm.sh at runtime
// ---------------------------------------------------------------------------

interface SurrealModule {
  Surreal: typeof Surreal;
}

interface WasmModule {
  createWasmEngines: () => Engines;
}

let surrealMod: SurrealModule | null = null;
let wasmMod: WasmModule | null = null;

async function loadModules(): Promise<{ surreal: SurrealModule; wasm: WasmModule }> {
  if (surrealMod && wasmMod) return { surreal: surrealMod, wasm: wasmMod };

  // Pin the surrealdb version used by @surrealdb/wasm via esm.sh's
  // ?deps parameter so both packages share a single module instance.
  // Without this, esm.sh loads separate copies causing class mismatches.
  const surrealUrl = "https://esm.sh/surrealdb@2.0.3";
  const wasmUrl = "https://esm.sh/@surrealdb/wasm@3.0.3?deps=surrealdb@2.0.3";

  const [s, w] = await Promise.all([
    import(/* @vite-ignore */ surrealUrl) as Promise<SurrealModule>,
    import(/* @vite-ignore */ wasmUrl) as Promise<WasmModule>,
  ]);

  surrealMod = s;
  wasmMod = w;
  return { surreal: s, wasm: w };
}

// ---------------------------------------------------------------------------
// Connection singleton
// ---------------------------------------------------------------------------

const NS = "marlinspike";
const UI_DB = "_ui";
const DEFAULT_DB = "default";

let db: Surreal | null = null;

/** Initialise the SurrealDB embedded connection (in-memory). */
export async function initSurreal(): Promise<Surreal> {
  if (db) return db;

  const { surreal, wasm } = await loadModules();
  console.log("[surreal] modules loaded");

  // indxdb:// (IndexedDB persistence) has a known WASM↔JS async barrier bug
  // that causes IndexedDB transactions to expire. Using mem:// until we add
  // a remote SurrealDB backend for proper persistence.
  // See: https://github.com/surrealdb/surrealdb/issues/5712
  db = new surreal.Surreal({ engines: wasm.createWasmEngines() });
  await db.connect("mem://");
  console.log("[surreal] connected to mem://");
  await db.use({ namespace: NS, database: DEFAULT_DB });
  console.log("[surreal] using", NS, DEFAULT_DB);

  return db;
}

/** Returns the initialised Surreal instance. Throws if not yet initialised. */
export function getDb(): Surreal {
  if (!db) throw new Error("SurrealDB not initialised — call initSurreal() first");
  return db;
}

// ---------------------------------------------------------------------------
// Session helpers — each database gets its own session
// ---------------------------------------------------------------------------

/**
 * Create (or reuse) a session scoped to a specific database within the
 * marlinspike namespace.  The returned session can be used for all
 * CRUD operations against that database.
 */
export async function useDatabase(database: string): Promise<void> {
  const conn = getDb();
  await conn.use({ namespace: NS, database });
}

/** Switch to the shared UI-state database. */
export async function useUiDb(): Promise<void> {
  await useDatabase(UI_DB);
}

/** Switch to the default graph database. */
export async function useDefaultDb(): Promise<void> {
  await useDatabase(DEFAULT_DB);
}

export { DEFAULT_DB, NS, UI_DB };
export type { Surreal, SurrealSession };

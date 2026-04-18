/// <reference lib="dom" />
/**
 * SurrealDB connection manager.
 *
 * Manages a local embedded (WASM/mem://) connection and an open set of remote
 * connections. All database acquisition goes through `getDb(connectionId?)`:
 *   - No argument → local embedded instance
 *   - With connection id → remote instance from the pool
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
// Connection config
// ---------------------------------------------------------------------------

export interface ConnectionConfig {
  url: string;
  namespace?: string;
  database?: string;
  username?: string;
  password?: string;
}

// ---------------------------------------------------------------------------
// Local embedded connection
// ---------------------------------------------------------------------------

const NS = "marlinspike";
const UI_DB = "_ui";

let localDb: Surreal | null = null;

/** Initialise the SurrealDB embedded connection (in-memory). */
export async function initSurreal(): Promise<Surreal> {
  if (localDb) return localDb;

  const { surreal, wasm } = await loadModules();
  console.log("[surreal] modules loaded");

  // indxdb:// (IndexedDB persistence) has a known WASM↔JS async barrier bug
  // that causes IndexedDB transactions to expire. Using mem:// until we add
  // a remote SurrealDB backend for proper persistence.
  // See: https://github.com/surrealdb/surrealdb/issues/5712
  localDb = new surreal.Surreal({ engines: wasm.createWasmEngines() });
  await localDb.connect("mem://");
  console.log("[surreal] connected to mem://");
  await localDb.use({ namespace: NS, database: UI_DB });
  console.log("[surreal] using", NS, UI_DB);

  return localDb;
}

// ---------------------------------------------------------------------------
// Remote connections pool
// ---------------------------------------------------------------------------

const remoteConnections = new Map<string, Surreal>();

/**
 * Establish a remote SurrealDB connection and add it to the pool.
 * If a connection with this id already exists, it is disconnected first.
 */
export async function connectRemote(id: string, config: ConnectionConfig): Promise<Surreal> {
  // Tear down existing connection with this id, if any
  if (remoteConnections.has(id)) {
    disconnectRemote(id);
  }

  const { surreal } = await loadModules();
  const conn = new surreal.Surreal();
  await conn.connect(config.url);
  console.log(`[surreal] remote ${id}: connected to ${config.url}`);

  if (config.username && config.password) {
    await conn.signin(
      {
        username: config.username,
        password: config.password,
      } as Parameters<typeof conn.signin>[0],
    );
    console.log(`[surreal] remote ${id}: signed in as ${config.username}`);
  }

  if (config.namespace || config.database) {
    await conn.use({
      namespace: config.namespace,
      database: config.database,
    });
    console.log(
      `[surreal] remote ${id}: using ${config.namespace ?? "-"}/${config.database ?? "-"}`,
    );
  }

  remoteConnections.set(id, conn);
  return conn;
}

/** Disconnect and remove a remote connection from the pool. No-op if not found. */
export function disconnectRemote(id: string): void {
  const conn = remoteConnections.get(id);
  if (!conn) return;
  try {
    conn.close();
  } catch {
    // Best-effort cleanup
  }
  remoteConnections.delete(id);
  console.log(`[surreal] remote ${id}: disconnected`);
}

/** Returns the ids of all active remote connections. */
export function remoteConnectionIds(): string[] {
  return [...remoteConnections.keys()];
}

// ---------------------------------------------------------------------------
// Unified acquisition
// ---------------------------------------------------------------------------

/**
 * Returns a Surreal instance. No argument returns the local embedded instance;
 * with a connection id, returns the corresponding remote instance from the pool.
 */
export function getDb(connectionId?: string): Surreal {
  if (!connectionId) {
    if (!localDb) throw new Error("SurrealDB not initialised — call initSurreal() first");
    return localDb;
  }
  const remote = remoteConnections.get(connectionId);
  if (!remote) throw new Error(`No remote connection: ${connectionId}`);
  return remote;
}

// ---------------------------------------------------------------------------
// Session helpers — target the local instance
// ---------------------------------------------------------------------------

/**
 * Switch the local connection to a specific database within the
 * marlinspike namespace.
 */
export async function useDatabase(database: string): Promise<void> {
  const conn = getDb();
  await conn.use({ namespace: NS, database });
}

/** Switch the local connection to the shared UI-state database. */
export async function useUiDb(): Promise<void> {
  await useDatabase(UI_DB);
}

// ---------------------------------------------------------------------------
// Export / Import — used by the persistence bridge
// ---------------------------------------------------------------------------

/**
 * Export the current database as a SurrealQL string.
 * Caller must call useDatabase() first to select the target.
 */
export async function exportDb(): Promise<string> {
  const conn = getDb();
  const dump = await conn.export({});
  return typeof dump === "string" ? dump : new TextDecoder().decode(dump as ArrayBuffer);
}

/**
 * Import a SurrealQL dump into the current database.
 * Caller must call useDatabase() first to select the target.
 */
export async function importDb(dump: string): Promise<void> {
  const conn = getDb();
  // Cast to accept the options parameter — the SDK types only declare 1 arg
  // but the runtime API accepts { ml: false } to skip ML model import.
  await (conn.import as (data: string, opts?: Record<string, unknown>) => Promise<void>)(dump, {
    ml: false,
  });
}

export { NS, UI_DB };
export type { Surreal, SurrealSession };

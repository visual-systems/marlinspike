const logEl = document.getElementById("log");

function log(msg, cls = "") {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = msg + "\n";
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

window.clearLog = () => { logEl.innerHTML = ""; };

// ---------------------------------------------------------------------------
// Simple IndexedDB key-value helpers (our own, not SurrealDB's)
// ---------------------------------------------------------------------------

const IDB_NAME = "surreal_snapshots";
const IDB_STORE = "dumps";

function openSnapshotDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDump(key, data) {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(data, key);
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => { idb.close(); reject(tx.error); };
  });
}

async function loadDump(key) {
  const idb = await openSnapshotDb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => { idb.close(); resolve(req.result ?? null); };
    req.onerror = () => { idb.close(); reject(req.error); };
  });
}

// ---------------------------------------------------------------------------
// SurrealDB module loader
// ---------------------------------------------------------------------------

const SURREAL_URL = "https://esm.sh/surrealdb@2.0.3";
const WASM_URL = "https://esm.sh/@surrealdb/wasm@3.0.3?deps=surrealdb@2.0.3";

let cachedModules = null;

async function loadModules() {
  if (cachedModules) {
    log("Using cached modules.");
    return cachedModules;
  }
  log("Loading modules from esm.sh...");
  const [surreal, wasm] = await Promise.all([
    import(/* @vite-ignore */ SURREAL_URL),
    import(/* @vite-ignore */ WASM_URL),
  ]);
  log("Modules loaded.", "success");
  cachedModules = { Surreal: surreal.Surreal, wasm };
  return cachedModules;
}

// ---------------------------------------------------------------------------
// mem:// + IndexedDB bridge test
// ---------------------------------------------------------------------------

window.testBridge = async () => {
  try {
    log("=== Testing mem:// + IndexedDB bridge ===\n");

    const { Surreal, wasm } = await loadModules();
    const engines = wasm.createWasmEngines();
    const db = new Surreal({ engines });

    // Step 1: Connect to mem://
    log("1. Connecting to mem://...");
    await db.connect("mem://");
    await db.use({ namespace: "test", database: "test" });
    log("   Connected and use() succeeded.", "success");

    // Step 2: Check for a saved dump and restore it
    log("2. Checking for saved dump in IndexedDB...");
    const saved = await loadDump("test:test");
    if (saved) {
      log(`   Found dump (${saved.length} bytes). Importing...`);
      // import() expects a Uint8Array or string depending on SDK version
      await db.import(saved, { ml: false });
      log("   Import complete.", "success");

      // Verify restored data
      const restored = await db.query("SELECT * FROM thing");
      log(`   Restored records: ${JSON.stringify(restored, null, 2)}`, "success");
    } else {
      log("   No saved dump found (fresh start).");
    }

    // Step 3: Write some data
    const writeVal = Math.random();
    log(`3. Writing test record (value: ${writeVal})...`);
    await db.query("UPSERT thing:one SET value = $val, ts = time::now()", {
      val: writeVal,
    });
    log("   Record written.", "success");

    // Step 4: Export and save to IndexedDB
    log("4. Exporting database...");
    const dump = await db.export({});
    const dumpStr = typeof dump === "string" ? dump : new TextDecoder().decode(dump);
    log(`   Export size: ${dumpStr.length} bytes`);
    log(`   Preview: ${dumpStr.substring(0, 200)}...`);

    log("5. Saving dump to IndexedDB...");
    await saveDump("test:test", dumpStr);
    log("   Saved.", "success");

    // Step 5: Read back to verify
    const result = await db.query("SELECT * FROM thing");
    log(`\nCurrent records: ${JSON.stringify(result, null, 2)}`, "success");

    await db.close();
    log("\nDone. Reload the page and click this button again — the data should persist.", "success");

  } catch (err) {
    log(`ERROR: ${err.message}\n${err.stack}`, "error");
  }
};

// ---------------------------------------------------------------------------
// Original tests for comparison
// ---------------------------------------------------------------------------

async function runTest(protocol, engineFactory) {
  const { Surreal, wasm } = await loadModules();
  const engines = wasm[engineFactory]();
  const db = new Surreal({ engines });

  log(`Connecting to ${protocol}...`);
  const connectTimeout = setTimeout(() => {
    log("  (still waiting... connect may be hanging)", "error");
  }, 5000);
  await db.connect(protocol);
  clearTimeout(connectTimeout);
  log(`Connected to ${protocol}`, "success");

  log("Calling use({ namespace: 'test', database: 'test' })...");
  const useTimeout = setTimeout(() => {
    log("  (still waiting... use() may be hanging)", "error");
  }, 5000);
  await db.use({ namespace: "test", database: "test" });
  clearTimeout(useTimeout);
  log("use() succeeded", "success");

  log("Creating test record...");
  const writeVal = Math.random();
  await db.query("UPSERT thing:one SET value = $val, ts = time::now()", {
    val: writeVal,
  });
  log(`Record written (value: ${writeVal})`, "success");

  const result = await db.query("SELECT * FROM thing");
  log(`Read back: ${JSON.stringify(result, null, 2)}`, "success");

  await db.close();
  log("Connection closed.", "success");
}

window.testMemory = async () => {
  try {
    log("=== Testing mem:// ===");
    await runTest("mem://", "createWasmEngines");
  } catch (err) {
    log(`ERROR: ${err.message}\n${err.stack}`, "error");
  }
};

window.testIndxdb = async () => {
  try {
    log("=== Testing indxdb:// (standard engine) ===");
    await runTest("indxdb://spike_test", "createWasmEngines");
  } catch (err) {
    log(`ERROR: ${err.message}\n${err.stack}`, "error");
  }
};

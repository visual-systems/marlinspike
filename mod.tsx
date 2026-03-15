import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";
import { bundle } from "@deno/emit";
import { App } from "./src/ui/App.tsx";
import { StoriesShell } from "./src/ui/StoriesShell.tsx";

const args = parseArgs(Deno.args);
const PORT = Number(args.port) || 8000;

async function loadJs(distUrl: URL, srcUrl: URL, importMapURL: URL): Promise<string> {
  try {
    return await Deno.readTextFile(distUrl);
  } catch {
    const { code } = await bundle(srcUrl, { importMap: importMapURL });
    return code;
  }
}

const importMapURL = new URL("./deno.json", import.meta.url);

const [clientJs, storiesJs] = await Promise.all([
  loadJs(
    new URL("./dist/client.js", import.meta.url),
    new URL("./src/ui/client.tsx", import.meta.url),
    importMapURL,
  ),
  loadJs(
    new URL("./dist/stories.js", import.meta.url),
    new URL("./src/ui/stories/main.tsx", import.meta.url),
    importMapURL,
  ),
]);

const app = new Hono();

app.get("/", (c) => c.html(<App />));
app.get("/stories", (c) => c.html(<StoriesShell />));
app.get("/health", (c) => c.json({ name: "marlinspike", status: "ok" }));

app.get("/client.js", (c) => c.body(clientJs, 200, { "content-type": "application/javascript" }));
app.get("/stories.js", (c) => c.body(storiesJs, 200, { "content-type": "application/javascript" }));

const server = Deno.serve({ port: PORT }, app.fetch);

console.log(`Marlinspike listening on http://localhost:${PORT}`);

if (args.timeout != null) {
  const ms = Number(args.timeout);
  if (!Number.isFinite(ms) || ms <= 0) {
    console.error("Usage: --timeout <milliseconds>");
    Deno.exit(1);
  }
  setTimeout(async () => {
    await server.shutdown();
  }, ms);
}

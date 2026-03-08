import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";
import { bundle } from "@deno/emit";
import { App } from "./src/ui/App.tsx";
import { StoriesShell } from "./src/ui/StoriesShell.tsx";

const args = parseArgs(Deno.args);
const PORT = Number(args.port) || 8000;

const app = new Hono();

app.get("/", (c) => c.html(<App />));
app.get("/stories", (c) => c.html(<StoriesShell />));
app.get("/health", (c) => c.json({ name: "marlinspike", status: "ok" }));
const importMapURL = new URL("./deno.json", import.meta.url);

app.get("/client.js", async (c) => {
  const url = new URL("./src/ui/client.tsx", import.meta.url);
  const { code } = await bundle(url, { importMap: importMapURL });
  return c.body(code, 200, {
    "content-type": "application/javascript",
  });
});

app.get("/stories.js", async (c) => {
  const url = new URL("./src/ui/stories/main.tsx", import.meta.url);
  const { code } = await bundle(url, { importMap: importMapURL });
  return c.body(code, 200, {
    "content-type": "application/javascript",
  });
});

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

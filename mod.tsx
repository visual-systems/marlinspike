import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";
import { bundle } from "@deno/emit";
import { App } from "./src/ui/App.tsx";
import { StoriesShell } from "./src/ui/StoriesShell.tsx";

const args = parseArgs(Deno.args);
const PORT = Number(args.port) || 8000;

const isDev = args.dev === true;
const importMapURL = new URL("./deno.json", import.meta.url);

function jsResponse(code: string) {
  return new Response(code, { headers: { "content-type": "application/javascript" } });
}

// Production: pre-load bundles at startup for instant request serving.
const clientJs = isDev
  ? null
  : await Deno.readTextFile(new URL("./dist/client.js", import.meta.url));
const storiesJs = isDev
  ? null
  : await Deno.readTextFile(new URL("./dist/stories.js", import.meta.url));

const app = new Hono();

app.get("/", (c) => c.html(<App />));
app.get("/stories", (c) => c.html(<StoriesShell />));
app.get("/health", (c) => c.json({ name: "marlinspike", status: "ok" }));

app.get("/client.js", async (c) => {
  if (clientJs) return c.body(clientJs, 200, { "content-type": "application/javascript" });
  const { code } = await bundle(new URL("./src/ui/client.tsx", import.meta.url), {
    importMap: importMapURL,
  });
  return jsResponse(code);
});
app.get("/stories.js", async (c) => {
  if (storiesJs) return c.body(storiesJs, 200, { "content-type": "application/javascript" });
  const { code } = await bundle(new URL("./src/ui/stories/main.tsx", import.meta.url), {
    importMap: importMapURL,
  });
  return jsResponse(code);
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

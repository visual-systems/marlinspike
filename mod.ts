import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";
import { transpile } from "@deno/emit";
import { handleRoot } from "./src/ui/handler.tsx";

const args = parseArgs(Deno.args);
const PORT = Number(args.port) || 8000;

const app = new Hono();

app.get("/", handleRoot);
app.get("/health", (c) => c.json({ name: "marlinspike", status: "ok" }));
app.get("/client.js", async (c) => {
  const url = new URL("./src/ui/client.ts", import.meta.url);
  const result = await transpile(url);
  return c.body(result.get(url.href) ?? "", 200, {
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

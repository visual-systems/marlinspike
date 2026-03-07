import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";

const args = parseArgs(Deno.args);
const PORT = Number(args.port) || 8000;

const app = new Hono();

app.get("/", (c) => c.json({ name: "marlinspike", status: "ok" }));

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

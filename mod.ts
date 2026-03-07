import { Hono } from "@hono/hono";

const PORT = 8000;

const app = new Hono();

app.get("/", (c) => c.json({ name: "marlinspike", status: "ok" }));

const server = Deno.serve({ port: PORT }, app.fetch);

console.log(`Marlinspike listening on http://localhost:${PORT}`);

const timeoutFlag = Deno.args.indexOf("--timeout");
if (timeoutFlag !== -1) {
  const ms = Number(Deno.args[timeoutFlag + 1]);
  if (!Number.isFinite(ms) || ms <= 0) {
    console.error("Usage: --timeout <milliseconds>");
    Deno.exit(1);
  }
  setTimeout(async () => {
    await server.shutdown();
  }, ms);
}

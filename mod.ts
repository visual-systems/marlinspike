const PORT = 8000;

const server = Deno.serve({ port: PORT }, (_req) => {
  return new Response(
    JSON.stringify({ name: "marlinspike", status: "ok" }),
    { headers: { "content-type": "application/json" } },
  );
});

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

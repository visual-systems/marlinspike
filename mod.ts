const PORT = 8000;

Deno.serve({ port: PORT }, (_req) => {
  return new Response(
    JSON.stringify({ name: "marlinspike", status: "ok" }),
    { headers: { "content-type": "application/json" } },
  );
});

console.log(`Marlinspike listening on http://localhost:${PORT}`);

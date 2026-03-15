// Pre-bundle client scripts to dist/ for production deployment.
// Usage: deno task build
import { bundle } from "@deno/emit";

const importMapURL = new URL("./deno.json", import.meta.url);

await Deno.mkdir("dist", { recursive: true });

const [{ code: clientJs }, { code: storiesJs }] = await Promise.all([
  bundle(new URL("./src/ui/client.tsx", import.meta.url), { importMap: importMapURL }),
  bundle(new URL("./src/ui/stories/main.tsx", import.meta.url), { importMap: importMapURL }),
]);

await Promise.all([
  Deno.writeTextFile("dist/client.js", clientJs),
  Deno.writeTextFile("dist/stories.js", storiesJs),
]);

console.log("Built dist/client.js and dist/stories.js");

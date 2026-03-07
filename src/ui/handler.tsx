import type { Context } from "@hono/hono";
import { App } from "./App.tsx";

export const handleRoot = (c: Context) => c.html(<App />);

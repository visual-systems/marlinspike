import type { Context } from "@hono/hono";
import { StoriesShell } from "./StoriesShell.tsx";

export const handleStories = (c: Context) => c.html(<StoriesShell />);

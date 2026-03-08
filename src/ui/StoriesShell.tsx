import type { FC } from "@hono/hono/jsx";

export const StoriesShell: FC = () => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Marlinspike — Stories</title>
      <style>
        {`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1a1a2e; color: #e0e0e0; font-family: sans-serif; height: 100vh; overflow: hidden; }
        #stories { display: flex; height: 100vh; }
        #stories-sidebar { width: 220px; flex-shrink: 0; background: #0f0f22; border-right: 1px solid #2a2a4a; overflow-y: auto; }
        #stories-main { flex: 1; overflow: auto; padding: 24px; }
        `}
      </style>
    </head>
    <body>
      <div id="stories" />
      <script type="module" src="/stories.js" />
    </body>
  </html>
);

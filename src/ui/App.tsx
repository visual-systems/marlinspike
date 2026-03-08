import type { FC } from "@hono/hono/jsx";

export const App: FC = () => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Marlinspike</title>
      <style>
        {`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #1a1a2e; color: #e0e0e0; font-family: sans-serif; height: 100vh; overflow: hidden; }
        #app { display: flex; flex-direction: column; height: 100vh; }
        #workspace-bar {
          display: flex; align-items: center;
          height: 36px; padding: 0 8px;
          background: #12122a; border-bottom: 1px solid #2a2a4a; flex-shrink: 0;
        }
        #workspace-controls {
          display: flex; align-items: center; gap: 8px;
          height: 32px; padding: 0 10px;
          background: #0f0f22; border-bottom: 1px solid #2a2a4a; flex-shrink: 0;
        }
        #workspace-area { flex: 1; display: flex; overflow: hidden; }
        `}
      </style>
    </head>
    <body>
      <div id="app">
        <div id="workspace-bar" />
        <div id="workspace-controls" />
        <div id="workspace-area" />
      </div>
      <script type="module" src="/client.js" />
    </body>
  </html>
);

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
        body { background: #1a1a2e; color: #e0e0e0; font-family: sans-serif; }
        #canvas { width: 100vw; height: 100vh; display: flex;
                  align-items: center; justify-content: center; }
      `}
      </style>
    </head>
    <body>
      <div id="canvas" />
    </body>
  </html>
);

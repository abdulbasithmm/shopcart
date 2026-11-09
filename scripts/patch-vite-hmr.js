/**
 * Helper to patch Vite's client WebSocket rejection in cloud container/reverse proxy setups
 * ensuring that failed HMR WebSockets do not throw unhandled fatal errors in iframes.
 */
import fs from 'fs';
import path from 'path';

const files = [
  path.resolve(process.cwd(), 'node_modules/vite/dist/client/client.mjs'),
  path.resolve(process.cwd(), 'node_modules/vite/dist/client/bundledDevClient.mjs'),
];

files.forEach((file) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    if (content.includes('reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));')) {
      content = content.replace(
        'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
        'resolve();'
      );
      modified = true;
    }

    if (content.includes('console.error(`[vite] failed to connect to websocket (${e}). `);\n\t\t\t\tthrow e;')) {
      content = content.replace(
        'console.error(`[vite] failed to connect to websocket (${e}). `);\n\t\t\t\tthrow e;',
        'console.warn(`[vite] HMR websocket connection skipped in cloud container environment.`);\n\t\t\t\treturn;'
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Successfully patched: ${file}`);
    }
  }
});

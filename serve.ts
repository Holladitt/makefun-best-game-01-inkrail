import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// INKRAIL — serve.ts
// Serves game/ on http://localhost:8080 for local play-testing. Static files only.

export function serveGame(port) {
  const root = fileURLToPath(new URL('./game/', import.meta.url));
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const type = file.endsWith('.html') ? 'text/html'
      : file.endsWith('.css') ? 'text/css'
      : file.endsWith('.js') ? 'text/javascript'
      : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    createReadStream(file).pipe(res);
  });
  server.listen(port, () => console.log('INKRAIL at http://localhost:' + port));
  return server;
}

serveGame(8080);

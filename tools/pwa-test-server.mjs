import { build } from 'vite';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname } from 'node:path';
const root = await mkdtemp(join(tmpdir(), 'volley-pwa-test-'));
let version = 'A';
for (const [name, number] of [
  ['A', '0.1.0'],
  ['B', '0.1.1'],
]) {
  await build({
    logLevel: 'error',
    define: {
      __APP_VERSION__: JSON.stringify(number),
      __APP_BUILD_ID__: JSON.stringify(`test-${name}`),
    },
    build: { outDir: join(root, name), emptyOutDir: true },
  });
}
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (request, response) => {
  if (request.url === '/__pwa_test__/switch' && request.method === 'POST') {
    version = 'B';
    response.writeHead(204).end();
    return;
  }
  const pathname = new URL(request.url, 'http://127.0.0.1:4178').pathname;
  const prefix = '/volley-web-app/';
  if (!pathname.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
  const directory = join(root, version);
  const file = resolve(directory, relative);
  if (!file.startsWith(directory + '/')) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch {
    response.writeHead(404).end();
  }
});
server.listen(4178, '127.0.0.1');
const close = () =>
  server.close(async () => {
    await rm(root, { recursive: true, force: true });
    process.exit(0);
  });
process.on('SIGTERM', close);
process.on('SIGINT', close);

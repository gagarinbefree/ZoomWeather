import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
};

/**
 * startVersionedSite. Serve two releases to exercise real service worker updates.
 * @returns A local site address with actions to publish and close it.
 */
export async function startVersionedSite(): Promise<{
  readonly url: string;
  readonly publish: () => void;
  readonly close: () => Promise<void>;
}> {
  let revision = 1;
  const root = resolve('dist-e2e');
  const server = createServer((request, response) => {
    void (async (): Promise<void> => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const relative = url.pathname.replace(/^\/ZoomWeather\//, '') || 'index.html';
      const file = resolve(root, relative);
      if (!url.pathname.startsWith('/ZoomWeather/') || !file.startsWith(`${root}${sep}`)) {
        response.writeHead(404).end();
        return;
      }
      const release = revision;
      let body = await readFile(file);
      if (relative === 'index.html') {
        body = Buffer.from(
          body
            .toString()
            .replace('</head>', `<meta name="test-release" content="${String(release)}"></head>`),
        );
      } else if (relative === 'sw.js') {
        body = Buffer.from(
          body
            .toString()
            .replace(
              /url:"index.html",revision:"[^"]+"/,
              `url:"index.html",revision:"test-${String(release)}"`,
            ),
        );
      }
      response
        .writeHead(200, {
          'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(body);
    })().catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return {
    url: `http://127.0.0.1:${String(address.port)}/ZoomWeather/`,
    publish: (): void => {
      revision++;
    },
    close: () =>
      new Promise<void>((done, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else done();
        });
        server.closeAllConnections();
      }),
  };
}

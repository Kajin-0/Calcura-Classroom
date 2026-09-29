import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { Console } from 'node:console';
import { readFile, stat } from 'node:fs/promises';
import { createServer, get } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

const logger = new Console(process.stdout, process.stderr);
const dist = resolve('dist');
const basePath = (process.env.PAGES_BASE_PATH ?? '')
  .trim()
  .replace(/^\/+|\/+$/g, '');
const publicBase = basePath ? `/${basePath}/` : '/';
const indexHtml = await readFile(resolve(dist, 'index.html'), 'utf8');
const fallbackHtml = await readFile(resolve(dist, '404.html'), 'utf8');
assert.equal(fallbackHtml, indexHtml, '404.html must exactly copy index.html.');

const assetReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((value) => value.includes('/assets/'));
assert.ok(assetReferences.some((value) => value.endsWith('.js')));
assert.ok(assetReferences.some((value) => value.endsWith('.css')));

let builtText = indexHtml;
for (const reference of assetReferences) {
  const url = new URL(reference, 'https://pages.invalid');
  assert.ok(
    url.pathname.startsWith(publicBase),
    `Wrong Pages asset base: ${reference}`,
  );
  const filePath = resolve(
    dist,
    decodeURIComponent(url.pathname.slice(publicBase.length)),
  );
  assert.ok(
    filePath.startsWith(`${dist}${sep}`),
    'Asset path must stay in dist/.',
  );
  builtText += await readFile(filePath, 'utf8');
}
assert.doesNotMatch(
  builtText,
  /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/|["'\s])/i,
  'Production artifact must not contain localhost URLs.',
);

for (const variable of ['VITE_SUPABASE_URL', 'VITE_CALCURA_APP_URL']) {
  const value = process.env[variable]?.trim();
  assert.ok(value, `Set ${variable} for artifact verification.`);
  assert.ok(
    builtText.includes(new URL(value).origin),
    `${variable} origin is missing from the built app.`,
  );
}

const routes = [
  '/',
  '/signin',
  '/app',
  '/app/classes/pages-smoke/assignments/new',
];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', `http://${request.headers.host}`)
    .pathname;
  const rootWithoutSlash = publicBase.replace(/\/$/, '');
  let relativePath;
  if (pathname === publicBase || (basePath && pathname === rootWithoutSlash)) {
    relativePath = '';
  } else if (pathname.startsWith(publicBase)) {
    relativePath = pathname.slice(publicBase.length);
  } else {
    response.writeHead(404).end();
    return;
  }

  const requestedFile = resolve(
    dist,
    decodeURIComponent(relativePath || 'index.html'),
  );
  if (!requestedFile.startsWith(`${dist}${sep}`)) {
    response.writeHead(404).end();
    return;
  }

  let file = requestedFile;
  let status = 200;
  try {
    if (!(await stat(file)).isFile()) throw new Error('Not a file');
  } catch {
    file = resolve(dist, '404.html');
    status = 404;
  }
  const type =
    {
      '.css': 'text/css',
      '.html': 'text/html',
      '.js': 'text/javascript',
    }[extname(file)] ?? 'application/octet-stream';
  response
    .writeHead(status, { 'content-type': type })
    .end(await readFile(file));
});

await new Promise((resolvePromise, rejectPromise) => {
  server.once('error', rejectPromise);
  server.listen(0, '127.0.0.1', resolvePromise);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  for (const route of routes) {
    const path = route === '/' ? publicBase : `${publicBase}${route.slice(1)}`;
    const result = await request(new URL(path, origin));
    assert.equal(result.status, route === '/' ? 200 : 404, route);
    assert.equal(result.body, indexHtml, `${route} must serve the SPA shell.`);
  }
  for (const reference of assetReferences) {
    const result = await request(new URL(reference, origin));
    assert.equal(result.status, 200, `Missing Pages asset ${reference}.`);
  }
} finally {
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
}

logger.log(
  `Pages artifact verified: exact fallback, ${assetReferences.length} assets, base ${publicBase}, routes ${routes.join(', ')}.`,
);

function request(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () =>
        resolvePromise({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    }).on('error', rejectPromise);
  });
}

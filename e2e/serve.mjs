import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'out');
const PORT = Number(process.argv[3] ?? 3100);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const path = normalize(decodeURIComponent(pathname));
  const file = join(ROOT, path);
  const isFile = (p) => p.startsWith(ROOT) && existsSync(p) && statSync(p).isFile();
  const page = join(file, 'index.html');

  if (!isFile(file) && isFile(page) && !pathname.endsWith('/')) {
    res.writeHead(308, { Location: `${pathname}/${new URL(req.url, 'http://localhost').search}` }).end();
    return;
  }
  const found = isFile(file) ? file : isFile(page) ? page : null;
  const target = found ?? join(ROOT, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(target)] ?? 'application/octet-stream' });
  createReadStream(target).pipe(res);
}).listen(PORT);

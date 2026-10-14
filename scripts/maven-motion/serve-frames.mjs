#!/usr/bin/env node
// Serves a rendered-output directory over loopback so the frames can actually be
// looked at in a browser (the renderer is headless; there is no other way to see
// what it produced). Read-only, loopback-only, no directory escaping.
//
//   node scripts/maven-motion/serve-frames.mjs [--dir output/native-demo] [--port 4599]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const root = resolve(arg('dir', 'output/native-demo'));
const port = Number.parseInt(arg('port', '4599'), 10);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.json': 'application/json', '.css': 'text/css',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const target = join(root, normalize(decodeURIComponent(requested)).replace(/^([/\\])+/, ''));
  // Never serve anything outside the directory that was asked for.
  if (!target.startsWith(root + sep) && target !== root) {
    response.writeHead(403).end('outside the served directory');
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': String(body.length),
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${requested}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[frames] serving ${root} at http://127.0.0.1:${port}/`);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkResultReachability } from './resultReachability.js';

const allowlist = ['cdn.example.test', '*.muapi-assets.example'];

test('reachability uses HEAD without redirects or downloading the asset', async () => {
  const calls = [];
  const reachable = await checkResultReachability('https://cdn.example.test/asset.mp4', { allowlist, fetcher: async (url, options) => { calls.push({ url: String(url), options }); return new Response(null, { status: 200 }); } });
  assert.equal(reachable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'HEAD');
  assert.equal(calls[0].options.redirect, 'manual');
});

test('reachability falls back to a one-byte range only when HEAD is unsupported', async () => {
  const calls = [];
  const reachable = await checkResultReachability('https://media.muapi-assets.example/asset.png', { allowlist, fetcher: async (_url, options) => { calls.push(options); return calls.length === 1 ? new Response(null, { status: 405 }) : new Response(null, { status: 206 }); } });
  assert.equal(reachable, true);
  assert.deepEqual(calls.map((call) => call.method), ['HEAD', 'GET']);
  assert.equal(calls[1].headers.Range, 'bytes=0-0');
});

test('reachability refuses unlisted, private, redirected, and malformed targets', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }); };
  assert.equal(await checkResultReachability('https://unlisted.example/asset', { allowlist, fetcher }), false);
  assert.equal(await checkResultReachability('https://127.0.0.1/secret', { allowlist: ['127.0.0.1'], fetcher }), false);
  assert.equal(await checkResultReachability('file:///secret', { allowlist, fetcher }), false);
  assert.equal(await checkResultReachability('https://cdn.example.test/redirect', { allowlist, fetcher }), false);
  assert.equal(calls, 1);
});

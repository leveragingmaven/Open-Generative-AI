import test from 'node:test';
import assert from 'node:assert/strict';
import { MuApiDesignAgentProvider } from './MuApiDesignAgentProvider.js';

test('registerSessionAsset POSTs image URL to the authorized session asset endpoint and returns only a valid server label', async () => {
  const calls = [];
  const provider = new MuApiDesignAgentProvider({
    basePath: '/api/v1/creative-agent',
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({ asset_label: 'asset_generated_1' }), { status: 201 });
    },
  });
  const result = await provider.registerSessionAsset('session-1', {
    url: 'https://cdn.example.test/generated.png', kind: 'image', sourceTool: 'maven',
  });
  assert.equal(calls[0].url, '/api/v1/creative-agent/sessions/session-1/assets');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    url: 'https://cdn.example.test/generated.png', kind: 'image', source_tool: 'maven',
  });
  assert.deepEqual(result, { attachmentId: 'asset_generated_1', kind: 'image' });
});

test('registerSessionAsset rejects insecure URLs and unsupported kinds before making a request', async () => {
  let calls = 0;
  const provider = new MuApiDesignAgentProvider({ fetchFn: async () => { calls += 1; throw new Error('must not call'); } });
  await assert.rejects(provider.registerSessionAsset('session-1', { url: 'javascript:alert(1)', kind: 'image' }), /valid generated media URL/);
  await assert.rejects(provider.registerSessionAsset('session-1', { url: 'https://cdn.example.test/file.bin', kind: 'document' }), /supported kind/);
  assert.equal(calls, 0);
});

test('registerSessionAsset supports generated audio/video only through valid session labels', async () => {
  const calls = [];
  const provider = new MuApiDesignAgentProvider({ fetchFn: async (_url, options) => { calls.push(JSON.parse(options.body)); return new Response(JSON.stringify({ asset_label: 'asset_media_1' }), { status: 201 }); } });
  assert.deepEqual(await provider.registerSessionAsset('session-1', { url: 'https://cdn.example.test/speech.mp3', kind: 'audio' }), { attachmentId: 'asset_media_1', kind: 'audio' });
  assert.deepEqual(await provider.registerSessionAsset('session-1', { url: 'https://cdn.example.test/talk.mp4', kind: 'video' }), { attachmentId: 'asset_media_1', kind: 'video' });
  assert.deepEqual(calls.map((call) => call.kind), ['audio', 'video']);
});

test('registerSessionAsset rejects an upstream response without a valid session asset label', async () => {
  const provider = new MuApiDesignAgentProvider({ fetchFn: async () => new Response(JSON.stringify({ asset_label: 'not-trusted' }), { status: 200 }) });
  await assert.rejects(provider.registerSessionAsset('session-1', { url: 'https://cdn.example.test/generated.png', kind: 'image' }), /could not be registered/);
});

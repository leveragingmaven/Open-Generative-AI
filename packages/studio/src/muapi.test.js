import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { generateImage } from "./muapi.js";

const realSetTimeout = globalThis.setTimeout;
const resultUrl = (requestId) => `https://api.muapi.ai/api/v1/predictions/${requestId}/result`;

before(() => {
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };
});

after(() => {
  globalThis.setTimeout = realSetTimeout;
});

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `HTTP ${status}`,
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

function imageParams(signal) {
  return { model: 'ideogram-v3-t2i', prompt: 'test prompt', signal };
}

function mockSubmissionAndPolling({ submission = { request_id: 'request-1' }, polls, onFetch } = {}) {
  let pollIndex = 0;
  return async (url, options) => {
    onFetch?.(url, options);
    if (options?.method === 'POST') return response(submission);
    const next = polls[Math.min(pollIndex++, polls.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
}

async function rejectsWith(fetchImpl, expected, params = imageParams()) {
  globalThis.fetch = fetchImpl;
  await assert.rejects(() => generateImage('test-key', params), expected);
}

test('completed returns immediately', async () => {
  const urls = [];
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'completed', outputs: ['https://test/image.png'] })],
    onFetch: (url) => urls.push(url),
  });
  const result = await generateImage('test-key', imageParams());
  assert.equal(result.url, 'https://test/image.png');
  assert.deepEqual(urls, ['https://api.muapi.ai/api/v1/ideogram-v3-t2i', resultUrl('request-1')]);
});

test('succeeded and success return immediately', async () => {
  for (const status of ['succeeded', 'success']) {
    let resultRequests = 0;
    globalThis.fetch = mockSubmissionAndPolling({
      polls: [response({ status, url: `https://test/${status}.png` })],
      onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
    });
    const result = await generateImage('test-key', imageParams());
    assert.equal(result.url, `https://test/${status}.png`);
    assert.equal(resultRequests, 1);
  }
});

for (const status of ['failed', 'error', 'cancelled']) {
  test(`HTTP 200 + status ${status} stops after one result request`, async () => {
    let resultRequests = 0;
    await rejectsWith(mockSubmissionAndPolling({
      polls: [response({ status, error: 'provider generation failed' })],
      onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
    }), /Generation failed: provider generation failed/);
    assert.equal(resultRequests, 1);
  });
}

test('HTTP 400 with nested terminal status stops after one request and preserves useful error', async () => {
  let resultRequests = 0;
  await rejectsWith(mockSubmissionAndPolling({
    polls: [response({ detail: { id: 'provider-id', status: 'failed', error: 'internal error, please try again later.' } }, 400)],
    onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
  }), /Generation failed: internal error, please try again later/);
  assert.equal(resultRequests, 1);
});

for (const status of [401, 403]) {
  test(`HTTP ${status} terminates without retry`, async () => {
    let resultRequests = 0;
    await rejectsWith(mockSubmissionAndPolling({
      polls: [response({ detail: 'not authorized' }, status)],
      onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
    }), new RegExp(`Poll Failed: ${status}`));
    assert.equal(resultRequests, 1);
  });
}

test('HTTP 500 retries according to existing policy', async () => {
  let resultRequests = 0;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ detail: 'temporary outage' }, 500), response({ status: 'completed', url: 'https://test/recovered.png' })],
    onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
  });
  const result = await generateImage('test-key', imageParams());
  assert.equal(result.url, 'https://test/recovered.png');
  assert.equal(resultRequests, 2);
});

test('network failure retries according to existing policy', async () => {
  let resultRequests = 0;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [new TypeError('network down'), response({ status: 'completed', url: 'https://test/recovered.png' })],
    onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
  });
  const result = await generateImage('test-key', imageParams());
  assert.equal(result.url, 'https://test/recovered.png');
  assert.equal(resultRequests, 2);
});

test('queued, pending, and processing continue polling', async () => {
  let resultRequests = 0;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'queued' }), response({ status: 'pending' }), response({ status: 'processing' }), response({ status: 'completed' })],
    onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
  });
  await generateImage('test-key', imageParams());
  assert.equal(resultRequests, 4);
});

test('retry exhaustion fails once', async () => {
  let resultRequests = 0;
  await rejectsWith(mockSubmissionAndPolling({
    polls: [response({ detail: 'temporary outage' }, 500)],
    onFetch: (url) => { if (url.includes('/predictions/')) resultRequests++; },
  }), /Poll Failed|timed out/);
  assert.equal(resultRequests, 60);
});

test('AbortSignal still terminates correctly', async () => {
  const controller = new AbortController();
  let resultRequests = 0;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [Object.assign(new Error('aborted'), { name: 'AbortError' })],
    onFetch: (url) => {
      if (url.includes('/predictions/')) {
        resultRequests++;
        controller.abort();
      }
    },
  });
  await assert.rejects(() => generateImage('test-key', imageParams(controller.signal)), { name: 'AbortError' });
  assert.equal(resultRequests, 1);
});

for (const submission of [{ request_id: 'request-id-field' }, { id: 'id-field' }]) {
  test(`submission accepts ${Object.keys(submission)[0]}`, async () => {
    const urls = [];
    globalThis.fetch = mockSubmissionAndPolling({
      submission,
      polls: [response({ status: 'completed' })],
      onFetch: (url) => urls.push(url),
    });
    await generateImage('test-key', imageParams());
    assert.equal(urls[1], resultUrl(Object.values(submission)[0]));
  });
}

test('polling URL uses the exact returned request ID', async () => {
  const requestId = '29893303-1b66-4a9e-94e7-a5cfe14307fc';
  const urls = [];
  globalThis.fetch = mockSubmissionAndPolling({
    submission: { request_id: requestId },
    polls: [response({ status: 'completed' })],
    onFetch: (url) => urls.push(url),
  });
  await generateImage('test-key', imageParams());
  assert.equal(urls[1], resultUrl(requestId));
});

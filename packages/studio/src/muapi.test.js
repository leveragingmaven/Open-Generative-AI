import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { generateI2I, generateI2V, generateImage, generateVideo, getPredictionResult, getPublishedAgents, getTemplateAgents } from "./muapi.js";

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

test('prediction recovery recognizes HTTP 400 terminal failure without exposing provider detail', async () => {
  globalThis.fetch = async () => response({ detail: { id: 'remote-1', status: 'failed', error: 'private prompt or provider detail' } }, 400);
  const result = await getPredictionResult('test-key', 'remote-1');
  assert.deepEqual(result, { status: 'failed' });
});

test('prediction recovery never treats an authentication error as a terminal prediction', async () => {
  globalThis.fetch = async () => response({ detail: { status: 'failed' } }, 401);
  await assert.rejects(() => getPredictionResult('test-key', 'remote-1'), { code: 'provider_credential_rejected' });
});

test('agent catalog reads forward their AbortSignal', async () => {
  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, signal: options?.signal });
    return response([]);
  };

  await Promise.all([
    getTemplateAgents('test-key', { signal: controller.signal }),
    getPublishedAgents('test-key', { signal: controller.signal }),
  ]);

  assert.deepEqual(calls.map(({ url }) => url), [
    'https://api.muapi.ai/agents/templates/agents',
    'https://api.muapi.ai/agents/featured/agents',
  ]);
  assert.equal(calls.every(({ signal }) => signal === controller.signal), true);
});

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

async function generateAndCaptureBody(params = imageParams()) {
  let submissionUrl;
  let submissionBody;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'completed' })],
    onFetch: (url, options) => {
      if (options?.method === 'POST') {
        submissionUrl = url;
        submissionBody = JSON.parse(options.body);
      }
    },
  });
  await generateImage('test-key', params);
  return { submissionUrl, submissionBody };
}

async function generateI2IAndCaptureBody(params) {
  let submissionUrl;
  let submissionBody;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'completed' })],
    onFetch: (url, options) => {
      if (options?.method === 'POST') {
        submissionUrl = url;
        submissionBody = JSON.parse(options.body);
      }
    },
  });
  await generateI2I('test-key', params);
  return { submissionUrl, submissionBody };
}

async function rejectsWith(fetchImpl, expected, params = imageParams()) {
  globalThis.fetch = fetchImpl;
  await assert.rejects(() => generateImage('test-key', params), expected);
}

// Optional video quality controls are forwarded only when the selected model's
// manifest declares them, so unsupported parameters never reach the provider.
async function captureVideoSubmission(generate, params) {
  let submissionUrl;
  let submissionBody;
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'completed' })],
    onFetch: (url, options) => {
      if (options?.method === 'POST') {
        submissionUrl = url;
        submissionBody = JSON.parse(options.body);
      }
    },
  });
  await generate('test-key', params);
  return { submissionUrl, submissionBody };
}

test('generateVideo forwards only the optional controls the model declares', async () => {
  const { submissionUrl, submissionBody } = await captureVideoSubmission(generateVideo, {
    model: 'seedance-2.5-text-to-video',
    prompt: 'a fox in a forest',
    camera_fixed: true,
    generate_audio: true,
    negative_prompt: 'blurry, low quality',
    seed: 1234,
    movement_amplitude: 0.8,
  });

  assert.equal(submissionUrl, 'https://api.muapi.ai/api/v1/seedance-2.5-text-to-video');
  // Declared under those exact names on this model.
  assert.equal(submissionBody.camera_fixed, true);
  assert.equal(submissionBody.generate_audio, true);
  // Not declared by this model, so they must be dropped rather than sent.
  assert.equal('negative_prompt' in submissionBody, false);
  assert.equal('seed' in submissionBody, false);
  assert.equal('movement_amplitude' in submissionBody, false);
});

test('generateVideo maps generate_audio onto the declared generate_audio_switch field', async () => {
  const { submissionBody } = await captureVideoSubmission(generateVideo, {
    model: 'pixverse-v6-t2v',
    prompt: 'a fox in a forest',
    generate_audio: true,
  });

  assert.equal(submissionBody.generate_audio_switch, true);
  assert.equal('generate_audio' in submissionBody, false);
});

test('generateVideo drops every optional control the model does not declare', async () => {
  const { submissionBody } = await captureVideoSubmission(generateVideo, {
    model: 'seedance-lite-t2v',
    prompt: 'a fox in a forest',
    negative_prompt: 'blurry',
    seed: 1234,
  });

  assert.equal('negative_prompt' in submissionBody, false);
  assert.equal('seed' in submissionBody, false);
});

test('generateI2V forwards declared controls and drops undeclared ones', async () => {
  const declared = await captureVideoSubmission(generateI2V, {
    model: 'seedance-2.5-image-to-video',
    prompt: 'animate this frame',
    image_url: 'https://test/frame.png',
    camera_fixed: true,
    generate_audio: true,
    seed: 1234,
  });

  assert.equal(declared.submissionUrl, 'https://api.muapi.ai/api/v1/seedance-2.5-image-to-video');
  assert.equal(declared.submissionBody.camera_fixed, true);
  assert.equal(declared.submissionBody.generate_audio, true);
  assert.equal('seed' in declared.submissionBody, false);

  const undeclared = await captureVideoSubmission(generateI2V, {
    model: 'veo3-image-to-video',
    prompt: 'animate this frame',
    image_url: 'https://test/frame.png',
    negative_prompt: 'blurry',
    seed: 7,
  });

  assert.equal('negative_prompt' in undeclared.submissionBody, false);
  assert.equal('seed' in undeclared.submissionBody, false);
});

test('generateVideo skips optional controls left at their unset defaults', async () => {
  const { submissionBody } = await captureVideoSubmission(generateVideo, {
    model: 'seedance-2.5-text-to-video',
    prompt: 'a fox in a forest',
    camera_fixed: null,
    generate_audio: '',
  });

  assert.equal('camera_fixed' in submissionBody, false);
  assert.equal('generate_audio' in submissionBody, false);
});

test('default Ideogram v3 T2I submits only prompt and aspect ratio', async () => {
  const { submissionUrl, submissionBody } = await generateAndCaptureBody({
    model: 'ideogram-v3-t2i',
    prompt: 'enriched production prompt',
    aspect_ratio: '1:1',
  });

  assert.equal(submissionUrl, 'https://api.muapi.ai/api/v1/ideogram-v3-t2i');
  assert.deepEqual(submissionBody, {
    prompt: 'enriched production prompt',
    aspect_ratio: '1:1',
  });
  assert.equal('image_url' in submissionBody, false);
  assert.equal('resolution' in submissionBody, false);
  assert.equal('quality' in submissionBody, false);
});

test('Ideogram v3 T2I ignores unsupported image, resolution, and quality defaults when absent', async () => {
  const { submissionBody } = await generateAndCaptureBody({
    model: 'ideogram-v3-t2i',
    prompt: 'test prompt',
    aspect_ratio: '1:1',
    image_url: null,
    resolution: '1K',
    quality: 'high',
  });

  assert.equal('image_url' in submissionBody, false);
  assert.equal('resolution' in submissionBody, false);
  assert.equal('quality' in submissionBody, false);
});

test('reference-image models continue receiving their image field', async () => {
  const { submissionBody } = await generateAndCaptureBody({
    model: 'flux-pulid',
    prompt: 'reference portrait',
    aspect_ratio: '1:1',
    image_url: 'https://test/reference.png',
    strength: 0.75,
  });

  assert.equal(submissionBody.image_url, 'https://test/reference.png');
  assert.equal(submissionBody.strength, 0.75);
});

test('Nano Banana Pro Edit submits prompt, provider aspect ratio, and canonical references', async () => {
  const { submissionUrl, submissionBody } = await generateI2IAndCaptureBody({
    model: 'nano-banana-pro-edit',
    prompt: 'Edit the avatar',
    aspect_ratio: '1:1',
    images_list: ['https://test/avatar.png'],
  });

  assert.equal(submissionUrl, 'https://api.muapi.ai/api/v1/nano-banana-pro-edit');
  assert.deepEqual(submissionBody, {
    prompt: 'Edit the avatar',
    images_list: ['https://test/avatar.png'],
    aspect_ratio: '1:1',
  });
});

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
  const requestId = 'returned-request-id-with-hyphens';
  const urls = [];
  globalThis.fetch = mockSubmissionAndPolling({
    submission: { request_id: requestId },
    polls: [response({ status: 'completed' })],
    onFetch: (url) => urls.push(url),
  });
  await generateImage('test-key', imageParams());
  assert.equal(urls[1], resultUrl(requestId));
});

// Agency Mode credential handling.
//
// `muapi.js` is loaded twice on purpose. The static import at the top of this
// file is evaluated in Node, so it is the direct server-side instance. The
// browser instance is imported with `window` present, so it resolves the
// in-app proxy base URL and is the path the studio actually ships.
const MUAPI_MODULE_URL = new URL('./muapi.js', import.meta.url).href;

async function loadBrowserMuApi() {
  const hadWindow = 'window' in globalThis;
  const previousWindow = globalThis.window;
  globalThis.window = { location: { protocol: 'https:' } };
  try {
    return await import(`${MUAPI_MODULE_URL}?runtime=browser`);
  } finally {
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }
}

async function withAgencyMode(value, run) {
  const previous = process.env.AGENCY_MODE;
  if (value === undefined) delete process.env.AGENCY_MODE;
  else process.env.AGENCY_MODE = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.AGENCY_MODE;
    else process.env.AGENCY_MODE = previous;
  }
}

async function captureOutboundRequests(generate, params = imageParams()) {
  const requests = [];
  globalThis.fetch = mockSubmissionAndPolling({
    polls: [response({ status: 'completed' })],
    onFetch: (url, options) => requests.push({ url, headers: options?.headers || {} }),
  });
  await generate('test-key', params);
  return requests;
}

test('Agency Mode suppresses the client key on the proxied browser path', async () => {
  const browser = await loadBrowserMuApi();
  const requests = await withAgencyMode('true', () => captureOutboundRequests(browser.generateImage));

  // Submission and poll both go through the host app's proxy.
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/api/v1/ideogram-v3-t2i',
    '/api/api/v1/predictions/request-1/result',
  ]);
  // The proxy strips any browser key and injects its own, so none is sent.
  assert.equal(requests.every(({ headers }) => !('x-api-key' in headers)), true);
  // Headers are still constructed; only the credential is withheld.
  assert.equal(requests.every(({ headers }) => headers['Content-Type'] === 'application/json'), true);
});

test('Agency Mode still sends the resolved credential on a direct server-side request', async () => {
  const requests = await withAgencyMode('true', () => captureOutboundRequests(generateImage));

  // Server-side execution bypasses the proxy, so the URL is the upstream host.
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.muapi.ai/api/v1/ideogram-v3-t2i',
    'https://api.muapi.ai/api/v1/predictions/request-1/result',
  ]);
  // Submission AND polling must both authenticate, or the job is never recorded.
  assert.deepEqual(requests.map(({ headers }) => headers['x-api-key']), ['test-key', 'test-key']);
});

test('non-Agency browser requests keep sending the client key through the proxy', async () => {
  const browser = await loadBrowserMuApi();
  const requests = await withAgencyMode(undefined, () => captureOutboundRequests(browser.generateImage));

  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/api/v1/ideogram-v3-t2i',
    '/api/api/v1/predictions/request-1/result',
  ]);
  assert.deepEqual(requests.map(({ headers }) => headers['x-api-key']), ['test-key', 'test-key']);
});

test('non-Agency server-side requests are unchanged', async () => {
  const requests = await withAgencyMode(undefined, () => captureOutboundRequests(generateImage));

  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.muapi.ai/api/v1/ideogram-v3-t2i',
    'https://api.muapi.ai/api/v1/predictions/request-1/result',
  ]);
  assert.deepEqual(requests.map(({ headers }) => headers['x-api-key']), ['test-key', 'test-key']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { resolveImageBrief, imageBriefPreview } from './mavenImageBrief.js';
import { persistedConversation, acknowledgeConversationSave, stripTurnReceipt, acquireConversationLock } from './conversationTurnPersistence.js';
import { handleDesignAgentConversationPost } from './designAgentConversationEndpoint.js';
import { generateMavenImage } from './mavenImageGeneration.js';
import { copyProviderMedia } from './creativeMediaStorage.js';
import { persistMavenChatAsset } from './mavenChatCreativeAsset.js';

const identity = { accountId: 'a', identityKey: 'creator-a' }, conversationId = 'conversation-a', key = 'test-only-image-approval';
const initial = 'Create a professional Pinterest pin graphic for my digital product, **AI Road Map**. Headline: "Your AI Journey Starts Here". Supporting copy: "Stop guessing. Start using AI with confidence." Use deep black/charcoal, blush pink and vibrant pink accents, professional editorial typography, no generic stock photography. 1000 × 1500 pixels, 2:3 Pinterest format. Show the creative direction before generating the final image.';
const request = (message, id = 'test-turn-0001', session = conversationId, streaming = false) => new Request('https://creator.test/api/design-agent/conversation', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mavensync-turn-id': id, ...(streaming ? { Accept: 'text/event-stream' } : {}) }, body: JSON.stringify({ conversationId: session, message }) });
function storeFixture() {
  let messages = [], active = Promise.resolve(), writes = 0;
  return {
    get messages() { return structuredClone(messages); }, get writes() { return writes; },
    transport: { async read() { return structuredClone(messages); }, async write(_id, value) { messages = structuredClone(value); writes++; } },
    authenticate: async () => ({ identity }),
    ownership: { async verifyOwnedSession({ designSessionId, identity: who }) { if (designSessionId !== conversationId || who.identityKey !== identity.identityKey) throw new Error('not_owned'); } },
    acquire: async () => { const previous = active; let unlock; active = new Promise(resolve => { unlock = resolve; }); await previous; return unlock; },
  };
}
const turnResult = (message, reply = 'A reviewed direction.') => ({ status: 200, reply, persistedMessages: [{ role: 'user', content: message }, { role: 'assistant', content: reply }] });

test('actual multi-turn incident: user copy and refinements reach the actual generator inputs', async () => {
  const fixture = storeFixture(), calls = [], stored = [];
  const deps = { controlledExecution: true, identity, imageBriefSecret: key,
    ownershipService: { verifyOwnedSession: async () => ({ ok: true }) },
    conversationReader: { read: async () => ({ messages: fixture.messages, attachments: [], conversationId }) },
    resolveProjectContext: async () => null,
    createTextProvider: () => { throw new Error('Unexpected text-provider fallback in this mocked test'); },
    generateMavenImage: (who,args) => generateMavenImage({ identity: who, ...args, credentialResolver: async () => 'fixture-only',
      muapiProvider: { generateImage: async (_key,params) => { calls.push(params); params.onRequestId('prediction-test'); return { url: 'https://media.test/result.png' }; } } }),
    persistMavenCreativeAsset: async (_who, { media }) => { stored.push(media); return { id: 'asset_result', metadata: { imageVerification: { verified: true } }, deliveryUrl: 'https://media.test/export-1000x1500.png' }; },
  };
  const send = async (message, id) => {
    const response = await persistedConversation(request(message, id, conversationId, true), (req, context) => handleDesignAgentConversationPost(req, { ...deps, ...context }), fixture);
    assert.equal(response.status, 200);
    const events = (await response.text()).split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
    const done = events.find(event => event.type === 'done');
    assert.ok(done, JSON.stringify(events));
    return done;
  };
  for (const [index, message] of [initial, 'AI Road Map', 'more faceless', 'timeline'].entries()) {
    await send(message, `review-turn-${index}`);
    assert.equal(calls.length, 0, 'preview/refinement must not generate');
  }
  await fixture.transport.write(conversationId, [...fixture.messages, { role: 'assistant', content: 'I suggest replacing the headline with A 5-step plan to get results fast.' }]);
  const result = await send('create the image requested', 'render-turn');
  assert.equal(calls.length, 1);
  const sent = calls[0];
  for (const text of ['Your AI Journey Starts Here', 'Stop guessing. Start using AI with confidence.', 'AI Road Map', 'faceless', 'timeline', 'blush pink']) assert.ok(sent.prompt.includes(text), text);
  assert.doesNotMatch(sent.prompt, /A 5-step plan to get results fast/);
  assert.equal(sent.aspect_ratio, '2:3');
  assert.match(sent.prompt, /Compose one truthful visual hook/);
  assert.match(sent.prompt, /five-step vertical timeline/);
  assert.equal(stored[0].trace.providerPredictionId, 'prediction-test');
  assert.equal(stored[0].trace.requestId, 'render-turn');
  assert.deepEqual(stored[0].imageRequirements, { aspectRatio: '2:3', width: 1000, height: 1500 });
  assert.match(result.reply, /export-1000x1500/);
  assert.match(result.reply, /review/i);
  await send('create the image requested', 'render-turn');
  assert.equal(calls.length, 1, 'lost-response retry reuses completed turn');
  assert.equal(fixture.messages.filter(m=>m.role==='user').length, 5);
});

test('stale, expired, wrong-owner and changed-reference approvals cannot execute', () => {
  const source = { role: 'user', content: initial };
  const plan = resolveImageBrief({ messages: [], message: initial, identity, conversationId, key });
  const preview = { role: 'assistant', content: imageBriefPreview(plan, key) };
  assert.equal(resolveImageBrief({ messages: [source, preview], message: 'What does faceless mean?', identity, conversationId, key }), null);
  assert.equal(resolveImageBrief({ messages: [source, preview], message: 'create the image requested', identity, conversationId, key }).approved, true);
  for (const extra of [{ role: 'user', content: 'Change the headline to "A new approved headline".' }, { role: 'user', content: 'Use blue instead of pink.' }]) {
    const next = resolveImageBrief({ messages: [source, preview, extra], message: 'create the image requested', identity, conversationId, key });
    assert.equal(next.approved, false); assert.equal(next.needsPreview, true);
  }
  const other = resolveImageBrief({ messages: [source, preview], message: 'create the image requested', identity: { ...identity, accountId: 'other' }, conversationId, key });
  assert.equal(other.approved, false);
  assert.equal(resolveImageBrief({ messages: [source, { role: 'assistant', content: imageBriefPreview(plan, key, 0) }], message: 'confirm', identity, conversationId, key }).approved, false);
  assert.equal(resolveImageBrief({ messages: [source, preview], message: 'confirm', references: [{ attachmentId: 'another', url: 'https://media.test/reference' }], identity, conversationId, key }).approved, false);
  assert.match(resolveImageBrief({ messages: [], message: 'create the image requested', identity, conversationId, key }).clarification, /brief/);
});

test('stable reference identity survives signed URL refresh; changed project context requires review', () => {
  const context = { projectId: 'project-a', text: 'Approved palette: black and pink.' };
  const refs = [{ attachmentId: 'asset_ref', kind: 'image', url: 'https://media.test/ref?signature=old' }];
  const plan = resolveImageBrief({ messages: [], message: initial, identity, conversationId, key, references: refs, creativeContext: context });
  const history = [{ role: 'user', content: initial }, { role: 'assistant', content: imageBriefPreview(plan, key) }];
  const next = resolveImageBrief({ messages: history, message: 'confirm', identity, conversationId, key,
    references: [{ ...refs[0], url: 'https://media.test/ref?signature=new' }], creativeContext: context });
  assert.equal(next.approved, true);
  assert.equal(resolveImageBrief({ messages: history, message: 'confirm', identity, conversationId, key, references: refs, creativeContext: { ...context, text: 'New palette: blue.' } }).approved, false);
});

test('unauthenticated boundary never opens storage; stale turn IDs cannot return an older output', async () => {
  const denied = await persistedConversation(request('Create'), async () => { throw new Error('must not execute'); }, {
    authenticate: async () => ({ response: Response.json({ error: 'auth_required' }, { status: 401 }) }),
  });
  assert.equal(denied.status, 401);
  const fixture = storeFixture();
  const handle = async req => turnResult((await req.json()).message);
  await persistedConversation(request('Create', 'original-turn'), handle, fixture);
  await persistedConversation(request('New brief', 'changed-turn'), handle, fixture);
  const stale = await persistedConversation(request('Create', 'original-turn'), handle, fixture);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, 'stale_conversation_attempt');
});

test('legacy callers without turn IDs retry safely but cannot replay a result across changed briefs', async () => {
  const fixture = storeFixture(); let handled = 0;
  const legacy = text => { const req = request(text); req.headers.delete('x-mavensync-turn-id'); return req; };
  const handle = async req => { handled++; return turnResult((await req.json()).message); };
  await persistedConversation(legacy('Create'), handle, fixture);
  await persistedConversation(legacy('Create'), handle, fixture);
  assert.equal(handled, 1);
  await persistedConversation(legacy('New brief'), handle, fixture);
  await persistedConversation(legacy('Create'), handle, fixture);
  assert.equal(handled, 3);
});

test('server-owned history survives reload, retries, concurrent saves; forged browser replacement is refused', async () => {
  const fixture = storeFixture(); let handled = 0;
  const handle = async req => { handled++; return turnResult((await req.json()).message); };
  await persistedConversation(request('First direction', 'turn-first'), handle, fixture);
  await Promise.all([
    persistedConversation(request('faceless', 'turn-choice'), handle, fixture),
    persistedConversation(request('faceless', 'turn-choice'), handle, fixture),
  ]);
  assert.equal(handled, 2); assert.equal(fixture.messages.length, 4);
  assert.deepEqual(fixture.messages.filter(m=>m.role==='user').map(m=>m.content), ['First direction','faceless']);
  assert.equal(await acknowledgeConversationSave(conversationId, [{ role: 'user', content: 'forged' }, { role: 'assistant', content: 'approved' }], fixture.transport), false);
  assert.equal(await acknowledgeConversationSave(conversationId, [{ role: 'user', content: 'faceless' }, { role: 'assistant', content: 'A reviewed direction.' }], fixture.transport), true);
  const reloaded = await fixture.transport.read(conversationId);
  assert.equal(reloaded.filter(m=>m.role==='assistant').every(m=>stripTurnReceipt(m.content)==='A reviewed direction.'), true);
  await assert.rejects(persistedConversation(request('other', 'turn-foreign', 'foreign-session'), handle, fixture), /not_owned/);
  const conflict = await persistedConversation(request('changed', 'turn-choice'), handle, fixture);
  assert.equal(conflict.status, 409);
});

test('completed streaming turn is committed before done and replay does not submit again', async () => {
  const fixture = storeFixture(); let submissions = 0;
  const handle = async () => {
    submissions++;
    const result = turnResult('Create', 'Generated preview');
    return new Response(`data: ${JSON.stringify({ type: 'delta', text: result.reply })}\n\ndata: ${JSON.stringify({ type: 'done', ...result })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const first = await persistedConversation(request('Create', 'stream-turn', conversationId, true), handle, fixture);
  assert.match(await first.text(), /"type":"done"/); assert.equal(fixture.messages.length, 2);
  const replay = await persistedConversation(request('Create', 'stream-turn', conversationId, true), handle, fixture);
  assert.match(await replay.text(), /Generated preview/); assert.equal(submissions, 1);
});

test('unknown interrupted attempt is never automatically resubmitted after restart', async () => {
  const fixture = storeFixture(); let submissions = 0;
  await assert.rejects(persistedConversation(request('Create'), async () => { submissions++; throw new Error('lost after provider submission'); }, fixture));
  const result = await persistedConversation(request('Create'), async () => { submissions++; }, fixture);
  assert.equal(result.status, 409); assert.equal(submissions, 1);
});

test('distributed lock releases on all early returns and acquisition failure releases its connection', async () => {
  const calls = [], connection = { query: async sql => { calls.push(sql); return [[{ acquired: 1 }]]; }, release: () => calls.push('released') };
  const unlock = await acquireConversationLock(['owner','session'], { getConnection: async () => connection }); await unlock();
  assert.match(calls[1], /RELEASE_LOCK/); assert.equal(calls.at(-1), 'released');
  await assert.rejects(acquireConversationLock(['owner','session'], { getConnection: async () => ({ query: async () => [[{ acquired: 0 }]], release: () => calls.push('failure-released') }) }), /busy/);
  assert.equal(calls.at(-1), 'failure-released');
});

function storageFixture(bytes) {
  const uploads = [];
  return { uploads, args: { accountId: 'a', assetId: `asset_${'a'.repeat(64)}`, url: 'https://media.test/image.png', kind: 'image', allowlist: ['media.test'],
    lookup: async () => [{ address: '8.8.8.8', family: 4 }], fetchImpl: async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    storage: { getMetadata: async () => null, createDeliveryReference: async key => `storage://${key}`, putObject: async args => { let output = Buffer.alloc(0); for await (const chunk of args.body) output = Buffer.concat([output,chunk]); uploads.push({ ...args, bytes: output }); } } } };
}
test('actual decoded square/corrupt output is rejected; correctly shaped output exports exact pixels', async () => {
  const requirements = { aspectRatio: '2:3', width: 1000, height: 1500 };
  for (const bytes of [Buffer.from('not an image'), await sharp({ create: { width: 64, height: 64, channels: 3, background: '#111111' } }).png().toBuffer()]) {
    const fixture = storageFixture(bytes);
    await assert.rejects(copyProviderMedia({ ...fixture.args, imageRequirements: requirements }), { code: 'image_output_invalid' });
    assert.equal(fixture.uploads.length, 0);
  }
  const fixture = storageFixture(await sharp({ create: { width: 200, height: 300, channels: 3, background: '#111111' } }).png().toBuffer());
  const result = await copyProviderMedia({ ...fixture.args, imageRequirements: requirements });
  const decoded = await sharp(fixture.uploads[0].bytes).metadata();
  assert.equal(decoded.width, 1000); assert.equal(decoded.height, 1500);
  assert.equal(result.imageVerification.verified, true);
  assert.equal(result.imageVerification.semanticReview, 'pending_customer_review');
});

test('full brief ratio after character 1000 and trusted reference reach the unchanged provider route', async () => {
  let sent;
  const out = await generateMavenImage({ identity, prompt: 'Create a Pinterest graphic. '+ 'context '.repeat(160)+' product called AI Road Map. 2:3.',
    references: [{ attachmentId: 'asset_ref', url: 'https://media.test/ref.png' }], credentialResolver: async () => 'fixture-only',
    muapiProvider: { generateImage: async (_key,args) => { sent=args; return { url:'https://media.test/output.png', request_id:'prediction-1' }; } } });
  assert.equal(sent.aspect_ratio,'2:3'); assert.deepEqual(sent.images_list,['https://media.test/ref.png']);
  assert.equal(out.trace.providerPredictionId,'prediction-1');
});

test('a route without reference support never silently drops approved references', async () => {
  let submitted = false;
  await assert.rejects(generateMavenImage({ identity, prompt: 'Create a graphic', references: [{ attachmentId: 'asset_ref', url: 'https://media.test/ref.png' }],
    credentialResolver: async ({ providerId }) => providerId === 'fal' ? 'fixture-only' : null,
    provider: { execute: async () => { submitted = true; } },
  }), { code: 'image_reference_unsupported' });
  assert.equal(submitted, false);
});

test('asset metadata keeps request/attempt/brief/skill provenance; different requests do not collapse', async () => {
  const assets=[];
  const options={ repository:{ db:{}, saveOnConnection:async(_db,asset)=>{assets.push(asset);return asset;} }, copyMedia:async()=>({ storageReference:'storage://owned/image',contentType:'image/png',sizeBytes:20,checksum:'fixture',imageVerification:{verified:true,width:100,height:150} }) };
  for(const requestId of ['request-1','request-2']) await persistMavenChatAsset(identity,{conversationId,kind:'image',media:{url:'https://media.test/same.png',prompt:'resolved brief',imageRequirements:{aspectRatio:'2:3'},trace:{requestId,attemptId:`attempt-${requestId}`,providerPredictionId:'prediction-1',briefRevision:'revision-1'},creativeIntelligence:{skillReferences:[{skillId:'typography',version:'1.1.0'}]}}},options);
  assert.notEqual(assets[0].id,assets[1].id); assert.equal(assets[0].requestId,'request-1'); assert.equal(assets[0].metadata.creativeExecution.briefRevision,'revision-1');
  assert.equal(assets[0].metadata.imageVerification.verified,true);
});

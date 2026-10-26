import { createHash, randomUUID } from 'node:crypto';
import { requireCreatorIdentity } from './creatorOsAuth.js';
import { DesignAgentSessionOwnershipService } from './designAgentSessionOwnership.js';
import { getCreatorDatabasePool } from './creatorAccountStore.js';
import { getMuApiBaseUrl, getServerMuApiKey } from './agencyMode.js';

const MARKER = /<!-- maven-turn:([A-Za-z0-9_-]+) -->/g;
export const stripTurnReceipt = text => String(text || '').replace(MARKER, '').trim();
export function turnReceipt(message) {
  if (message?.role !== 'assistant') return null;
  try { return JSON.parse(Buffer.from([...String(message?.content || '').matchAll(MARKER)].at(-1)?.[1] || '', 'base64url').toString()); } catch { return null; }
}
function receiptMessage(receipt, content = '') {
  return { role: 'assistant', content: `${content}\n<!-- maven-turn:${Buffer.from(JSON.stringify(receipt)).toString('base64url')} -->`, timestamp: new Date().toISOString() };
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Reuse the current session's messages store. GET_LOCK serializes read/replace
// across processes; no browser history, new table, or memory store is involved.
export async function acquireConversationLock(scope, db = getCreatorDatabasePool()) {
  const connection = await db.getConnection();
  const name = `chat:${digest(scope).slice(0, 58)}`;
  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [name]);
    if (Number(rows[0]?.acquired) !== 1) throw new Error('conversation_busy');
    return async () => {
      try { await connection.query('SELECT RELEASE_LOCK(?)', [name]); connection.release(); }
      catch (error) { if (connection.destroy) connection.destroy(); else connection.release(); throw error; }
    };
  } catch (error) { connection.release(); throw error; }
}

export function sessionMessageTransport({ fetchImpl = globalThis.fetch, baseUrl = getMuApiBaseUrl(), key = getServerMuApiKey() } = {}) {
  const url = id => `${baseUrl.replace(/\/+$/, '')}/api/v1/creative-agent/sessions/${encodeURIComponent(id)}/messages`;
  async function call(id, method, messages) {
    if (!key) throw new Error('conversation_store_unavailable');
    const response = await fetchImpl(url(id), { method, headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      ...(messages ? { body: JSON.stringify({ messages }) } : {}), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('conversation_store_unavailable');
    if (method === 'GET') {
      const value = await response.json();
      if (!Array.isArray(value)) throw new Error('conversation_store_invalid');
      return value;
    }
  }
  return { read: id => call(id, 'GET'), write: (id, messages) => call(id, 'PATCH', messages) };
}

export async function persistedConversation(request, handle, {
  authenticate = requireCreatorIdentity, ownership = null,
  transport = sessionMessageTransport(), acquire = acquireConversationLock,
} = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  let payload;
  try { payload = await request.clone().json(); } catch { return Response.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!payload?.conversationId || typeof payload.message !== 'string' || !payload.message.trim()) return Response.json({ error: 'invalid_conversation_turn' }, { status: 400 });
  const { conversationId, message } = payload;
  const identity = auth.identity;
  const owned = await (ownership || new DesignAgentSessionOwnershipService()).verifyOwnedSession({ designSessionId: conversationId, identity });
  if (owned?.ok === false) return Response.json({ error: 'conversation_not_owned' }, { status: 403 });
  const scope = [String(identity.accountId), identity.identityKey || identity.creatorId, conversationId];
  const suppliedId = request.headers.get('x-mavensync-turn-id');
  if (suppliedId && !/^[A-Za-z0-9_-]{8,100}$/.test(suppliedId)) return Response.json({ error: 'invalid_turn_id' }, { status: 400 });
  let id = suppliedId;
  const fingerprint = digest([scope, message, payload.attachments || []]);
  const release = await acquire(scope);
  let released = false;
  let streaming = false;
  const unlock = async () => { if (!released) { released = true; await release(); } };
  try {
    const history = await transport.read(conversationId);
    if (!id) {
      const priorIndex = history.findLastIndex(m => turnReceipt(m)?.fingerprint === fingerprint);
      const laterUserTurn = priorIndex >= 0 && history.slice(priorIndex + 1).some(m => m.role === 'user');
      id = priorIndex >= 0 && !laterUserTurn ? turnReceipt(history[priorIndex]).id
        : digest([fingerprint, history.filter(m => m.role === 'user')]);
    }
    const previousIndex = history.findIndex(m => turnReceipt(m)?.id === id);
    if (previousIndex >= 0) {
      const previous = history[previousIndex], receipt = turnReceipt(previous);
      if (receipt.fingerprint !== fingerprint) return Response.json({ error: 'turn_id_conflict' }, { status: 409 });
      if (history.slice(previousIndex + 1).some(m => m.role === 'user')) return Response.json({ error: 'stale_conversation_attempt' }, { status: 409 });
      if (receipt.status !== 'completed') return Response.json({ error: 'turn_already_started', message: 'This attempt already started. Check its result before requesting a new attempt.' }, { status: 409 });
      const reply = stripTurnReceipt(previous.content);
      const persistedMessages = [history[previousIndex - 1], { ...previous, content: reply }].filter(Boolean);
      const value = { reply, role: 'assistant', status: 200, persistedMessages };
      if (!request.headers.get('accept')?.includes('text/event-stream')) return Response.json(value);
      return new Response(`data: ${JSON.stringify({ type: 'delta', text: reply })}\n\ndata: ${JSON.stringify({ type: 'done', ...value })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (turnReceipt(history.at(-1))?.status === 'started') return Response.json({ error: 'conversation_busy', message: 'The previous attempt is still unresolved. Check its status before starting another turn.' }, { status: 409 });
    const receipt = { id, fingerprint, status: 'started', requestId: id, attemptId: randomUUID() };
    // Durable before any provider submission. An interrupted/unknown attempt is
    // never submitted twice, even after restart or a lost browser response.
    await transport.write(conversationId, [...history, receiptMessage(receipt)]);
    // Do not occupy a database connection while awaiting a model. The durable
    // started receipt blocks overlapping turns; only short read/replace sections
    // hold the distributed lock.
    await unlock();
    const commit = async messages => {
      const end = await acquire(scope);
      try {
        const current = await transport.read(conversationId);
        const pending = turnReceipt(current.at(-1));
        if (pending?.id !== id || pending?.fingerprint !== fingerprint || pending?.status !== 'started') throw new Error('stale_conversation_attempt');
        await transport.write(conversationId, messages);
      } finally { await end(); }
    };
    const save = async turn => {
      if (!Array.isArray(turn) || turn.length !== 2 || turn[0]?.role !== 'user' || turn[1]?.role !== 'assistant') throw new Error('invalid_server_turn');
      await commit([...history, turn[0], { ...turn[1], content: receiptMessage({ ...receipt, status: 'completed' }, turn[1].content).content }]);
    };
    const fail = () => commit([...history, receiptMessage({ ...receipt, status: 'failed' })]);
    const result = await handle(request, { identity, turnIdentity: receipt,
      onPrediction: async predictionId => {
        if (typeof predictionId !== 'string' || !predictionId || predictionId.length > 200) throw new Error('invalid_prediction_identity');
        receipt.providerPredictionId = predictionId;
        await commit([...history, receiptMessage(receipt)]);
      },
    });
    if (!(result instanceof Response)) {
      if (result.persistedMessages) await save(result.persistedMessages);
      else await fail();
      await unlock();
      return Response.json(result, { status: result.status });
    }
    if (!result.headers.get('content-type')?.includes('text/event-stream')) { await fail(); await unlock(); return result; }
    // Preserve live deltas; commit the server-owned turn before forwarding done.
    const reader = result.body.getReader(), decoder = new TextDecoder(), encoder = new TextEncoder();
    let pending = '', completed = false;
    streaming = true;
    const stream = new ReadableStream({ async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value || new Uint8Array(), { stream: !done });
          let end;
          while ((end = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, end); pending = pending.slice(end + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '));
            if (data) { const event = JSON.parse(data.slice(6)); if (event.type === 'done') { await save(event.persistedMessages); completed = true; } }
            controller.enqueue(encoder.encode(frame + '\n\n'));
          }
          if (done) break;
        }
        if (!completed) await fail();
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', code: 'conversation_save_failed', error: 'This turn could not be safely saved. Do not repeat generation; check the existing attempt first.' })}\n\n`));
      } finally { await unlock(); controller.close(); }
    } });
    return new Response(stream, { status: result.status, headers: result.headers });
  } catch (error) { await unlock(); throw error; }
  finally { if (!streaming) await unlock(); }
}

// Old browser clients may PATCH their last sanitized pair after done. Acknowledge
// only an already committed turn; never let a browser replace canonical history.
export async function acknowledgeConversationSave(id, incoming, transport = sessionMessageTransport()) {
  if (!Array.isArray(incoming) || !incoming.length) return false;
  const history = await transport.read(id);
  return history.some((_, index) => incoming.every((message, offset) => {
    const saved = history[index + offset];
    return saved?.role === message.role && stripTurnReceipt(saved.content) === stripTurnReceipt(message.content)
      && JSON.stringify(saved.attachments || []) === JSON.stringify(message.attachments || []);
  }));
}

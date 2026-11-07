import { getCreatorDatabasePool } from './creatorAccountStore.js';

const headers = { 'Cache-Control': 'no-store' };
const maxBatch = 50;

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 191 && id.trim() === id;
}

function validDraft(draft) {
  return draft && typeof draft === 'object' && !Array.isArray(draft) && validId(draft.id);
}

function failure(message, status) {
  return Response.json({ error: message }, { status, headers });
}

export async function handlePublishingDrafts(request, { identity, pool } = {}) {
  const accountId = String(identity?.accountId || '');
  if (!accountId) return failure('Sign in to access Publishing drafts.', 401);
  try {
    const db = pool || getCreatorDatabasePool();
    if (request.method === 'GET') {
      const [rows] = await db.execute(
        'SELECT draft_json, revision FROM publishing_drafts WHERE account_id = ? AND draft_json IS NOT NULL',
        [accountId],
      );
      const drafts = rows.map(({ draft_json, revision }) => ({
        draft: typeof draft_json === 'string' ? JSON.parse(draft_json) : draft_json,
        revision,
      }));
      return Response.json({ accountId, drafts }, { headers });
    }

    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
      return failure('Expected a JSON draft request.', 415);
    }
    const body = await request.json().catch(() => null);
    if (!body) return failure('Invalid draft request.', 400);
    if (body.accountId !== accountId) return failure('Your signed-in account changed. Reload Publishing.', 409);

    const inserts = request.method === 'POST';
    const entries = inserts ? body.drafts : body.changes;
    if (!Array.isArray(entries) || !entries.length || entries.length > maxBatch
      || (inserts ? !entries.every(validDraft) : !entries.every(entry => validChange(entry, request.method)))) {
      return failure('Invalid draft records.', 400);
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const results = [];
      for (const entry of entries) {
        if (inserts || entry.revision === null) {
          const draft = inserts ? entry : entry.draft;
          try {
            await connection.execute(
              'INSERT INTO publishing_drafts (account_id, draft_id, draft_json) VALUES (?, ?, ?)',
              [accountId, draft.id, JSON.stringify(draft)],
            );
            results.push({ id: draft.id, revision: 1 });
          } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') throw error;
            if (!inserts) {
              await connection.rollback();
              return failure('This draft changed elsewhere. Reload Publishing and review the latest draft.', 409);
            }
            results.push({ id: draft.id, skipped: true });
          }
        } else {
          // Keep the key after deletion so an old browser or MCP sync cannot resurrect the draft.
          const payload = entry.draft === null ? null : JSON.stringify(entry.draft);
          const [result] = await connection.execute(
            'UPDATE publishing_drafts SET draft_json = ?, revision = revision + 1 WHERE account_id = ? AND draft_id = ? AND revision = ? AND draft_json IS NOT NULL',
            [payload, accountId, entry.id, entry.revision],
          );
          if (result.affectedRows !== 1) {
            await connection.rollback();
            return failure('This draft changed elsewhere or is unavailable. Reload Publishing and review the latest draft.', 409);
          }
          results.push({ id: entry.id, revision: entry.revision + 1 });
        }
      }
      await connection.commit();
      return Response.json({ results }, { headers });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch {
    return failure('Publishing draft storage is temporarily unavailable.', 503);
  }
}

function validChange(entry, method) {
  if (!entry || !validId(entry.id)) return false;
  const versioned = Number.isSafeInteger(entry.revision) && entry.revision >= 1;
  if (entry.draft === null) return versioned;
  return method === 'PATCH' && (entry.revision === null || versioned)
    && validDraft(entry.draft) && entry.draft.id === entry.id;
}

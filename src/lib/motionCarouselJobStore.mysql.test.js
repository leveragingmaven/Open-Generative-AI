// MySQL store — the paths the in-memory store cannot cover.
//
// These tests drive `MySqlMotionCarouselJobStore` through an injected pool stand-in
// that records the SQL and parameters, so the two defects a real database exposed —
// an ISO-8601 string bound to a TIMESTAMP column, and a tautological staleness
// predicate that failed every interrupted render — cannot come back unnoticed.
import assert from "node:assert/strict";
import test from "node:test";

import { MySqlMotionCarouselJobStore, createMotionCarouselJobRecord } from "./motionCarouselJobStore.js";

const ISO = "2026-10-14T18:21:21.248Z";
const DECK = { look: "solid", colors: "pop", slides: [{ kicker: "A", headline: "A valid headline here", visual: { type: "cta", action: "follow" } }] };
const ISO_PARAM = /^\d{4}-\d\d-\d\d[ T]/;

/** A pool stand-in: records every statement and answers with plausible rows. */
function recordingDb({ affectedRows = 1 } = {}) {
  const calls = [];
  const db = {
    calls,
    async query(sql, params = []) {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (/SELECT job_id FROM motion_carousel_jobs/.test(text)) return [[{ job_id: "mcar-1" }]];
      if (/SELECT/.test(text)) return [[]];
      if (/status = CASE/.test(text)) return [{ affectedRows: 0 }]; // the fail branch
      return [{ affectedRows }];
    },
  };
  return db;
}

function storeWith(db) {
  return new MySqlMotionCarouselJobStore({ db });
}

/** Every statement that wrote, so a single assertion can cover all of them. */
function writes(db) {
  return db.calls.filter((call) => /INSERT|UPDATE/.test(call.sql));
}

test("create binds Dates, never the ISO strings the job service builds", async () => {
  const db = recordingDb();
  const record = createMotionCarouselJobRecord({ accountId: "1", creatorIdentityKey: "creator-1", deck: DECK, now: ISO });
  await storeWith(db).create(record);
  const insert = db.calls.find((call) => /INSERT INTO motion_carousel_jobs/.test(call.sql));
  assert.ok(insert, "an INSERT was issued");
  assert.deepEqual(insert.params.filter((value) => typeof value === "string" && ISO_PARAM.test(value)), []);
  assert.equal(insert.params[17].toISOString(), ISO);
  assert.equal(insert.params[18].toISOString(), ISO);
});

test("every write binds Dates for its TIMESTAMP columns", async () => {
  const invocations = {
    claimNext: (store) => store.claimNext({ now: ISO, leaseMs: 60000 }),
    heartbeat: (store) => store.heartbeat("mcar-1", { phase: "rendering", progress: 40, leaseMs: 60000, now: ISO }),
    complete: (store) => store.complete("mcar-1", { result: { files: [] }, fingerprints: ["h"], now: ISO }),
    fail: (store) => store.fail("mcar-1", { error: { code: "x", message: "y" }, now: ISO }),
    requestCancel: (store) => store.requestCancel("mcar-1", { accountId: "1", now: ISO }),
    requeue: (store) => store.requeue("mcar-1", { accountId: "1", now: ISO }),
    markCanceled: (store) => store.markCanceled("mcar-1", { accountId: "1", now: ISO }),
    reclaimStale: (store) => store.reclaimStale({ now: ISO }),
  };

  for (const [name, invoke] of Object.entries(invocations)) {
    const db = recordingDb();
    await invoke(storeWith(db));
    const written = writes(db);
    assert.ok(written.length, `${name} issued at least one write`);
    for (const call of written) {
      const offenders = call.params.filter((value) => typeof value === "string" && ISO_PARAM.test(value));
      assert.deepEqual(offenders, [], `${name} bound an ISO-8601 string to a timestamp column`);
    }
    const boundInstants = written.flatMap((call) => call.params).filter((value) => value instanceof Date);
    assert.ok(boundInstants.length, `${name} bound at least one Date`);
    assert.ok(
      boundInstants.every((date) => date.toISOString() === ISO),
      `${name} preserved the requested instant`,
    );
  }
});

test("a stale render is failed only when it used its own attempt budget", async () => {
  const db = recordingDb();
  await storeWith(db).reclaimStale();

  const [failQuery, reclaimQuery] = db.calls;
  assert.match(failQuery.sql, /attempt_count >= max_attempts/);
  assert.doesNotMatch(failQuery.sql, /attempt_count\s*>=\s*attempt_count/);
  assert.match(failQuery.sql, /cancel_requested = 1 THEN 'canceled'/);
  assert.match(reclaimQuery.sql, /status = 'queued'/);
  assert.equal(failQuery.params.length, 3, "finished_at, updated_at and the lease cutoff");
});

test("an explicit attempt limit is bound as a parameter instead of the row's own", async () => {
  const db = recordingDb();
  await storeWith(db).reclaimStale({ maxAttempts: 2 });
  assert.match(db.calls[0].sql, /attempt_count >= \?/);
  assert.equal(db.calls[0].params.at(-1), 2);
});

test("reclaimStale reports what it reclaimed and failed", async () => {
  const db = recordingDb();
  db.query = async (sql, params = []) => {
    const text = String(sql);
    db.calls.push({ sql: text, params });
    if (/status = CASE/.test(text)) return [{ affectedRows: 0 }];
    if (/SET status = 'queued'/.test(text)) return [{ affectedRows: 1 }];
    return [[]];
  };
  const result = await storeWith(db).reclaimStale();
  assert.deepEqual(result, { reclaimed: 1, failed: 0 });
});

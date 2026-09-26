// CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC — stage tracing proof.
//
// Two obligations:
//   1. Every stage between claiming a job and invoking the provider is
//      distinguishable from the emitted marker, so ONE production run
//      identifies exactly which stage failed before MuAPI was called.
//   2. The emitted line can never carry a secret. This is enforced
//      structurally: the emitter accepts only a stage from a closed list and an
//      error code that must match a restrictive charset, and it never receives
//      the account, identity, job, credential, or provider payload at all.

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC,
  PROVIDER_EXECUTION_STAGES,
  classifyProviderExecutionFailure,
  emitProviderExecutionDiagnostic,
  safeProviderExecutionCode,
  withProviderExecutionStage,
} from './creativeProviderExecutionDiagnostic.js';
import { decryptProviderCredential } from './providerCredentialEncryption.js';

let lines = [];
const originalLog = console.log;

afterEach(() => {
  console.log = originalLog;
  lines = [];
});

function capture() {
  lines = [];
  console.log = (value) => { lines.push(String(value)); };
  return {
    get lines() { return lines; },
    get records() {
      return lines
        .filter((line) => line.startsWith(CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC))
        .map((line) => JSON.parse(line.slice(CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC.length).trim()));
    },
  };
}

const SECRET_LIKE = [
  'sk-live-DO-NOT-LOG-THIS',
  'Bearer eyJhbGciOiJIUzI1NiJ9.super.secret.token',
  'customer@example.com',
  'MavenSync Spaces',
  'ai-gency:9f86d081884c7d659a2feaa0c55ad015',
];

describe('stage tracing distinguishes every pre-provider stage', () => {
  it('covers each required stage in the closed vocabulary', () => {
    for (const stage of ['materialization', 'funding', 'credential_resolve', 'provider_start', 'provider_invoke', 'asset_persistence']) {
      assert.ok(PROVIDER_EXECUTION_STAGES.includes(stage), `missing stage ${stage}`);
    }
  });

  it('reports success for each stage in order', async () => {
    const cap = capture();
    await withProviderExecutionStage('materialization', () => 'ok');
    await withProviderExecutionStage('funding', () => 'ok');
    await withProviderExecutionStage('credential_resolve', () => 'ok');
    emitProviderExecutionDiagnostic({ stage: 'provider_start' });
    await withProviderExecutionStage('provider_invoke', () => 'ok');
    assert.deepEqual(cap.records.map((r) => [r.stage, r.outcome]), [
      ['materialization', 'ok'],
      ['funding', 'ok'],
      ['credential_resolve', 'ok'],
      ['provider_start', 'ok'],
      ['provider_invoke', 'ok'],
    ]);
  });

  it('identifies the exact failing stage and rethrows the original error', async () => {
    for (const stage of ['materialization', 'funding', 'credential_resolve', 'provider_invoke', 'asset_persistence']) {
      const cap = capture();
      const failure = Object.assign(new Error('boom'), { code: 'provider_execution_failed' });
      await assert.rejects(
        () => withProviderExecutionStage(stage, () => { throw failure; }),
        (error) => error === failure,
      );
      const record = cap.records.at(-1);
      assert.equal(record.stage, stage);
      assert.equal(record.outcome, 'error');
    }
  });

  it('separates credential lookup from credential decryption', () => {
    // This is the distinction the whole patch exists to make, and it is only
    // reliable because decryptProviderCredential now carries a .code.
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'provider_credential_required:muapi'), 'credential_lookup');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'provider_credential_unavailable:muapi'), 'credential_lookup');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'credential_identity_required'), 'credential_lookup');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'provider_credential_ciphertext_invalid'), 'credential_decryption');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'provider_credential_decryption_failed'), 'credential_decryption');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'credential_encryption_key_missing'), 'credential_decryption');
  });

  it('classifies the remaining pre-provider failure modes', () => {
    assert.equal(classifyProviderExecutionFailure('materialization', 'execution_prompt_required'), 'prompt_materialization');
    assert.equal(classifyProviderExecutionFailure('funding', 'cost_authorization_required'), 'cost_authorization');
    assert.equal(classifyProviderExecutionFailure('funding', 'insufficient_credits'), 'cost_authorization');
    assert.equal(classifyProviderExecutionFailure('provider_invoke', 'provider_execution_timeout'), 'provider_timeout');
    assert.equal(classifyProviderExecutionFailure('provider_invoke', 'provider_recovery_required'), 'provider_recovery');
    assert.equal(classifyProviderExecutionFailure('asset_persistence', 'asset_materialization_failed'), 'asset_persistence');
    assert.equal(classifyProviderExecutionFailure('provider_invoke', 'provider_execution_failed'), 'known_failure');
    assert.equal(classifyProviderExecutionFailure('credential_resolve', 'something_unrecognised'), 'unknown');
  });

  it('returns the stage value unchanged so instrumentation cannot alter it', async () => {
    const cap = capture();
    const sentinel = { deep: { value: 'untouched' } };
    const returned = await withProviderExecutionStage('funding', () => sentinel);
    assert.equal(returned, sentinel);
    assert.deepEqual(returned, { deep: { value: 'untouched' } });
    assert.equal(cap.records.at(-1).outcome, 'ok');
  });
});

describe('the marker cannot leak a secret', () => {
  it('emits only stage, outcome, code and class', () => {
    const cap = capture();
    emitProviderExecutionDiagnostic({ stage: 'credential_resolve', outcome: 'error', error: Object.assign(new Error('x'), { code: 'provider_credential_required:muapi' }) });
    assert.deepEqual(Object.keys(cap.records[0]).sort(), ['class', 'code', 'outcome', 'stage']);
  });

  it('collapses an uncoded, message-bearing, or exotic error to a fixed literal', () => {
    for (const error of [
      new Error('plain message with a secret sk-live-LEAK'),
      { message: 'sk-live-LEAK', code: 'has spaces and a secret sk-live-LEAK' },
      { code: 'mysql://user:hunter2@db.internal:3306/creator' },
      { code: 'json {"apiKey":"sk-live-LEAK"}' },
      { code: 'a'.repeat(200) },
      { code: 'has/slash' },
      { code: 'has@at' },
      { code: 42 },
      null,
      undefined,
    ]) {
      assert.equal(safeProviderExecutionCode(error), 'uncoded', JSON.stringify(error));
    }
  });

  it('never emits a secret even when the error object carries one', () => {
    const cap = capture();
    const hostile = {
      code: 'provider_credential_ciphertext_invalid',
      message: `decrypt failed for sk-live-DO-NOT-LOG-THIS customer@example.com`,
      apiKey: 'sk-live-DO-NOT-LOG-THIS',
      accountId: 'acct-12345',
      jobId: 'job-abc',
      url: 'https://user:pass@cdn.example/out.png',
    };
    emitProviderExecutionDiagnostic({ stage: 'credential_resolve', outcome: 'error', error: hostile });
    const emitted = cap.records[0];
    assert.equal(emitted.code, 'provider_credential_ciphertext_invalid');
    const text = cap.lines.join('\n');
    for (const secret of SECRET_LIKE) assert.ok(!text.includes(secret), `leaked ${secret}`);
    assert.ok(!text.includes('acct-12345'));
    assert.ok(!text.includes('job-abc'));
    assert.ok(!text.includes('https'));
    assert.ok(!/@/.test(text));
  });

  it('never emits anything outside the marker prefix', () => {
    const cap = capture();
    emitProviderExecutionDiagnostic({ stage: 'provider_start' });
    assert.equal(cap.lines.length, 1);
    assert.ok(cap.lines[0].startsWith(`${CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC} {`));
  });

  it('rejects an unrecognised stage rather than echoing it', () => {
    const cap = capture();
    emitProviderExecutionDiagnostic({ stage: 'sk-live-LEAK customer@example.com', outcome: 'error', error: {} });
    assert.equal(cap.records[0].stage, 'unknown');
    assert.ok(!cap.lines.join('\n').includes('LEAK'));
  });

  it('swallows a hostile logging sink without affecting execution', async () => {
    console.log = () => { throw new Error('log sink exploded'); };
    // Neither the stage wrapper nor the bare emitter may propagate a logging
    // failure, and the stage value must still be returned intact.
    const returned = await withProviderExecutionStage('funding', () => 'value-ok');
    assert.equal(returned, 'value-ok');
    const hostile = Object.assign(new Error('x'), { code: 'insufficient_credits' });
    assert.doesNotThrow(() => emitProviderExecutionDiagnostic({ stage: 'funding', outcome: 'error', error: hostile }));
    console.log = originalLog;
  });

  it('a failing stage still rejects with the original error when logging throws', async () => {
    console.log = () => { throw new Error('log sink exploded'); };
    const failure = Object.assign(new Error('boom'), { code: 'insufficient_credits' });
    await assert.rejects(
      () => withProviderExecutionStage('funding', () => { throw failure; }),
      (error) => error === failure,
    );
    console.log = originalLog;
  });
});

describe('decryptProviderCredential now carries a code', () => {
  it('attaches provider_credential_ciphertext_invalid instead of a bare Error', () => {
    for (const record of [null, {}, { value: '', version: 'v1' }, { value: 'x', version: 'WRONG' }, { value: 'not json', version: 'v1' }]) {
      let thrown;
      try { decryptProviderCredential(record); } catch (error) { thrown = error; }
      assert.ok(thrown, `expected a throw for ${JSON.stringify(record)}`);
      assert.equal(thrown.code, 'provider_credential_ciphertext_invalid');
      assert.equal(thrown.message, 'provider_credential_ciphertext_invalid');
    }
  });

  it('leaves the message and the throw condition unchanged', () => {
    // The message string is byte-identical to the pre-patch bare throw, and the
    // same inputs still throw. Only `.code` is new.
    let thrown;
    try { decryptProviderCredential({ value: 'x', version: 'nope' }); } catch (error) { thrown = error; }
    assert.equal(thrown.message, 'provider_credential_ciphertext_invalid');
    assert.ok(thrown instanceof Error);
  });
});

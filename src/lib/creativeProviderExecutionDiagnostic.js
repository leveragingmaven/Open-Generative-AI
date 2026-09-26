/**
 * CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC — privacy-safe stage tracing for the
 * window between a creative job being claimed and the provider being invoked.
 *
 * OBSERVATION ONLY. Every emitter here returns void, never throws, and is
 * wrapped so it cannot affect execution. It exists because a job that fails
 * before the provider is called is persisted with a generic
 * `provider_execution_failed` code and logged nowhere, so the failing stage is
 * unobservable in production.
 *
 * PRIVACY. Only three kinds of value are ever emitted:
 *   - `stage`, from a closed fixed vocabulary;
 *   - `outcome`, from a closed two-value vocabulary;
 *   - `code`, admitted only if it matches ^[A-Za-z0-9_.:-]{1,64}$, so it can
 *     never contain an address, a path, a query, a JSON body, or whitespace.
 *   - `class`, from a closed fixed vocabulary.
 *
 * Credential values, ciphertext, encryption keys, prompts, customer identity or
 * email, account ids, job ids, provider job ids, attempt ids, URLs, request
 * bodies, headers, and tokens are NEVER passed in and are never derivable from
 * what is emitted. The account/identity/job context a stage runs under is
 * deliberately not a parameter of this module.
 */

export const CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC = 'CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC';

/** Closed stage vocabulary. Adding a value here is the only way to add a stage. */
export const PROVIDER_EXECUTION_STAGES = Object.freeze([
  'materialization',
  'funding',
  'credential_resolve',
  'provider_start',
  'provider_invoke',
  'asset_persistence',
]);

const STAGE_SET = new Set(PROVIDER_EXECUTION_STAGES);

/** Closed classification vocabulary for a failure. */
const CLASS_BY_STAGE = Object.freeze({
  materialization: ['execution_prompt_required'],
  funding: ['cost_authorization_required', 'allowance_cost_unknown', 'insufficient_credits', 'allowance_approval_required'],
  credential_resolve: [
    'credential_identity_required',
    'provider_required',
    'unsupported_provider_credential',
    'provider_credential_required',
    'provider_credential_unavailable',
    'provider_credential_ciphertext_invalid',
    'provider_credential_decryption_failed',
    'credential_encryption_key_missing',
  ],
  provider_invoke: ['provider_execution_timeout', 'provider_recovery_required', 'provider_execution_failed'],
  asset_persistence: ['asset_materialization_failed', 'asset_lineage_required', 'provider_output_required', 'invalid_provider_output_reference'],
});

/** Distinguishes the two credential sub-stages the caller cannot see separately. */
const CLASS_RULES = Object.freeze([
  ['credential_lookup', ['credential_identity_required', 'provider_required', 'unsupported_provider_credential', 'provider_credential_required', 'provider_credential_unavailable']],
  ['credential_decryption', ['provider_credential_ciphertext_invalid', 'provider_credential_decryption_failed', 'credential_encryption_key_missing']],
  ['provider_timeout', ['provider_execution_timeout']],
  ['provider_recovery', ['provider_recovery_required']],
  ['asset_persistence', ['asset_materialization_failed', 'asset_lineage_required', 'provider_output_required', 'invalid_provider_output_reference']],
  ['cost_authorization', ['cost_authorization_required', 'allowance_cost_unknown', 'insufficient_credits', 'allowance_approval_required']],
  ['prompt_materialization', ['execution_prompt_required']],
]);

const CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Admits an error code only when it is short and drawn from a charset that
 * cannot carry an address, path, query string, or body. Anything else — an
 * absent code, a driver message, an object — collapses to a fixed literal.
 */
export function safeProviderExecutionCode(error) {
  const code = error && typeof error === 'object' ? error.code : undefined;
  return typeof code === 'string' && CODE_PATTERN.test(code) ? code : 'uncoded';
}

/** Resolves a coarse, closed classification for a failure at a given stage. */
export function classifyProviderExecutionFailure(stage, code) {
  if (!STAGE_SET.has(stage)) return 'unknown';
  // The specific rules are consulted FIRST so a code that has a precise
  // meaning (credential_lookup vs credential_decryption, for example) is never
  // flattened to the generic `known_failure` by the stage's own allow-list.
  for (const [classification, codes] of CLASS_RULES) {
    if (codes.some((entry) => code === entry || code.startsWith(`${entry}:`))) return classification;
  }
  const known = CLASS_BY_STAGE[stage] || [];
  if (known.includes(code)) return 'known_failure';
  return 'unknown';
}

function safeStage(stage) {
  return STAGE_SET.has(stage) ? stage : 'unknown';
}

/** Emits exactly one line. Never throws, and never emits anything unvetted. */
export function emitProviderExecutionDiagnostic({ stage, outcome = 'ok', error } = {}) {
  try {
    const safe = safeStage(stage);
    const record = { stage: safe, outcome: outcome === 'error' ? 'error' : 'ok' };
    if (outcome === 'error') {
      const code = safeProviderExecutionCode(error);
      record.code = code;
      record.class = classifyProviderExecutionFailure(safe, code);
    }
    console.log(`${CREATIVE_PROVIDER_EXECUTION_DIAGNOSTIC} ${JSON.stringify(record)}`);
  } catch {
    // Diagnostics must never interfere with execution.
  }
}

/**
 * Runs one stage, emitting its outcome, then RETHROWS the ORIGINAL error so
 * existing control flow, error classification, and persistence are unchanged.
 */
export async function withProviderExecutionStage(stage, run) {
  try {
    const value = await run();
    emitProviderExecutionDiagnostic({ stage, outcome: 'ok' });
    return value;
  } catch (error) {
    emitProviderExecutionDiagnostic({ stage, outcome: 'error', error });
    throw error;
  }
}

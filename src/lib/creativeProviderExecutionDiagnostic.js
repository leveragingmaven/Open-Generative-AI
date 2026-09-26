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
 * Closed cause classification. A transport failure reaches this module as a
 * `TypeError: fetch failed` whose actionable detail lives on `error.cause.code`
 * (ENOTFOUND, ECONNREFUSED, ...) rather than on the error itself, so
 * `normalizeProviderError` collapses every one of them to the single
 * `provider_execution_failed` code. This table restores the distinction.
 *
 * The emitted value is ALWAYS one of this module's own literals. An input code
 * is matched by exact equality or by a fixed family prefix and is then
 * DISCARDED — the caller's string is never emitted, only the bucket it fell
 * into. A hostile `cause.code` therefore cannot appear in the log, and neither
 * can a hostname, address, or message, because neither is ever read.
 */
const CAUSE_BY_EXACT_CODE = new Map([
  ['ENOTFOUND', 'dns_not_found'],
  ['EAI_AGAIN', 'dns_temporary_failure'],
  ['ECONNREFUSED', 'connection_refused'],
  ['ECONNRESET', 'connection_reset'],
  ['ETIMEDOUT', 'connection_timeout'],
  ['EPIPE', 'connection_broken_pipe'],
  ['EHOSTUNREACH', 'host_unreachable'],
  ['ENETUNREACH', 'network_unreachable'],
  ['EACCES', 'permission_denied'],
  ['EPROTO', 'protocol_error'],
  ['ENOTCAPABLE', 'protocol_error'],
  ['UND_ERR_CONNECT_TIMEOUT', 'undici_timeout'],
  ['UND_ERR_HEADERS_TIMEOUT', 'undici_timeout'],
  ['UND_ERR_BODY_TIMEOUT', 'undici_timeout'],
  ['UND_ERR_SOCKET', 'undici_socket'],
]);

/**
 * Certificate indicators are checked before the family prefixes, so a
 * certificate-specific TLS failure (ERR_TLS_CERT_ALTNAME_INVALID) is reported
 * as a certificate problem rather than the generic TLS bucket. Only the
 * indicator is inspected; the matched code itself is never emitted.
 */
const CERTIFICATE_INDICATORS = Object.freeze(['CERT', 'CERTIFICATE']);

/** Fixed family prefixes. The remainder of the code is never emitted. */
const CAUSE_FAMILY_PREFIXES = Object.freeze([
  ['UND_ERR_', 'undici_error'],
  ['ERR_TLS_', 'tls_error'],
  ['ERR_SSL_', 'ssl_error'],
  ['DEPTH_ZERO_', 'tls_certificate'],
  ['SELF_SIGNED_', 'tls_certificate'],
  ['UNABLE_TO_VERIFY_', 'tls_certificate'],
]);

/** Bounded cause-chain depth; Node nests errors a few levels for transport faults. */
const CAUSE_CHAIN_DEPTH = 4;

/**
 * Classifies an error's transport cause into a fixed bucket, or 'unknown'.
 * Only `.code` is read. Messages, hostnames, addresses, and every other
 * property of the cause are ignored entirely.
 */
export function classifyProviderExecutionCause(error) {
  let current = error;
  for (let depth = 0; current && depth < CAUSE_CHAIN_DEPTH; depth += 1) {
    const code = current.code;
    if (typeof code === 'string' && code.length <= 64) {
      const exact = CAUSE_BY_EXACT_CODE.get(code);
      if (exact !== undefined) return exact;
      if (CERTIFICATE_INDICATORS.some((indicator) => code.includes(indicator))) return 'tls_certificate';
      for (const [prefix, classification] of CAUSE_FAMILY_PREFIXES) {
        if (code.startsWith(prefix)) return classification;
      }
    }
    current = current.cause;
  }
  return 'unknown';
}

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
      // A transport fault carries no useful top-level code, so the cause is
      // classified separately. Fixed buckets only; the cause's own string is
      // never emitted.
      record.cause = classifyProviderExecutionCause(error);
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

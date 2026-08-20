"use client";

export default function AgentExecutionCard({ state, onCreate, onApprove, approvalPending = false, executionPending = false }) {
  if (!state) return null;
  const plan = state.review || {};
  const requiredInputs = state.requiredInputs || [];
  const approvals = state.approvalRequirements || [];
  const title = state.status === 'starting'
    ? 'Preparing your creative work'
    : state.status === 'running'
      ? 'Creating your content…'
      : state.status === 'completed'
        ? 'Your content is ready'
        : state.status === 'failed'
          ? 'We couldn’t create this one'
      : state.status === 'recovery_required'
            ? 'Your creation needs recovery'
        : state.status === 'ambiguous'
          ? 'One detail is needed'
          : state.status === 'unsupported'
            ? 'This creative request is not supported yet'
    : state.status === 'error'
      ? 'Creative work could not be prepared'
      : state.status === 'requires_input'
        ? 'One more decision is needed'
        : state.status === 'requires_approval'
          ? 'Review your creative plan'
          : 'Creative work is ready';
  const description = state.status === 'starting'
    ? 'The agent is organizing the request and preparing a plan.'
    : state.status === 'running'
      ? 'Creation is in progress.'
      : state.status === 'completed'
        ? 'Your generated content is ready.'
        : state.status === 'failed'
          ? 'The provider couldn’t complete this creation.'
      : state.status === 'recovery_required'
            ? 'The provider accepted the work and it needs recovery before the result can be finalized.'
        : state.status === 'ambiguous'
          ? state.clarificationNeeded || 'What would you like Creator OS to make?'
          : state.status === 'unsupported'
            ? state.message || "This type of creative work isn't supported by the execution system yet."
    : state.status === 'error'
      ? state.message || 'Please try again.'
      : state.status === 'requires_input'
        ? 'The plan is prepared as far as possible and needs more information before creation.'
        : state.status === 'requires_approval'
          ? 'Review the prepared direction before creation begins.'
          : 'Your creative plan is prepared. Creation has not started.';

  return (
    <section className="mx-auto mt-4 max-w-3xl rounded-2xl border border-[var(--border-color)] bg-[var(--component-bg)] p-4 shadow-xl" aria-label="Creative work status">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Creative work</p>
      <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      {state.userIntent && (state.status === 'ambiguous' || state.status === 'unsupported') && (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">Interpreted request: {state.userIntent}</p>
      )}
      {requiredInputs.length > 0 && (
        <div className="mt-3 text-sm text-[var(--text-primary)]">
          <p className="font-medium">Still needed</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--text-secondary)]">
            {requiredInputs.map((item, index) => <li key={index}>{item.name || item.label || String(item)}</li>)}
          </ul>
        </div>
      )}
      {approvals.length > 0 && (
        <div className="mt-3 text-sm text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Review items:</span> {approvals.join(', ')}
        </div>
      )}
      {plan.recipe?.id && <p className="mt-3 text-xs text-[var(--text-secondary)]">Format: {plan.recipe.id}</p>}
      {plan.assumptions?.length > 0 && <p className="mt-2 text-xs text-[var(--text-secondary)]">{plan.assumptions.join(' ')}</p>}
      {plan.warnings?.length > 0 && <p className="mt-2 text-xs text-amber-400">{plan.warnings.join(' ')}</p>}
      {state.approvalError && <p role="alert" className="mt-3 text-sm text-rose-400">{state.approvalError}</p>}
      {state.status === 'requires_approval' && (
        <button
          type="button"
          disabled={!state.jobId || !state.planId || approvalPending}
          onClick={onApprove}
          className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {approvalPending ? 'Approving…' : 'Approve Plan'}
        </button>
      )}
      {state.status === 'ready' && (
        <button type="button" disabled={!onCreate || !state.jobId || executionPending} onClick={onCreate} className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-text)] disabled:cursor-not-allowed disabled:opacity-60">
          {executionPending ? 'Creating…' : 'Create'}
        </button>
      )}
      {state.outputReferences?.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {state.outputReferences.map((reference, index) => (
            typeof reference === 'string' && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(reference)
              ? <img key={index} src={reference} alt="Generated content" className="max-h-64 w-full rounded-xl object-contain" />
              : <a key={index} href={reference} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline">Open generated content</a>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from 'react';

const OPERATION_LABELS = {
  video_generation: 'Video generation',
  image_generation: 'Image generation',
};

export default function ReviewClient({ reference }) {
  const [request, setRequest] = useState(null);
  const [state, setState] = useState({ status: 'loading', message: '' });
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    setState({ status: 'loading', message: '' });
    try {
      const response = await fetch(`/api/creator-execution/handoffs/${encodeURIComponent(reference)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || 'Unable to load this request.'), { code: body.code });
      setRequest(body.request);
      setState({ status: 'ready', message: '' });
    } catch (error) {
      setState({ status: 'error', message: error.message || 'Unable to load this request.' });
    }
  }, [reference]);

  useEffect(() => { load(); }, [load]);

  async function decide(decision) {
    setState({ status: 'submitting', message: '' });
    try {
      const response = await fetch(`/api/creator-execution/handoffs/${encodeURIComponent(reference)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(body.error || 'Unable to complete this request.'), { code: body.code });
      setResult(body);
      setState({ status: decision === 'decline' ? 'declined' : 'approved', message: '' });
    } catch (error) {
      setState({ status: 'error', message: error.message || 'Unable to complete this request.' });
    }
  }

  return (
    <main className="min-h-screen bg-[#0B0B0B] px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl shadow-black/50 sm:p-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">MavenSync Connect</p>
        <h1 className="mt-2 text-2xl font-semibold">Review Hub execution request</h1>
        <p className="mt-2 text-sm text-white/55">
          This request came from MavenSync Hub. Approving creates a native Creator OS job for this exact brief.
          Nothing is sent to a paid provider from this screen.
        </p>

        {state.status === 'loading' && <p className="mt-8 text-sm text-white/60">Loading request...</p>}
        {state.status === 'error' && (
          <div className="mt-8 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p>{state.message}</p>
            <button type="button" onClick={load} className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80">
              Try again
            </button>
          </div>
        )}

        {request && state.status !== 'approved' && state.status !== 'declined' && (
          <div className="mt-8 space-y-5">
            <dl className="grid gap-3 text-sm">
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-white/45">Operation</dt>
                <dd className="text-right font-medium">{OPERATION_LABELS[request.operation] || request.operation}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-white/45">Cost ceiling</dt>
                <dd className="text-right font-medium">{request.costCeiling}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                <dt className="text-white/45">Approval state</dt>
                <dd className="text-right font-medium">{request.state}</dd>
              </div>
              {request.jobId && (
                <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-3">
                  <dt className="text-white/45">Native job</dt>
                  <dd className="text-right font-mono text-xs">{request.jobId}</dd>
                </div>
              )}
            </dl>

            <div>
              <h2 className="text-sm font-semibold text-white/80">Brief</h2>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-white/75">
                {request.brief}
              </p>
            </div>

            {Object.keys(request.parameters || {}).length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white/80">Parameters</h2>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-white/65">
                  {JSON.stringify(request.parameters, null, 2)}
                </pre>
              </div>
            )}

            {request.state === 'started' ? (
              <p className="rounded-lg border border-[#D4A858]/30 bg-[#D4A858]/10 p-4 text-sm text-[#F2D28B]">
                This request already has native job {request.jobId}. Re-approving cannot replace it.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => decide('approve')}
                  disabled={state.status === 'submitting' || request.paidExecutionEnabled === true}
                  className="rounded-lg bg-[#D4A858] px-5 py-3 text-sm font-semibold text-black transition-opacity disabled:opacity-50"
                >
                  {state.status === 'submitting' ? 'Approving...' : 'Approve and create native job'}
                </button>
                <button
                  type="button"
                  onClick={() => decide('decline')}
                  disabled={state.status === 'submitting'}
                  className="rounded-lg border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            )}
          </div>
        )}

        {state.status === 'approved' && result && (
          <div className="mt-8 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-5 text-sm text-emerald-100">
            <p className="font-semibold">Native job created.</p>
            <p className="mt-2 break-all font-mono text-xs">Job: {result.jobId}</p>
            <p className="mt-2 text-emerald-100/80">Return to ChatGPT to read the owner-bound status through MavenSync Connect.</p>
          </div>
        )}

        {state.status === 'declined' && (
          <div className="mt-8 rounded-lg border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            Request declined. No Creator OS job was created.
          </div>
        )}
      </div>
    </main>
  );
}

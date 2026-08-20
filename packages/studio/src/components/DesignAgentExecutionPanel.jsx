"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import AgentExecutionCard from '../../../../app/agents/AgentExecutionCard.jsx';
import {
  approvalErrorMessage,
  approveAgentExecutionPlan,
  beginAgentExecutionFromConversation,
} from '../../../../app/agents/agentExecutionBridge.js';
import {
  createSingleFlightGuard,
  designAgentPreparationError,
  designAgentStartRequest,
} from './designAgentExecutionState.js';

export default function DesignAgentExecutionPanel({
  sessionId,
  prepare = beginAgentExecutionFromConversation,
  approve = approveAgentExecutionPlan,
}) {
  const request = designAgentStartRequest(sessionId);
  const startGuardRef = useRef(createSingleFlightGuard());
  const approvalInFlightRef = useRef(false);
  const [state, setState] = useState(null);
  const [startPending, setStartPending] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);

  useEffect(() => {
    startGuardRef.current = createSingleFlightGuard();
    approvalInFlightRef.current = false;
    setStartPending(false);
    setApprovalPending(false);
    setState(null);
  }, [request?.conversationId]);

  const handleStart = useCallback(async () => {
    if (!request) return;
    return startGuardRef.current(async () => {
      setStartPending(true);
      setState({ status: 'starting', executionStarted: false });
      try {
        const result = await prepare(request);
        setState({ ...result, executionStarted: false });
      } catch (error) {
        setState({ status: 'error', message: designAgentPreparationError(error), executionStarted: false });
      } finally {
        setStartPending(false);
      }
    });
  }, [prepare, request?.conversationId]);

  const handleApproval = useCallback(async () => {
    if (approvalInFlightRef.current || state?.status !== 'requires_approval' || !state.jobId || !state.planId) return;
    approvalInFlightRef.current = true;
    setApprovalPending(true);
    setState((current) => current ? { ...current, approvalError: null } : current);
    try {
      const result = await approve({ jobId: state.jobId, planId: state.planId });
      setState((current) => ({
        ...current,
        ...result,
        jobId: result.jobId || current.jobId,
        planId: result.planId || current.planId,
        executionStarted: false,
        approvalError: null,
      }));
    } catch (error) {
      setState((current) => current ? { ...current, approvalError: approvalErrorMessage(error) } : current);
    } finally {
      approvalInFlightRef.current = false;
      setApprovalPending(false);
    }
  }, [approve, state]);

  return (
    <section className="h-full overflow-y-auto bg-bg-page p-4" data-creator-os-execution="design-agent" aria-label="Creator OS creative work">
      {!state ? (
        <div className="rounded-xl border border-divider bg-bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Creative work</p>
          <h2 className="mt-2 text-sm font-semibold text-primary-text">Ready to turn this conversation into content?</h2>
          <button
            type="button"
            onClick={handleStart}
            disabled={!request || startPending}
            title={request ? 'Use this conversation and its session assets to prepare creative work' : 'Start a Design Agent session before preparing creative work'}
            className="mt-4 w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Creative Work
          </button>
          <p className="mt-2 text-[10px] leading-relaxed text-secondary-text">Preparation does not create media.</p>
        </div>
      ) : (
        <AgentExecutionCard
          state={state}
          onApprove={handleApproval}
          approvalPending={approvalPending}
        />
      )}
    </section>
  );
}

"use client";

import { AiAgent } from "ai-agent";
import "ai-agent/dist/tailwind.css";
import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import axios from "axios";
import { useState } from "react";
import AgentExecutionCard from "../AgentExecutionCard";
import { approvalErrorMessage, approveAgentExecutionPlan, beginAgentExecution, beginAgentExecutionFromConversation, executeAgentCreativeJob, executionErrorMessage } from "../agentExecutionBridge";

const STORAGE_KEY = "muapi_key";

/**
 * AgentChatClient — mirrors muapiapp's AgentClient.js.
 * Renders the AiAgent library component with server-fetched agent details
 * and optional initial history.
 *
 * IMPORTANT: StandaloneShell is NOT in the tree on /agents/* pages, so we
 * must set up our own axios interceptor here to inject the API key into
 * all requests made by the AiAgent library.
 */
export default function AgentChatClient({ agentDetails, initialHistory, userData }) {
  const pathname = usePathname();
  const routeSegments = pathname.split('/').filter(Boolean);
  const routeAgentId = routeSegments[0] === 'agents' ? routeSegments[1] : null;
  const routeConversationId = routeSegments[0] === 'agents' ? routeSegments[2] : null;
  const interceptorRef = useRef(null);
  const approvalInFlightRef = useRef(false);
  const executionInFlightRef = useRef(false);
  const [executionState, setExecutionState] = useState(null);
  const [approvalPending, setApprovalPending] = useState(false);
  const [nativeStartPending, setNativeStartPending] = useState(false);

  console.log("[AgentChatClient] Rendering", { 
    hasAgentDetails: !!agentDetails, 
    hasHistory: !!initialHistory, 
    hasUserData: !!userData 
  });

  useEffect(() => {
    const getKey = () => {
      if (typeof window === "undefined") return null;
      const fromStorage = localStorage.getItem(STORAGE_KEY);
      if (fromStorage) return fromStorage;
      const match = document.cookie.match(/muapi_key=([^;]+)/);
      return match ? match[1] : null;
    };

    const apiKey = getKey();
    if (!apiKey) return;

    interceptorRef.current = axios.interceptors.request.use((config) => {
      const isRelative =
        config.url.startsWith("/") || !config.url.startsWith("http");
      // Include specific proxy paths to be sure
      const isInternalProxy = config.url.includes('/api/app') || config.url.includes('/api/workflow') || config.url.includes('/api/agents') || config.url.includes('/api/api') || config.url.includes('/api/v1');
      
      if (isRelative || isInternalProxy) {
        config.headers["x-api-key"] = apiKey;
      }
      return config;
    });

    return () => {
      if (interceptorRef.current !== null) {
        axios.interceptors.request.eject(interceptorRef.current);
      }
    };
  }, []);

  const useUser = useCallback(
    () => ({
      user: {
        username: userData?.email?.split("@")[0] || "Studio User",
        name: userData?.email?.split("@")[0] || "Studio User",
        email: userData?.email || null,
        profile_photo: null,
        balance: userData?.balance || 0,
      },
      isAuthorized: !!userData,
    }),
    [userData]
  );

  const handleStructuredAction = useCallback(async (action) => {
    if (action?.type !== "agent_execution_action" || action.action !== "start") return;
    setExecutionState({ status: "starting", executionStarted: false });
    try {
      const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
      const result = await beginAgentExecution({
        ...payload,
        agentId: payload.agentId || agentDetails?.id || agentDetails?.agent_id || agentDetails?.slug,
        conversationId: payload.conversationId || window.location.pathname.split('/').filter(Boolean).at(-1),
        references: payload.references || [],
        attachments: payload.attachments || [],
      });
      setExecutionState({
        status: result.status,
        jobId: result.jobId,
        planId: result.planId || null,
        requiredInputs: result.requiredInputs || [],
        approvalRequirements: result.approvalRequirements || [],
        review: result.review || null,
        executionStarted: false,
      });
    } catch (error) {
      setExecutionState({ status: "error", message: error.message || "Unable to prepare creative work.", executionStarted: false });
    }
  }, [agentDetails]);

  const handleNativeStart = useCallback(async () => {
    if (nativeStartPending) return;
    const agentId = agentDetails?.slug || routeAgentId;
    if (!agentId || !routeConversationId) {
      setExecutionState({ status: 'error', message: 'Send a message in this conversation before starting creative work.', executionStarted: false });
      return;
    }
    setNativeStartPending(true);
    setExecutionState({ status: 'starting', executionStarted: false });
    try {
      const result = await beginAgentExecutionFromConversation({ agentId, conversationId: routeConversationId });
      setExecutionState(result);
    } catch (error) {
      setExecutionState({ status: 'error', message: error.message || 'Unable to prepare creative work.', executionStarted: false });
    } finally {
      setNativeStartPending(false);
    }
  }, [agentDetails, nativeStartPending, routeAgentId, routeConversationId]);

  const handlePlanApproval = useCallback(async () => {
    if (approvalInFlightRef.current) return;
    if (executionState?.status !== "requires_approval" || !executionState.jobId || !executionState.planId) return;
    approvalInFlightRef.current = true;
    setApprovalPending(true);
    setExecutionState((current) => current ? { ...current, approvalError: null } : current);
    try {
      const result = await approveAgentExecutionPlan({ jobId: executionState.jobId, planId: executionState.planId });
      setExecutionState((current) => ({
        ...current,
        ...result,
        jobId: result.jobId || current.jobId,
        planId: result.planId || current.planId,
        approvalError: null,
        executionStarted: false,
      }));
    } catch (error) {
      setExecutionState((current) => current ? { ...current, approvalError: approvalErrorMessage(error) } : current);
    } finally {
      approvalInFlightRef.current = false;
      setApprovalPending(false);
    }
  }, [executionState]);

  const handleCreate = useCallback(async () => {
    if (executionInFlightRef.current) return;
    if (executionState?.status !== "ready" || !executionState.jobId) return;
    executionInFlightRef.current = true;
    setExecutionState((current) => current ? { ...current, status: "running", executionError: null, executionStarted: true } : current);
    try {
      const result = await executeAgentCreativeJob({ jobId: executionState.jobId });
      setExecutionState((current) => ({
        ...current,
        ...result,
        jobId: result.jobId || current.jobId,
        planId: current.planId,
        review: current.review,
        executionError: null,
      }));
    } catch (error) {
      setExecutionState((current) => current ? { ...current, status: "failed", executionError: executionErrorMessage(error), executionStarted: false } : current);
    } finally {
      executionInFlightRef.current = false;
    }
  }, [executionState]);

  return (
    <div className="h-screen w-full bg-black">
      <AiAgent
        initialAgentDetails={agentDetails}
        initialHistory={initialHistory}
        useUser={useUser}
        usedIn="muapiapp"
        onStructuredAction={handleStructuredAction}
        renderHostContent={() => (
          <div className="mx-auto w-full max-w-3xl">
            <button
              type="button"
              onClick={handleNativeStart}
              disabled={!routeConversationId || nativeStartPending || executionState?.status === 'running'}
              title={routeConversationId ? 'Analyze this conversation and prepare creative work' : 'Send a message before starting creative work'}
              className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--component-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--component-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {nativeStartPending ? 'Preparing Creative Work…' : 'Start Creative Work'}
            </button>
            <AgentExecutionCard state={executionState ? { ...executionState, message: executionState.executionError || executionState.message } : executionState} onCreate={handleCreate} onApprove={handlePlanApproval} approvalPending={approvalPending} executionPending={executionState?.status === "running"} />
          </div>
        )}
      />
    </div>
  );
}

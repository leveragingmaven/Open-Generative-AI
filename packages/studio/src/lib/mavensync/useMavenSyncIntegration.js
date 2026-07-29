"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MavenSyncClient, getMavenSyncBrowserConfig } from "./MavenSyncClient.js";
import { getBrowserSession } from "./MavenSyncSession.js";
import {
  parseAllowedReturnOrigins,
  parseLaunchContextFromUrl,
  removeLaunchParamsFromUrl,
} from "./LaunchContext.js";
import { normalizeKnowledgeContext } from "./KnowledgeConnector.js";
import { normalizeProjectContext } from "./ProjectConnector.js";
import { normalizeAssetReference, registerAssetSafe, returnAssetSafe } from "./AssetHandoff.js";
import { MAVENSYNC_MODES } from "./integrationTypes.js";

export function useMavenSyncIntegration(options = {}) {
  const config = useMemo(
    () => ({
      ...getMavenSyncBrowserConfig(),
      ...(options.config || {}),
    }),
    [options.config],
  );

  const client = useMemo(
    () =>
      options.client ||
      new MavenSyncClient({
        apiBase: config.apiBase,
        timeoutMs: options.timeoutMs,
      }),
    [config.apiBase, options.client, options.timeoutMs],
  );

  const [state, setState] = useState({
    mode: MAVENSYNC_MODES.STANDALONE,
    session: getBrowserSession(typeof window !== "undefined" ? window : undefined),
    launchContext: null,
    project: null,
    campaign: null,
    knowledge: null,
    isLoading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;

    const session = getBrowserSession(window);
    const allowedReturnOrigins = parseAllowedReturnOrigins(config.allowedReturnOrigins);
    const launchContext = parseLaunchContextFromUrl(window.location.href, {
      allowedReturnOrigins,
    });

    removeLaunchParamsFromUrl(window.location, window.history);

    if (!launchContext?.launchId || !client.isEnabled()) {
      setState((prev) => ({
        ...prev,
        mode: session.authenticated ? MAVENSYNC_MODES.AGENCY : MAVENSYNC_MODES.STANDALONE,
        session,
        launchContext,
        project: null,
        campaign: null,
        knowledge: null,
        isLoading: false,
        error: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, session, launchContext, isLoading: true, error: null }));

    try {
      const exchanged = await client.getLaunchContext(launchContext.launchId);
      const resolvedLaunchContext = {
        ...launchContext,
        ...(exchanged?.launchContext || exchanged || {}),
        source: "hub-launch",
      };

      const [projectData, campaignData, knowledgeData] = await Promise.all([
        client.getProject(resolvedLaunchContext.projectId),
        client.getCampaign(resolvedLaunchContext.campaignId),
        client.getKnowledgeContext(resolvedLaunchContext.knowledgeSelectionId),
      ]);

      setState({
        mode: MAVENSYNC_MODES.HUB_LAUNCH,
        session,
        launchContext: resolvedLaunchContext,
        project: normalizeProjectContext(projectData || resolvedLaunchContext),
        campaign: campaignData || null,
        knowledge: normalizeKnowledgeContext(knowledgeData),
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.warn("[MavenSync] Launch context failed; continuing in standalone mode.", error);
      setState({
        mode: session.authenticated ? MAVENSYNC_MODES.AGENCY : MAVENSYNC_MODES.STANDALONE,
        session,
        launchContext: null,
        project: null,
        campaign: null,
        knowledge: null,
        isLoading: false,
        error,
      });
    }
  }, [client, config.allowedReturnOrigins]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const registerAsset = useCallback(
    async (asset) => {
      const assetReference = normalizeAssetReference(asset, state);
      if (state.mode !== MAVENSYNC_MODES.HUB_LAUNCH || !client.isEnabled()) {
        return { ok: true, skipped: true, assetReference };
      }
      return registerAssetSafe(client, assetReference);
    },
    [client, state],
  );

  const returnAsset = useCallback(
    async (assetId, payload = {}) => {
      if (state.mode !== MAVENSYNC_MODES.HUB_LAUNCH || !client.isEnabled()) {
        return { ok: true, skipped: true, assetId };
      }
      return returnAssetSafe(client, assetId, payload);
    },
    [client, state.mode],
  );

  return {
    ...state,
    refresh,
    registerAsset,
    returnAsset,
  };
}

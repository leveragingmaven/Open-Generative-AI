"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CampaignStore } from "./CampaignStore.js";
import { createCreatorProjectClient } from "./creatorProjectClient.js";

// Establishes the currently active campaign across the Creative OS.
// The provider restores the persisted active campaign on mount and keeps the
// header + any studio (via useActiveCampaign) in sync. Purely context — no
// studio behavior, assets, providers, workflows, or prompts are changed here.

const CampaignContext = createContext(null);

export function CampaignProvider({ children }) {
  const [activeCampaign, setActiveCampaign] = useState(null);
  // Browser-local projects left behind by the pre-7.1b unscoped store. They may
  // belong to another creator who used this device, so they are only ever offered
  // for explicit confirmation — never adopted by signing in.
  const [legacyQuarantine, setLegacyQuarantine] = useState(null);
  const [legacyNotice, setLegacyNotice] = useState(null);

  // The provider now hydrates from the durable project store after first paint.
  // The contract is unchanged: consumers still read `activeCampaign` /
  // `activeCampaignId` and call the same setters. Until the session resolves there
  // is simply no scope, so the first render shows nothing rather than the wrong
  // profile's projects.
  useEffect(() => {
    let cancelled = false;

    const applyFromCache = () => {
      let campaign = null;
      if (typeof window !== "undefined") {
        const fromUrl = new URLSearchParams(window.location.search).get("campaign");
        if (fromUrl) campaign = CampaignStore.get(fromUrl);
      }
      if (campaign) {
        CampaignStore.setActive(campaign.id);
        setActiveCampaign(campaign);
      } else {
        setActiveCampaign(CampaignStore.getActive());
      }
    };

    // No scope is restored from storage: the cache only ever belongs to the profile
    // this session resolves to, so another creator's projects can never paint first.
    applyFromCache();

    const unsubscribe = CampaignStore.subscribe(() => {
      if (!cancelled) applyFromCache();
    });

    const client = createCreatorProjectClient();
    const sync = async () => {
      try {
        await CampaignStore.hydrate({ client });
      } catch (error) {
        // Offline or unavailable: the cached projects stand and every write path
        // still reports its own failure. Nothing is presented as saved.
      }
      // Detection only. It quarantines the legacy keys so nothing is silently
      // claimed, and surfaces them so a human can confirm or dismiss.
      try {
        CampaignStore.detectLegacyProjects();
        if (!cancelled) setLegacyQuarantine(CampaignStore.getQuarantinedProjects());
      } catch (error) {
        // Detection is never allowed to break hydration.
      }
    };
    void sync();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      activeCampaign,
      activeCampaignId: activeCampaign?.id || null,
      legacyQuarantine,
      legacyQuarantineCount: legacyQuarantine?.items?.length || 0,
      legacyNotice,
      setActiveCampaign: (campaign) => {
        if (!campaign) {
          CampaignStore.clearActive();
          setActiveCampaign(null);
          return;
        }
        CampaignStore.setActive(campaign.id);
        setActiveCampaign(campaign);
      },
      clearActiveCampaign: () => {
        CampaignStore.clearActive();
        setActiveCampaign(null);
      },
      // Explicit user confirmation only. A rejection from the server (for example
      // because another profile on this browser already adopted the same local
      // data) leaves the quarantine in place and is reported as text, never as
      // success.
      importLegacyProjects: async () => {
        try {
          // Built inside the try so an environment without fetch is reported as a
          // failed import instead of an unhandled rejection in the click handler.
          const client = createCreatorProjectClient();
          const result = await CampaignStore.importQuarantinedProjects({ client, confirm: true });
          setLegacyQuarantine(CampaignStore.getQuarantinedProjects());
          setLegacyNotice(
            result.imported > 0
              ? null
              : "Those browser-local campaigns were not imported.",
          );
          return result;
        } catch (error) {
          setLegacyNotice(error?.message || "Those browser-local campaigns could not be imported yet.");
          return { imported: 0, reason: error?.code || "import_failed" };
        }
      },
      discardLegacyProjects: () => {
        CampaignStore.discardQuarantinedProjects();
        setLegacyQuarantine(null);
        setLegacyNotice(null);
      },
    }),
    [activeCampaign, legacyQuarantine, legacyNotice],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useActiveCampaign() {
  const context = useContext(CampaignContext);
  if (!context) {
    return {
      activeCampaign: null,
      activeCampaignId: null,
      legacyQuarantine: null,
      legacyQuarantineCount: 0,
      legacyNotice: null,
      setActiveCampaign: () => {},
      clearActiveCampaign: () => {},
      importLegacyProjects: async () => ({ imported: 0, reason: "no_provider" }),
      discardLegacyProjects: () => {},
    };
  }
  return context;
}

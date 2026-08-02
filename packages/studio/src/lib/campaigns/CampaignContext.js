"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CampaignStore } from "./CampaignStore.js";

// Establishes the currently active campaign across the Creative OS.
// The provider restores the persisted active campaign on mount and keeps the
// header + any studio (via useActiveCampaign) in sync. Purely context — no
// studio behavior, assets, providers, workflows, or prompts are changed here.

const CampaignContext = createContext(null);

export function CampaignProvider({ children }) {
  const [activeCampaign, setActiveCampaign] = useState(null);

  useEffect(() => {
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
  }, []);

  const value = useMemo(
    () => ({
      activeCampaign,
      activeCampaignId: activeCampaign?.id || null,
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
    }),
    [activeCampaign],
  );

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useActiveCampaign() {
  const context = useContext(CampaignContext);
  if (!context) {
    return {
      activeCampaign: null,
      activeCampaignId: null,
      setActiveCampaign: () => {},
      clearActiveCampaign: () => {},
    };
  }
  return context;
}

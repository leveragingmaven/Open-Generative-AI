"use client";

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreativeCanvas } from 'design-agent';

import { getUserBalance } from '../muapi';
import { useMavenSyncIntegration } from '../lib/mavensync/useMavenSyncIntegration.js';
import { TABS } from '../studioNavigation.js';
import DesignAgentExecutionPanel from './DesignAgentExecutionPanel.jsx';

// Home-state shortcut groups resolved from the existing Creator OS navigation
// registry (TABS). ids reference real destinations; label/icon/route come from
// TABS so there is no second hardcoded route registry maintained here.
const HOME_SHORTCUT_GROUPS = [
  { label: 'Intelligence', ids: ['ai-twin', 'agents'] },
  { label: 'Create', ids: ['image', 'video', 'marketing', 'audio'] },
  { label: 'Build', ids: ['workflows'] },
  { label: 'Manage', ids: ['asset-library', 'publishing'] },
];

function resolveHomeShortcuts() {
  return HOME_SHORTCUT_GROUPS
    .map((group) => ({
      label: group.label,
      items: group.ids
        .map((id) => {
          const tab = TABS.find((t) => t.id === id);
          return tab ? { id: tab.id, label: tab.label, icon: tab.icon, route: `/studio/${tab.id}` } : null;
        })
        .filter(Boolean),
    }))
    .filter((group) => group.items.length > 0);
}

export default function DesignAgentStudio({ apiKey, isHeaderVisible, onToggleHeader }) {
  const [userData, setUserData] = useState(null);
  const [controlledMode, setControlledMode] = useState(false);
  const integration = useMavenSyncIntegration();
  const homeShortcuts = useMemo(resolveHomeShortcuts, []);
  const sessionId = useSearchParams().get('session');

  useEffect(() => {
    sessionStorage.setItem("fromDesignAgent", "true");

    // Service credentials must not be persisted in browser storage. Older
    // embedded Design Agent builds read localStorage.token, so remove any stale
    // value before the canvas mounts and let same-origin server routes attach
    // the configured MuAPI credential.
    localStorage.removeItem("token");

    // Discover whether the server has enabled the Creator OS controlled
    // conversation boundary. This is read-only from the browser; the server
    // owns the decision and the route refuses to change mode via client input.
    fetch('/api/design-agent/config')
      .then((res) => res.ok ? res.json() : { controlledExecution: false })
      .then((data) => setControlledMode(Boolean(data?.controlledExecution)))
      .catch(() => setControlledMode(false));

    if (!apiKey) return;

    const fetchUser = async () => {
      try {
        const data = await getUserBalance(apiKey);
        setUserData({
          username:
            integration.session?.displayName ||
            data.email?.split('@')[0] ||
            integration.session?.email?.split('@')[0] ||
            'Studio User',
          email: integration.session?.email || data.email,
          balance: data.balance || 0
        });
      } catch (err) {
        console.error('Failed to fetch user data for Design Agent:', err);
        if (integration.session?.authenticated) {
          setUserData({
            username: integration.session.displayName || integration.session.email?.split('@')[0] || 'Studio User',
            email: integration.session.email,
            balance: 0
          });
        }
      }
    };

    fetchUser();
  }, [apiKey, integration.session?.authenticated, integration.session?.displayName, integration.session?.email]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black lg:flex-row design-agent-studio">
      <div className="min-h-0 min-w-0 flex-1">
        <CreativeCanvas
          user={userData}
          isAuthorized={!!userData}
          creditConversionRate={200}
          theme="dark"
          onToggleHeader={onToggleHeader}
          isHeaderVisible={isHeaderVisible}
          homeShortcuts={homeShortcuts}
          controlledMode={controlledMode}
        />
      </div>
      <aside className="max-h-[42%] w-full shrink-0 border-t border-divider bg-bg-page lg:h-full lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0" aria-label="Creator OS creative work panel">
        <DesignAgentExecutionPanel sessionId={sessionId} />
      </aside>
    </div>
  );
}

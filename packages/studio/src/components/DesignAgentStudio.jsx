"use client";

import { useState, useEffect } from 'react';
import { CreativeCanvas } from 'design-agent';

import { getUserBalance } from '../muapi';
import { useMavenSyncIntegration } from '../lib/mavensync/useMavenSyncIntegration.js';

export default function DesignAgentStudio({ apiKey, isHeaderVisible, onToggleHeader }) {
  const [userData, setUserData] = useState(null);
  const integration = useMavenSyncIntegration();

  useEffect(() => {
    sessionStorage.setItem("fromDesignAgent", "true");

    // Service credentials must not be persisted in browser storage. Older
    // embedded Design Agent builds read localStorage.token, so remove any stale
    // value before the canvas mounts and let same-origin server routes attach
    // the configured MuAPI credential.
    localStorage.removeItem("token");

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
    <div className="h-full w-full bg-black overflow-hidden design-agent-studio">
      <CreativeCanvas 
        user={userData}
        isAuthorized={!!userData}
        creditConversionRate={200}
        theme="dark"
        onToggleHeader={onToggleHeader}
        isHeaderVisible={isHeaderVisible}
      />
    </div>
  );
}

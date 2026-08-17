"use client";

import { useEffect, useState } from "react";
import { ghlHubPublishingProvider } from "../lib/publishing/GhlHubPublishingProvider.js";

export default function GhlHubPublishingAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    ghlHubPublishingProvider.getConnectedAccounts().then((next) => {
      if (active) setAccounts(next);
    }).catch((nextError) => {
      if (active) setError(nextError);
    });
    return () => { active = false; };
  }, []);

  return (
    <section aria-label="MavenSync Hub GoHighLevel accounts" className="mt-5 rounded-[var(--ms-radius-card)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="text-sm font-semibold">MavenSync Hub / GoHighLevel</h2><p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Read-only connected destinations from MavenSync Hub.</p></div><span className="text-[9px] text-[var(--ms-color-gold-muted)]">Facebook · Instagram · Threads · Pinterest</span></div>
      {error ? <p role="alert" className="mt-4 text-xs text-[var(--ms-color-error)]">{error.code === "hub_session_expired" ? "Reconnect through MavenSync Hub to view connected accounts." : error.message}</p> : null}
      {!error && accounts.length === 0 ? <p className="mt-4 text-xs text-[var(--ms-color-text-muted)]">No Hub-connected destinations found.</p> : null}
      {accounts.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{accounts.map((account) => <div key={`${account.platform}:${account.id}`} className="flex items-center gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] p-3">{account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(212,168,88,0.08)] text-[10px] text-[var(--ms-color-gold-primary)]">{account.platform.slice(0, 2).toUpperCase()}</span>}<div className="min-w-0"><p className="truncate text-xs font-semibold">{account.name || account.username || "Connected account"}</p><p className="mt-1 text-[9px] capitalize text-[var(--ms-color-text-muted)]">{account.platform}</p></div></div>)}</div> : null}
    </section>
  );
}

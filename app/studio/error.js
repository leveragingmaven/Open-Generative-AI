"use client";

import { useCallback } from "react";

export default function StudioError({ reset }) {
  const retry = useCallback(() => {
    reset();
    if (typeof window !== "undefined") window.location.reload();
  }, [reset]);

  return (
    <div className="min-h-screen bg-[#050505] p-6">
      <div role="alert" className="flex min-h-[calc(100vh-3rem)] w-full items-center justify-center bg-[#050505] px-6 text-center text-white">
        <div className="max-w-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D4A858]">MavenSync Creative OS</p>
          <h2 className="mt-3 text-lg font-semibold">Creator OS could not finish loading</h2>
          <p className="mt-2 text-sm text-white/60">The workspace encountered a temporary loading problem. Reload to try again.</p>
          <button type="button" onClick={retry} className="mt-6 min-h-11 rounded-[var(--ms-radius-button)] bg-[#E82070] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#f0448b]">
            Reload / Retry
          </button>
        </div>
      </div>
    </div>
  );
}

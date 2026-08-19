"use client";

import { useCallback } from "react";
import { RecoverableErrorFallback } from "studio";

export default function StudioError({ reset }) {
  const retry = useCallback(() => {
    reset();
    if (typeof window !== "undefined") window.location.reload();
  }, [reset]);

  return (
    <div className="min-h-screen bg-[#050505] p-6">
      <RecoverableErrorFallback
        title="Creator OS could not finish loading"
        description="The workspace encountered a temporary loading problem. Reload to try again."
        onRetry={retry}
      />
    </div>
  );
}

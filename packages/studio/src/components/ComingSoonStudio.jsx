"use client";

// Placeholder destination page for Creative OS destinations not yet built.
// Rendered by StandaloneShell on the /studio/coming-soon route.
export default function ComingSoonStudio({ name = "This destination" }) {
  return (
    <div className="h-full w-full bg-[#121212] text-white overflow-y-auto">
      <main className="min-h-full w-full p-6 md:p-10 flex items-center justify-center">
        <div className="w-full max-w-lg text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4A858]/30 bg-[#D4A858]/[0.08] shadow-[0_0_24px_rgba(212,168,88,0.12)]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F0D9A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p className="mt-6 text-[10px] uppercase tracking-[0.28em] text-[#D4A858]/80">{name}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coming Soon</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#B5B5B5]">
            This destination is being built and will appear here in a future update.
          </p>
        </div>
      </main>
    </div>
  );
}

"use client";

import { Component } from "react";

export function reloadCreatorOs() {
  if (typeof window !== "undefined") window.location.reload();
}

export function RecoverableErrorFallback({
  title = "This workspace could not finish loading",
  description = "Try reloading the workspace. Your saved work is not affected.",
  onRetry = reloadCreatorOs,
}) {
  return (
    <div role="alert" className="flex h-full min-h-52 w-full items-center justify-center bg-[#050505] px-6 text-center text-white">
      <div className="max-w-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#D4A858]">MavenSync Creative OS</p>
        <h2 className="mt-3 text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-white/60">{description}</p>
        <button type="button" onClick={onRetry} className="mt-6 min-h-11 rounded-[var(--ms-radius-button)] bg-[#E82070] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#f0448b]">
          Reload / Retry
        </button>
      </div>
    </div>
  );
}

export default class RecoverableErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") return fallback(this.state.error, reloadCreatorOs);
      if (fallback) return fallback;
      return <RecoverableErrorFallback onRetry={reloadCreatorOs} />;
    }
    return this.props.children;
  }
}

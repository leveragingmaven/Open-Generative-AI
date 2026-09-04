import React from "react";
import { panelVariants } from "./tokens";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\layout\MavenPanel.tsx
 * (converted TS -> JS).
 */
export function MavenPanel({
  variant = "default",
  showAccentLine = false,
  padded = true,
  children,
  className = "",
  ...props
}) {
  const selectedVariant = panelVariants[variant] || panelVariants.default;

  return (
    <div
      className={`
        relative rounded-xl overflow-hidden transition-all duration-200
        ${selectedVariant.container}
        ${padded ? "p-5 sm:p-6" : ""}
        ${className}
      `}
      {...props}
    >
      {showAccentLine && selectedVariant.accentLine && (
        <div className={`absolute top-0 left-0 right-0 h-1 ${selectedVariant.accentLine}`} />
      )}
      {children}
    </div>
  );
}

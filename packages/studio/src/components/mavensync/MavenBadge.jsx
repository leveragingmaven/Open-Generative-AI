import React from "react";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\ui\MavenBadge.tsx
 * (converted TS -> JS).
 */
export function MavenBadge({
  children,
  variant = "gold",
  size = "md",
  icon,
  className = "",
}) {
  const sizeStyles = {
    sm: "text-[10px] px-2 py-0.5 rounded-md gap-1 font-semibold uppercase tracking-wider",
    md: "text-xs px-2.5 py-1 rounded-lg gap-1.5 font-medium",
  };

  const variantStyles = {
    gold: "bg-[#F3BA4A]/10 text-[#F3BA4A] border border-[#F3BA4A]/30",
    pink: "bg-[#E82070]/10 text-[#E82070] border border-[#E82070]/30",
    neutral: "bg-[#1A1E2B] text-[#94A3B8] border border-[#252B3B]",
    info: "bg-[#38BDF8]/10 text-[#38BDF8] border border-[#38BDF8]/30",
    success: "bg-[#34D399]/10 text-[#34D399] border border-[#34D399]/30",
    warning: "bg-[#FBBF24]/10 text-[#FBBF24] border border-[#FBBF24]/30",
    danger: "bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30",
  };

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${
        sizeStyles[size] || sizeStyles.md
      } ${variantStyles[variant] || variantStyles.gold} ${className}`}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
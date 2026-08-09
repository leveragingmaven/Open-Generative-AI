import React from "react";
import { Loader2 } from "lucide-react";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\ui\MavenButton.tsx
 * (converted TS -> JS).
 */
export function MavenButton({
  children,
  variant = "primaryPink",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap active:scale-[0.98]";

  const sizeStyles = {
    sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
    md: "text-sm px-4 py-2.5 rounded-xl gap-2",
    lg: "text-base px-6 py-3 rounded-xl gap-2.5",
  };

  const variantStyles = {
    primaryPink:
      "bg-[#E82070] hover:bg-[#C01358] text-white shadow-[0_0_20px_rgba(232,32,112,0.3)] hover:shadow-[0_0_25px_rgba(232,32,112,0.5)] focus:ring-[#E82070]/50 border border-[#FF8CC3]/20",
    primaryGold:
      "bg-[#F3BA4A] hover:bg-[#D97706] text-[#0A0C10] font-semibold shadow-[0_0_20px_rgba(243,186,74,0.3)] hover:shadow-[0_0_25px_rgba(243,186,74,0.5)] focus:ring-[#F3BA4A]/50 border border-[#FCE8A6]/30",
    secondary:
      "bg-[#1A1E2B] hover:bg-[#252B3B] text-[#F8FAFC] border border-[#252B3B] hover:border-[#3A435A] focus:ring-[#F3BA4A]/30",
    outline:
      "bg-transparent text-[#F8FAFC] border border-[#3A435A] hover:border-[#F3BA4A]/50 hover:bg-[#12151E] focus:ring-[#F3BA4A]/30",
    ghost: "bg-transparent text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1A1E2B] focus:ring-[#3A435A]",
    danger:
      "bg-[#F87171]/10 text-[#F87171] border border-[#F87171]/30 hover:bg-[#F87171]/20 focus:ring-[#F87171]/40",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          {leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="inline-flex shrink-0">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
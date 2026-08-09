/**
 * MavenSync Design System - Reusable Design Tokens
 *
 * Absolute single source of truth for colors, typography, spacing, radii, and visual effects.
 * Used across all MavenSync components and canonical layouts.
 *
 * Copied verbatim from ..\mavensync-app-starter\src\theme\tokens.ts (converted TS -> JS).
 */

export const colors = {
  // Foundation dark surfaces
  bg: "#0A0C10",
  surface: "#12151E",
  surfaceElevated: "#1A1E2B",
  border: "#252B3B",
  borderStrong: "#3A435A",

  // Brand Accents
  gold: {
    DEFAULT: "#F3BA4A",
    light: "#FCE8A6",
    dark: "#B88219",
    glow: "rgba(243, 186, 74, 0.15)",
    border: "rgba(243, 186, 74, 0.35)",
  },
  pink: {
    DEFAULT: "#E82070",
    light: "#FF8CC3",
    dark: "#B51253",
    glow: "rgba(232, 32, 112, 0.15)",
    border: "rgba(232, 32, 112, 0.35)",
  },

  // Typography Neutrals
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",

  // Semantic Status Colors
  information: {
    DEFAULT: "#38BDF8",
    glow: "rgba(56, 189, 248, 0.15)",
    border: "rgba(56, 189, 248, 0.35)",
  },
  success: {
    DEFAULT: "#34D399",
    glow: "rgba(52, 211, 153, 0.15)",
    border: "rgba(52, 211, 153, 0.35)",
  },
  warning: {
    DEFAULT: "#FBBF24",
    glow: "rgba(251, 191, 36, 0.15)",
    border: "rgba(251, 191, 36, 0.35)",
  },
  danger: {
    DEFAULT: "#F87171",
    glow: "rgba(248, 113, 113, 0.15)",
    border: "rgba(248, 113, 113, 0.35)",
  },
};

export const typography = {
  fontSans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  fontHeading: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'JetBrains Mono', monospace",

  eyebrow: "text-[11px] font-semibold uppercase tracking-widest text-[#F3BA4A]",
  pageTitle: "text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC]",
  sectionTitle: "text-lg font-semibold tracking-tight text-[#F8FAFC]",
  body: "text-sm leading-relaxed text-[#94A3B8]",
  bodyLarge: "text-base leading-relaxed text-[#F8FAFC]",
  helperText: "text-xs text-[#64748B]",
  metadata: "text-xs font-mono text-[#64748B]",
  button: "text-sm font-medium tracking-wide",
  input: "text-sm text-[#F8FAFC] placeholder-[#64748B]",
};

export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
};

export const radii = {
  sm: "rounded-md", // 6px
  md: "rounded-lg", // 10px
  lg: "rounded-xl", // 14px
  xl: "rounded-2xl", // 20px
  full: "rounded-full", // 9999px
};

export const effects = {
  softShadow: "shadow-[0_4px_20px_-2px_rgba(0,0,0,0.5)]",
  elevatedShadow: "shadow-[0_12px_32px_-4px_rgba(0,0,0,0.7)]",
  goldGlow: "shadow-[0_0_20px_rgba(243,186,74,0.18)]",
  pinkGlow: "shadow-[0_0_20px_rgba(232,32,112,0.18)]",
  focusRingGold: "focus:outline-none focus:ring-2 focus:ring-[#F3BA4A]/50 focus:border-[#F3BA4A]",
  focusRingPink: "focus:outline-none focus:ring-2 focus:ring-[#E82070]/50 focus:border-[#E82070]",
};

/**
 * Semantic Accent Panel Variations
 * Signature visual pattern: Structured dark panels with thin colored accent borders & glows.
 */
export const panelVariants = {
  default: {
    container: "bg-[#12151E] border border-[#252B3B]",
    glow: "",
    accentLine: "",
  },
  intelligence: {
    container:
      "bg-[#12151E] border border-[#F3BA4A]/30 shadow-[0_0_20px_rgba(243,186,74,0.08)]",
    glow: "shadow-[0_0_25px_rgba(243,186,74,0.15)]",
    accentLine: "bg-gradient-to-r from-[#F3BA4A] to-transparent",
  },
  creative: {
    container:
      "bg-[#12151E] border border-[#E82070]/30 shadow-[0_0_20px_rgba(232,32,112,0.08)]",
    glow: "shadow-[0_0_25px_rgba(232,32,112,0.15)]",
    accentLine: "bg-gradient-to-r from-[#E82070] to-transparent",
  },
  input: {
    container:
      "bg-[#1A1E2B] border border-[#252B3B] focus-within:border-[#38BDF8]/50 focus-within:shadow-[0_0_20px_rgba(56,189,248,0.1)]",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.1)]",
    accentLine: "bg-gradient-to-r from-[#38BDF8] to-transparent",
  },
  information: {
    container:
      "bg-[#12151E] border border-[#38BDF8]/30 shadow-[0_0_20px_rgba(56,189,248,0.08)]",
    glow: "shadow-[0_0_20px_rgba(56,189,248,0.12)]",
    accentLine: "bg-[#38BDF8]",
  },
  success: {
    container:
      "bg-[#12151E] border border-[#34D399]/30 shadow-[0_0_20px_rgba(52,211,153,0.08)]",
    glow: "shadow-[0_0_20px_rgba(52,211,153,0.12)]",
    accentLine: "bg-[#34D399]",
  },
  warning: {
    container:
      "bg-[#12151E] border border-[#FBBF24]/30 shadow-[0_0_20px_rgba(251,191,36,0.08)]",
    glow: "shadow-[0_0_20px_rgba(251,191,36,0.12)]",
    accentLine: "bg-[#FBBF24]",
  },
  danger: {
    container:
      "bg-[#12151E] border border-[#F87171]/30 shadow-[0_0_20px_rgba(248,113,113,0.08)]",
    glow: "shadow-[0_0_20px_rgba(248,113,113,0.12)]",
    accentLine: "bg-[#F87171]",
  },
};
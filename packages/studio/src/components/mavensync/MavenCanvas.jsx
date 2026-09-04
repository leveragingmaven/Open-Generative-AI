import React, { useState } from "react";
import {
  Layers,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Sparkles,
  Eye,
  Code,
} from "lucide-react";
import { MavenButton } from "./MavenButton";
import { MavenBadge } from "./MavenBadge";
import { MavenPanel } from "./MavenPanel";

/**
 * Copied verbatim from ..\mavensync-app-starter\src\components\canvas\MavenCanvas.tsx
 * (converted TS -> JS).
 * Extended with an optional `contentOverride` ReactNode. When provided, it renders
 * in the Main Content Area in place of the tabbed campaign mockups so Image Studio
 * can display its generated image results inside the MavenCanvas chrome.
 */
export function MavenCanvas({
  campaignData = {
    headline:
      "Transform Ideas into Production Code in Seconds with AI Agents",
    subheadline:
      "Join the 3-day intensive MavenSync AI Workshop. Master prompt architecture, autonomous coding workflows, and agentic UI design systems.",
    targetAudience: "Senior Engineers, Technical Founders, AI Architects",
    valueProps: [
      "Build production-grade agentic frontends without UI slop",
      "Master canonical layout patterns and design token systems",
      "Deploy self-healing AI apps directly to Cloud Run & Vercel",
    ],
    emailSubject: "🚀 [Invitation] Prompt to Product: The MavenSync AI Workshop",
    emailPreview:
      "Ready to step into high-speed agentic software engineering? Reserve your workspace...",
    socialPost:
      "⚡ Stop building generic dashboards. MavenSync App Starter gives AI agents the exact canonical layout rules they need to generate polished software.",
    ctaText: "Reserve Workshop Seat →",
  },
  lastPrompt,
  className = "",
  contentOverride = null,
}) {
  const [activeTab, setActiveTab] = useState("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    navigator.clipboard?.writeText(JSON.stringify(campaignData, null, 2));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex flex-col h-full bg-transparent overflow-hidden ${className}`}
    >
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-1 py-3 border-b border-[#252B3B]/60">
        <div className="flex items-center gap-3">
          <div className="p-1 text-[#E82070]/80">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#F8FAFC] font-heading">
                AI Generation Canvas
              </h3>
              <MavenBadge variant="gold" size="sm">
                Live Result
              </MavenBadge>
            </div>
            <p className="text-[11px] text-[#64748B]">
              {lastPrompt
                ? `Updated via: "${lastPrompt.slice(0, 40)}..."`
                : "Campaign Suite Output"}
            </p>
          </div>
        </div>

        {/* View Switcher & Export */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex p-0.5 bg-[#1A1E2B]/60 border border-[#252B3B]/70 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                activeTab === "preview"
                  ? "bg-[#12151E] text-[#F3BA4A] font-semibold shadow-xs"
                  : "text-[#94A3B8]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Live Preview
            </button>
            <button
              onClick={() => setActiveTab("brief")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                activeTab === "brief"
                  ? "bg-[#12151E] text-[#F3BA4A] font-semibold shadow-xs"
                  : "text-[#94A3B8]"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Campaign Brief
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-3 py-1 rounded-lg flex items-center gap-1.5 cursor-pointer ${
                activeTab === "code"
                  ? "bg-[#12151E] text-[#F3BA4A] font-semibold shadow-xs"
                  : "text-[#94A3B8]"
              }`}
            >
              <Code className="w-3.5 h-3.5" /> JSON Data
            </button>
          </div>

          <MavenButton
            variant="secondary"
            size="sm"
            onClick={handleCopy}
            leftIcon={
              copied ? (
                <Check className="w-3.5 h-3.5 text-[#34D399]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )
            }
          >
            {copied ? "Copied" : "Export"}
          </MavenButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-5 overflow-y-auto space-y-6">
        {contentOverride != null ? (
          contentOverride
        ) : activeTab === "preview" ? (
          <div className="space-y-6">
            {/* Hero Landing Page Card Mockup */}
            <MavenPanel
              variant="creative"
              showAccentLine
              padded
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <MavenBadge variant="pink" size="sm">
                  Landing Page Hero Mockup
                </MavenBadge>
                <span className="text-xs font-mono text-[#64748B]">
                  Responsive Desktop View
                </span>
              </div>

              <div className="space-y-3 pt-2">
                <h1 className="text-2xl sm:text-3xl font-bold text-[#F8FAFC] font-heading leading-tight">
                  {campaignData.headline}
                </h1>
                <p className="text-sm text-[#94A3B8] leading-relaxed max-w-2xl">
                  {campaignData.subheadline}
                </p>

                <div className="pt-3 flex flex-wrap items-center gap-3">
                  <MavenButton variant="primaryPink" size="md">
                    {campaignData.ctaText}
                  </MavenButton>
                  <MavenButton variant="outline" size="md">
                    View Syllabus & Schedule
                  </MavenButton>
                </div>
              </div>
            </MavenPanel>

            {/* Email Sequence Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MavenPanel variant="intelligence" padded className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#252B3B] pb-2">
                  <span className="text-xs font-semibold text-[#F3BA4A] uppercase tracking-wider">
                    Email #1: Launch Sequence
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#64748B]" />
                </div>
                <p className="text-xs font-semibold text-[#F8FAFC]">
                  Subject: {campaignData.emailSubject}
                </p>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  {campaignData.emailPreview}
                </p>
              </MavenPanel>

              {/* Social Media Post */}
              <MavenPanel variant="information" padded className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#252B3B] pb-2">
                  <span className="text-xs font-semibold text-[#38BDF8] uppercase tracking-wider">
                    X / LinkedIn Announcement
                  </span>
                  <Share2 className="w-3.5 h-3.5 text-[#64748B]" />
                </div>
                <p className="text-xs text-[#F8FAFC] leading-relaxed">
                  {campaignData.socialPost}
                </p>
              </MavenPanel>
            </div>
          </div>
        ) : activeTab === "brief" ? (
          <div className="space-y-4">
            <MavenPanel variant="default" padded className="space-y-4">
              <h3 className="text-base font-semibold text-[#F8FAFC] font-heading">
                Strategic Campaign Objectives
              </h3>
              <div className="space-y-2 text-xs text-[#94A3B8]">
                <p>
                  <strong className="text-[#F8FAFC]">Target Audience:</strong>{" "}
                  {campaignData.targetAudience}
                </p>
                <p>
                  <strong className="text-[#F8FAFC]">Core Message:</strong> Master
                  prompt engineering and autonomous coding workflows through
                  hands-on agent building.
                </p>
              </div>

              <div className="pt-2 border-t border-[#252B3B] space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#F3BA4A]">
                  Value Propositions
                </span>
                <ul className="space-y-1.5 text-xs text-[#94A3B8]">
                  {campaignData.valueProps.map((vp, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-[#F3BA4A] font-bold">•</span>
                      <span>{vp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </MavenPanel>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#0A0C10] border border-[#252B3B] font-mono text-xs text-[#38BDF8] overflow-x-auto">
            <pre>{JSON.stringify(campaignData, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

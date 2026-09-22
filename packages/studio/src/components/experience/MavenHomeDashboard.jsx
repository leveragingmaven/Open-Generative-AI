"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearStoredDashboardSessionId,
  createDesignAgentConversationClient,
  readStoredDashboardSessionId,
  storeDashboardSessionId,
} from "design-agent";
import { CampaignStore } from "../../lib/campaigns/CampaignStore.js";
import { localAssetManager } from "../../lib/intelligence/AssetManager.js";
import { readPublishingDrafts } from "../../lib/publishing/publishingHistory.js";
import { assetLabel, assetPreview, assetRoute, assetTimestamp, relativeTime, titleCase } from "./experienceAssetUtils.js";
import { ExperiencePage, WorkspaceCard } from "./ExperienceComponents.jsx";
import styles from "./MavenHomeDashboard.module.css";

function Icon({ type, size = 18 }) {
  const paths = {
    audio: <><path d="M9 18V5l12-2v13M9 8l12-2" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
    design: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></>,
    content: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    video: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2v8l-4-2z" /></>,
    repurpose: <><path d="M17 2.1 21 6l-4 3.9" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 21.9 3 18l4-3.9" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    approval: <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></>,
    publish: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5-5 5 5M12 5v11" /></>,
    progress: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    library: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    maven: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

const QUICK_ACTIONS = [
  { title: "Content", icon: "content", href: "/studio/marketing" },
  { title: "Image", icon: "image", href: "/studio/image" },
  { title: "Video", icon: "video", href: "/studio/video" },
  { title: "Audio", icon: "audio", href: "/studio/audio" },
  { title: "Lip Sync", icon: "content", href: "/studio/lipsync" },
  { title: "AI Influencer", icon: "maven", href: "/studio/ai-influencer" },
  { title: "Design", icon: "design", href: "/studio/design-agent" },
];

const MORE_ACTIONS = [
  { title: "Repurpose", icon: "repurpose", href: "/studio/clipping" },
  { title: "Vibe Motion", icon: "video", href: "/studio/vibe-motion" },
  { title: "Body Swap", icon: "maven", href: "/studio/body-swap" },
  { title: "Cinema", icon: "video", href: "/studio/cinema" },
  { title: "Character", icon: "maven", href: "/studio/character" },
  { title: "AI Twin", icon: "maven", href: "/studio/ai-twin" },
  { title: "Agents", icon: "design", href: "/studio/agents" },
  { title: "Creative Memory", icon: "library", href: "/studio/memory" },
  { title: "MCP & CLI", icon: "content", href: "/studio/mcp-cli" },
  { title: "Workspace Overview", icon: "library", href: "/studio/overview" },
  { title: "Create Workspace", icon: "design", href: "/studio/create" },
  { title: "Intelligence", icon: "design", href: "/studio/intelligence" },
];

const SECONDARY_ACTIONS = [
  { title: "Campaigns", icon: "library", href: "/studio/campaigns" },
  { title: "Workflows", icon: "repurpose", href: "/studio/workflows" },
  { title: "Publishing", icon: "publish", href: "/studio/publishing" },
  { title: "Creative Library", icon: "image", href: "/studio/asset-library" },
  { title: "Knowledge", icon: "content", href: "/studio/knowledge-center" },
];

function QuickActionButton({ item }) {
  return (
    <a href={item.href} className={styles.pill}>
      <Icon type={item.icon} size={14} />
      <span>{item.title}</span>
    </a>
  );
}

function AttentionTile({ icon, label, value, zeroDetail, actionHref, actionLabel }) {
  const hasWork = value > 0;
  return (
    <WorkspaceCard interactive className="flex min-h-24 flex-col justify-between p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-[-0.04em]">{hasWork ? value : "0"}</p>
          <p className="mt-1 text-xs font-medium text-[var(--ms-color-text-secondary)]">{label}</p>
        </div>
        <span className={`flex h-8 w-8 items-center justify-center rounded-[var(--ms-radius-card-small)] border ${hasWork ? "border-[rgba(232,32,112,0.35)] bg-[rgba(232,32,112,0.08)] text-[var(--ms-color-pink-primary)]" : "border-[var(--ms-color-border-emphasized)] bg-[rgba(212,168,88,0.07)] text-[var(--ms-color-gold-primary)]"}`}><Icon type={icon} size={16} /></span>
      </div>
      {hasWork && actionHref ? (
        <a href={actionHref} className="mt-2 inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-[var(--ms-color-pink-primary)] hover:text-[var(--ms-color-text-primary)]">{actionLabel} <Icon type="arrow" size={11} /></a>
      ) : (
        <p className="mt-2 text-[10px] text-[var(--ms-color-text-muted)]">{zeroDetail}</p>
      )}
    </WorkspaceCard>
  );
}

function MavenBubble({ message, streaming }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--ms-color-border-emphasized)] bg-black/20 text-[var(--ms-color-gold-primary)]">
          <Icon type="maven" size={14} />
        </span>
      )}
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
          isUser
            ? "rounded-br-sm bg-[var(--ms-color-pink-primary)] text-white"
            : "rounded-bl-sm border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] text-[var(--ms-color-text-primary)]"
        }`}
      >
        {message.content || ""}
        {streaming && (
          <span className="ml-1 inline-flex gap-0.5 align-middle">
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}

export default function MavenHomeDashboard() {
  const [campaigns, setCampaigns] = useState([]);
  const [assets, setAssets] = useState([]);
  const [publishingDrafts, setPublishingDrafts] = useState([]);
  const [mavenMessage, setMavenMessage] = useState("");
  const [mavenMessages, setMavenMessages] = useState([]);
  const [mavenBusy, setMavenBusy] = useState(false);
  const [mavenReady, setMavenReady] = useState(false);
  const [mavenSessionId, setMavenSessionId] = useState(null);
  const mavenClientRef = useRef(null);
  const mavenTranscriptRef = useRef(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const client = createDesignAgentConversationClient();
    mavenClientRef.current = client;
    let cancelled = false;

    const bootstrap = async () => {
      const controlled = await client.fetchControlledExecutionFlag();
      if (cancelled) return;
      setMavenReady(controlled);
      if (!controlled) return;

      const stored = readStoredDashboardSessionId(window.localStorage);
      if (!stored) return;
      try {
        const history = await client.loadMessages(stored);
        if (cancelled) return;
        setMavenSessionId(stored);
        setMavenMessages(history);
      } catch {
        // The stored session is invalid, unowned, or unavailable. Recover
        // safely: drop it and create a fresh owned session on next send.
        clearStoredDashboardSessionId(window.localStorage);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Scroll the transcript only; restoring history must not pull the home page down.
    const transcript = mavenTranscriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [mavenMessages, mavenBusy]);

  const submitMavenMessage = async (event) => {
    event.preventDefault();
    const client = mavenClientRef.current;
    const text = mavenMessage.trim();
    if (!client || !text || mavenBusy || !mavenReady) return;

    setMavenMessage("");
    setMavenBusy(true);
    const assistantIndex = mavenMessages.length + 1;
    setMavenMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);

    try {
      let sessionId = mavenSessionId;
      if (!sessionId) {
        sessionId = await client.createSession();
        setMavenSessionId(sessionId);
        storeDashboardSessionId(window.localStorage, sessionId);
      }

      const result = await client.send({
        conversationId: sessionId,
        message: text,
        onDelta: (delta) => {
          setMavenMessages((prev) => {
            const arr = [...prev];
            if (arr[assistantIndex]) {
              arr[assistantIndex] = { ...arr[assistantIndex], content: (arr[assistantIndex].content || "") + delta };
            }
            return arr;
          });
        },
      });

      setMavenMessages((prev) => {
        const arr = [...prev];
        if (arr[assistantIndex]) {
          arr[assistantIndex] = { ...arr[assistantIndex], content: result.reply || arr[assistantIndex].content };
        }
        return arr;
      });
      // Persist ONLY the server-sanitized persistedMessages from the done event.
      client.persist(sessionId, result.persistedMessages).catch(() => {});
    } catch (error) {
      setMavenMessages((prev) => {
        const arr = [...prev];
        if (arr[assistantIndex]) {
          arr[assistantIndex] = {
            ...arr[assistantIndex],
            content: `❌ ${error?.message || "Conversation failed. Please try again."}`,
          };
        }
        return arr;
      });
    } finally {
      setMavenBusy(false);
    }
  };

  useEffect(() => {
    try { setCampaigns(CampaignStore.list()); } catch { setCampaigns([]); }
    try { setAssets(localAssetManager.listAssets()); } catch { setAssets([]); }
    try { setPublishingDrafts(readPublishingDrafts()); } catch { setPublishingDrafts([]); }
  }, []);

  const recentAssets = useMemo(() => [...assets].sort((a, b) => assetTimestamp(b) - assetTimestamp(a)).slice(0, 3), [assets]);
  const needsApprovalCount = campaigns.filter((campaign) => (campaign.status || "") === "review").length;
  const inProgressCount = campaigns.filter((campaign) => ["generating", "queued", "planning"].includes(campaign.status || "")).length;
  const hasMavenConversation = mavenMessages.length > 0;
  const mavenComposer = (
    <form className={`${styles.composer} ${hasMavenConversation ? styles.composerCompact : ""}`} onSubmit={submitMavenMessage}>
      <label htmlFor="maven-creation-prompt" className={styles.promptLabel}>{hasMavenConversation ? "Continue your conversation with Maven" : "What would you like Maven to create?"}</label>
      <textarea
        id="maven-creation-prompt"
        value={mavenMessage}
        onChange={(event) => setMavenMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form.requestSubmit();
          }
        }}
        placeholder="Describe your idea, your audience, or the story you want to tell…"
        aria-describedby="maven-composer-status"
        disabled={!mavenReady || mavenBusy}
        rows={hasMavenConversation ? 2 : 3}
      />
      <div className={styles.composerFooter}>
        <span id="maven-composer-status" role="status">
          {mavenBusy ? "Maven is creating a response…" : mavenReady ? "Create with Maven" : "Maven chat is unavailable right now. You can still open a studio above."}
        </span>
        <button
          type="submit"
          aria-label={mavenBusy ? "Maven is responding" : "Send message to MavenSync"}
          disabled={!mavenReady || mavenBusy || !mavenMessage.trim()}
          className={styles.send}
        ><Icon type="arrow" size={18} /></button>
      </div>
    </form>
  );

  return (
    <ExperiencePage className={styles.page}>
      <section aria-label="Maven Creator OS" className={styles.frontDoor}>
        <h1 className={styles.identity}>MAVEN <span>CREATOR OS</span></h1>
        <nav aria-label="Creation studios" className={styles.pillRow}>
          {QUICK_ACTIONS.map((item) => <QuickActionButton key={item.href} item={item} />)}
          <details ref={moreRef} className={styles.more} onKeyDown={(event) => {
            if (event.key === "Escape") {
              moreRef.current.open = false;
              moreRef.current.querySelector("summary")?.focus();
            }
          }}>
            <summary className={styles.pill}>More <span aria-hidden="true">＋</span></summary>
            <nav aria-label="More studios" className={styles.morePanel}>
              {MORE_ACTIONS.map((item) => <QuickActionButton key={item.href} item={item} />)}
            </nav>
          </details>
        </nav>

        {!hasMavenConversation && mavenComposer}

        <nav aria-label="Creative context" className={styles.contextRow}>
          <a href="/studio/knowledge-center"><Icon type="content" size={13} /> Open Knowledge Center</a>
          <a href="/studio/campaigns"><Icon type="library" size={13} /> View campaigns{campaigns.length ? ` · ${campaigns.length}` : ""}</a>
        </nav>
        <nav aria-label="Manage your creative work" className={`${styles.pillRow} ${styles.secondaryRow}`}>
          {SECONDARY_ACTIONS.map((item) => <QuickActionButton key={item.href} item={item} />)}
        </nav>

        {hasMavenConversation && (
          <>
            <section aria-label="Maven conversation" className={styles.conversation}>
              <h2>Your conversation with Maven</h2>
              <div ref={mavenTranscriptRef} className={styles.transcript} role="log" aria-live="polite" tabIndex={0} aria-label="Conversation history">
                {mavenMessages.map((message, index) => (
                  <MavenBubble key={`${index}-${message.role}`} message={message}
                    streaming={mavenBusy && index === mavenMessages.length - 1 && message.role === "assistant"} />
                ))}
              </div>
            </section>
            {mavenComposer}
          </>
        )}
      </section>

      <div className={styles.operations}>
        <section aria-label="Continue working" className="mt-6 pb-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.01em]">Continue Working</h2>
              <p className="mt-1 text-xs text-[var(--ms-color-text-muted)]">Pick up where you left off.</p>
            </div>
            {recentAssets.length > 0 && (
              <a href="/studio/overview" className="text-[10px] font-medium text-[var(--ms-color-gold-primary)] hover:text-[var(--ms-color-text-primary)]">All recent work</a>
            )}
          </div>
          {recentAssets.length ? (
            <div className="mt-3 grid gap-2.5 md:grid-cols-3">
              {recentAssets.map((asset, index) => (
                <a
                  key={asset.id || index}
                  href={assetRoute(asset)}
                  className="group flex items-center gap-3 rounded-[var(--ms-radius-card-small)] border border-[var(--ms-color-border-subtle)] bg-[var(--ms-color-panel)] p-2.5 transition-[border-color,transform] duration-[var(--ms-motion-card)] hover:-translate-y-px hover:border-[var(--ms-color-border-emphasized)]"
                >
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--ms-color-background-elevated)] text-[var(--ms-color-gold-muted)]">
                    {assetPreview(asset) ? <img src={assetPreview(asset)} alt="" className="h-full w-full object-cover transition-transform duration-[var(--ms-motion-card)] group-hover:scale-[1.03]" /> : <Icon type="library" size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{assetLabel(asset)}</span>
                    <span className="mt-0.5 block truncate text-[9px] uppercase tracking-[0.13em] text-[var(--ms-color-text-muted)]">{titleCase(asset.kind || asset.metadata?.assetType || "Creative")} · {relativeTime(assetTimestamp(asset))}</span>
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <WorkspaceCard className="mt-3 border-dashed">
              <p className="text-xs font-medium">Nothing in progress yet</p>
              <p className="mt-1 text-[10px] text-[var(--ms-color-text-muted)]">Start with a quick action above — your latest work will appear here.</p>
            </WorkspaceCard>
          )}
        </section>
        {/* Operational information */}
        <section aria-label="Needs your attention" className="mt-6">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">Needs Your Attention</h2>
          <p className="mt-1 text-xs text-[var(--ms-color-text-muted)]">Production state across your work.</p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <AttentionTile
              icon="approval"
              label="Needs Approval"
              value={needsApprovalCount}
              zeroDetail="Nothing is waiting for your review."
              actionHref="/studio/campaigns"
              actionLabel="Review campaigns"
            />
            <AttentionTile
              icon="publish"
              label="Ready to Publish"
              value={publishingDrafts.length}
              zeroDetail="No drafts waiting in Publishing."
              actionHref="/studio/publishing"
              actionLabel="Open Publishing"
            />
            <AttentionTile
              icon="progress"
              label="In Progress"
              value={inProgressCount}
              zeroDetail="No active production right now."
              actionHref="/studio/campaigns"
              actionLabel="Open Campaigns"
            />
          </div>
        </section>

      </div>
    </ExperiencePage>
  );
}

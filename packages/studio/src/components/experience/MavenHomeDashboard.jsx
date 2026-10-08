"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "../../lib/providers/ProviderRegistry.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  clearStoredDashboardSessionId,
  createDesignAgentConversationClient,
  readStoredDashboardSessionId,
  storeDashboardSessionId,
} from "design-agent";
import { ExperiencePage } from "./ExperienceComponents.jsx";
import styles from "./MavenHomeDashboard.module.css";

const DASHBOARD_CHAT_LIST_STORAGE_KEY = "mavensync_dashboard_chat_sessions";

function readDashboardChatList(storage = window.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(DASHBOARD_CHAT_LIST_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((chat) => chat && typeof chat.id === "string") : [];
  } catch {
    return [];
  }
}

function saveDashboardChat(storage, chat) {
  const chats = readDashboardChatList(storage);
  const next = [{ ...chat, title: chat.title?.trim() || "Maven conversation", updatedAt: new Date().toISOString() }, ...chats.filter((item) => item.id !== chat.id)];
  storage.setItem(DASHBOARD_CHAT_LIST_STORAGE_KEY, JSON.stringify(next));
  return next;
}

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
    chat: <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    skills: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z" /></>,
    connectors: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /><path d="M10 6.5h4a2 2 0 0 1 2 2v5.5M6.5 10v4a2 2 0 0 0 2 2H14" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    attach: <><path d="m21.4 11.1-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
    chevron: <><path d="m7 10 5 5 5-5" /></>,
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
  { title: "Creative Library", icon: "image", href: "/studio/asset-library" },
  { title: "Knowledge", icon: "content", href: "/studio/knowledge-center" },
];

const WORKSPACE_NAVIGATION = [
  { title: "Workflows", icon: "repurpose", href: "/studio/workflows" },
  { title: "Publishing", icon: "publish", href: "/studio/publishing" },
  { title: "Agents", icon: "design", href: "/studio/agents" },
  { title: "Projects", icon: "library", href: "/studio/campaigns" },
];

function QuickActionButton({ item }) {
  return (
    <a href={item.href} className={styles.pill}>
      <Icon type={item.icon} size={14} />
      <span>{item.title}</span>
    </a>
  );
}

function MavenBubble({ message, streaming }) {
  const isUser = message.role === "user";
  const markdownComponents = {
    a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
  };
  return (
    <article className={`${styles.messageRow} ${isUser ? styles.userRow : styles.assistantRow}`}>
      {!isUser && <span className={styles.messageMark} aria-hidden="true"><Icon type="maven" size={15} /></span>}
      <div className={styles.messageContent}>
        <p className={styles.messageIdentity}>{isUser ? "You" : "Maven"}</p>
        <div className={`${styles.messageBody} ${isUser ? styles.userMessage : styles.assistantMessage}`}>
          {isUser ? (
            <>
              {message.content || ""}
              {message.attachments?.length ? <div className={styles.messageAttachments}>
                {message.attachments.map((attachment) => <span key={attachment.attachmentId || attachment.asset_label || attachment.assetId} className={styles.messageAttachment}>
                  {attachment.previewUrl ? <img src={attachment.previewUrl} alt="" /> : <Icon type="image" size={13} />}
                  {attachment.filename || attachment.attachmentId || attachment.asset_label || "Image reference"}
                </span>)}
              </div> : null}
            </>
          ) : (
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml>
                {message.content || ""}
              </ReactMarkdown>
            </div>
          )}
          {streaming && (
            <span className="ml-1 inline-flex gap-0.5 align-middle" aria-label="Maven is responding">
              <span className="h-1 w-1 animate-pulse rounded-full bg-current" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default function MavenHomeDashboard({ apiKey = null, onOpenSettings }) {
  const [mavenMessage, setMavenMessage] = useState("");
  const [mavenMessages, setMavenMessages] = useState([]);
  const [savedChats, setSavedChats] = useState([]);
  const [chatError, setChatError] = useState(null);
  const [mavenBusy, setMavenBusy] = useState(false);
  const [mavenReady, setMavenReady] = useState(false);
  const [mavenSessionId, setMavenSessionId] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState(null);
  const [draggingImage, setDraggingImage] = useState(false);
  const mavenClientRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const sessionCreationRef = useRef(null);
  const moreRef = useRef(null);
  const transcriptRef = useRef(null);
  const composerInputRef = useRef(null);

  useEffect(() => {
    const client = createDesignAgentConversationClient();
    mavenClientRef.current = client;
    let cancelled = false;

    const bootstrap = async () => {
      const chats = readDashboardChatList(window.localStorage);
      if (!cancelled) setSavedChats(chats);
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
        const saved = saveDashboardChat(window.localStorage, { id: stored, title: history.find((message) => message.role === "user")?.content?.slice(0, 72) });
        setSavedChats(saved);
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

  const ensureMavenSession = async () => {
    if (mavenSessionId) return mavenSessionId;
    if (sessionCreationRef.current) return sessionCreationRef.current;
    const client = mavenClientRef.current;
    if (!client) throw new Error("Maven chat is unavailable right now.");
    const pending = client.createSession().then((sessionId) => {
      setMavenSessionId(sessionId);
      storeDashboardSessionId(window.localStorage, sessionId);
      return sessionId;
    }).finally(() => {
      if (sessionCreationRef.current === pending) sessionCreationRef.current = null;
    });
    sessionCreationRef.current = pending;
    return pending;
  };

  const addImageFiles = async (fileList) => {
    const selectedImages = Array.from(fileList || []).filter((file) => file.type?.startsWith("image/"));
    if (!selectedImages.length) {
      if (fileList?.length) setAttachmentError("Choose an image file to attach.");
      return;
    }
    const capacity = Math.max(0, 8 - attachments.length);
    const imageFiles = selectedImages.slice(0, capacity);
    if (!capacity || imageFiles.length < selectedImages.length) setAttachmentError("You can attach up to 8 images per message.");
    else setAttachmentError(null);
    for (const file of imageFiles) {
      if (file.size > 25 * 1024 * 1024) {
        setAttachmentError(`${file.name || "Image"} exceeds the 25 MB image limit.`);
        continue;
      }
      const localId = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      setAttachments((current) => [...current, { localId, filename: file.name || "Image", previewUrl, status: "uploading" }]);
      try {
        const url = await uploadFile(apiKey, file);
        setAttachments((current) => current.map((attachment) => attachment.localId === localId
          ? { ...attachment, url, status: "ready" }
          : attachment));
      } catch (error) {
        URL.revokeObjectURL(previewUrl);
        setAttachments((current) => current.filter((attachment) => attachment.localId !== localId));
        setAttachmentError(error?.message || "Image upload failed. Please try again.");
      }
    }
  };

  const removeAttachment = (localId) => {
    const attachment = attachments.find((item) => item.localId === localId);
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    setAttachments((current) => current.filter((item) => item.localId !== localId));
  };

  const submitMavenMessage = async (event) => {
    event.preventDefault();
    const client = mavenClientRef.current;
    const text = mavenMessage.trim();
    if (!client || !text || mavenBusy || !mavenReady || attachments.some((attachment) => attachment.status !== "ready")) return;

    setMavenMessage("");
    setChatError(null);
    setAttachmentError(null);
    setMavenBusy(true);
    const assistantIndex = mavenMessages.length + 1;
    setMavenMessages((prev) => [...prev, { role: "user", content: text, attachments: [] }, { role: "assistant", content: "" }]);

    try {
      const sessionId = await ensureMavenSession();
      const headers = { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) };
      const attachmentIds = [];
      const resolvedAttachments = [];
      for (const attachment of attachments) {
        let attachmentId = attachment.attachmentId;
        if (!attachmentId) {
          const response = await fetch(`/api/v1/creative-agent/sessions/${encodeURIComponent(sessionId)}/assets`, {
            method: "POST",
            credentials: "same-origin",
            headers,
            body: JSON.stringify({ url: attachment.url, kind: "image", source_tool: "upload" }),
          });
          const registered = await response.json().catch(() => null);
          if (!response.ok || !registered?.asset_label) {
            throw new Error(registered?.error || "Unable to register this image with the conversation.");
          }
          attachmentId = registered.asset_label;
          setAttachments((current) => current.map((item) => item.localId === attachment.localId
            ? { ...item, attachmentId }
            : item));
        }
        attachmentIds.push(attachmentId);
        resolvedAttachments.push({ attachmentId, filename: attachment.filename });
      }
      const sentAttachments = resolvedAttachments;
      setMavenMessages((prev) => {
        const userIndex = prev.length - 2;
        if (userIndex < 0 || prev[userIndex]?.role !== "user") return prev;
        const next = [...prev];
        next[userIndex] = { ...next[userIndex], attachments: sentAttachments };
        return next;
      });
      const saved = saveDashboardChat(window.localStorage, { id: sessionId, title: mavenMessages.find((message) => message.role === "user")?.content?.slice(0, 72) || text.slice(0, 72) });
      setSavedChats(saved);

      const result = await client.send({
        conversationId: sessionId,
        message: text,
        attachments: attachmentIds,
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
        if (arr[assistantIndex - 1] && result.persistedMessages?.[0]) arr[assistantIndex - 1] = result.persistedMessages[0];
        if (arr[assistantIndex]) {
          arr[assistantIndex] = { ...arr[assistantIndex], content: result.reply || arr[assistantIndex].content };
        }
        return arr;
      });
      // Persist ONLY the server-sanitized persistedMessages from the done event.
      client.persist(sessionId, result.persistedMessages).catch(() => {});
      attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      setAttachments([]);
    } catch (error) {
      setMavenMessage(text);
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

  const hasMavenConversation = mavenMessages.length > 0;

  useEffect(() => {
    const textarea = composerInputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 192)}px`;
  }, [mavenMessage, hasMavenConversation]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [mavenMessages, mavenBusy]);

  const startNewChat = () => {
    if (mavenBusy || attachments.some((attachment) => attachment.status === "uploading")) return;
    if (mavenSessionId) {
      const title = mavenMessages.find((message) => message.role === "user")?.content?.slice(0, 72);
      if (title) setSavedChats(saveDashboardChat(window.localStorage, { id: mavenSessionId, title }));
    }
    clearStoredDashboardSessionId(window.localStorage);
    setMavenSessionId(null);
    setMavenMessages([]);
    setMavenMessage("");
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    setAttachments([]);
    setAttachmentError(null);
    setChatError(null);
  };

  const openSavedChat = async (chat) => {
    if (attachments.length) {
      setAttachmentError("Send or remove the attached image before switching chats.");
      return;
    }
    if (mavenBusy || chat.id === mavenSessionId) {
      focusCurrentChat();
      return;
    }
    setMavenBusy(true);
    setChatError(null);
    try {
      const messages = await mavenClientRef.current.loadMessages(chat.id);
      setMavenSessionId(chat.id);
      storeDashboardSessionId(window.localStorage, chat.id);
      setMavenMessages(messages);
    } catch (error) {
      setChatError(error?.message || "Unable to reopen this conversation.");
    } finally {
      setMavenBusy(false);
    }
  };

  const focusCurrentChat = () => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
    composerInputRef.current?.focus();
  };

  const mavenComposer = (
    <form className={`${styles.composer} ${draggingImage ? styles.composerDragging : ""}`} onSubmit={submitMavenMessage}
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === "file")) setDraggingImage(true); }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === "file")) setDraggingImage(true); }}
      onDragLeave={(event) => { event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget)) setDraggingImage(false); }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDraggingImage(false); void addImageFiles(event.dataTransfer.files); }}>
      <input ref={attachmentInputRef} type="file" accept="image/*" multiple className="sr-only" aria-label="Choose images to attach" onChange={(event) => { void addImageFiles(event.target.files); event.target.value = ""; }} />
      {attachments.length ? <div className={styles.attachmentList} aria-label="Attached images">
        {attachments.map((attachment) => <div key={attachment.localId} className={styles.attachmentPreview}>
          <img src={attachment.previewUrl} alt={attachment.filename} />
          <span title={attachment.filename}>{attachment.filename}</span>
          {attachment.status === "uploading" ? <small>Uploading…</small> : null}
          <button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => removeAttachment(attachment.localId)} disabled={mavenBusy || attachment.status === "uploading"}><Icon type="close" size={13} /></button>
        </div>)}
      </div> : null}
      {attachmentError ? <p className={styles.attachmentError} role="alert">{attachmentError}</p> : null}
      <div className={styles.composerInputRow}>
        <label htmlFor="maven-creation-prompt" className="sr-only">Message Maven</label>
        <textarea
          ref={composerInputRef}
          id="maven-creation-prompt"
          value={mavenMessage}
          onChange={(event) => setMavenMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form.requestSubmit();
            }
          }}
          placeholder="Message Maven…"
          aria-describedby="maven-composer-status"
          disabled={!mavenReady || mavenBusy}
          rows={1}
        />
      </div>
      <div className={styles.composerFooter}>
        <div className={styles.composerTools}>
          <button type="button" className={styles.attachButton} aria-label="Attach images" title="Attach images" onClick={() => attachmentInputRef.current?.click()} disabled={!mavenReady || mavenBusy}>
            <Icon type="attach" size={17} />
          </button>
          <span className={styles.modelPill} title="Server-managed conversation intelligence"><Icon type="sparkle" size={14} /> Maven Intelligence</span>
        </div>
        <div className={styles.composerSubmitGroup}>
          <span id="maven-composer-status" role="status" className={styles.composerStatus}>
            {mavenBusy ? "Maven is thinking…" : mavenReady ? "Enter to send · Shift + Enter for a new line" : "Maven chat is unavailable right now."}
          </span>
          <button
            type="submit"
            aria-label={mavenBusy ? "Maven is responding" : "Send message to Maven"}
            disabled={!mavenReady || mavenBusy || !mavenMessage.trim() || attachments.some((attachment) => attachment.status !== "ready")}
            className={styles.send}
          ><Icon type="arrow" size={18} /></button>
        </div>
      </div>
      <div className={styles.attachmentSlot} aria-live="polite" />
    </form>
  );

  return (
    <ExperiencePage className={styles.page}>
      <div className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Maven Workspace sidebar">
          <a href="/studio" className={styles.brand} aria-label="Maven Workspace home">
            <span className={styles.brandMark}>M</span>
            <span><img className={styles.brandLogo} src="/mavensync-logo.png" alt="MavenSync" /><small>Workspace</small></span>
          </a>
          <button type="button" className={styles.newChat} aria-label="New Chat" onClick={startNewChat} disabled={mavenBusy}>
            <Icon type="plus" size={18} /><span>New Chat</span>
          </button>
          <nav className={styles.sidebarNav} aria-label="Workspace navigation">
            <p className={styles.navHeading}>Workspace</p>
            <button type="button" className={`${styles.navItem} ${hasMavenConversation ? "" : styles.navItemActive}`} aria-label="Chats" onClick={focusCurrentChat}>
              <Icon type="chat" size={17} /><span>Chats</span>
              {hasMavenConversation ? <span className={styles.navCount}>1</span> : null}
            </button>
            {WORKSPACE_NAVIGATION.map((item) => (
              <a key={item.href} className={styles.navItem} href={item.href} aria-label={item.title} title={item.title}>
                <Icon type={item.icon} size={17} /><span>{item.title}</span>
              </a>
            ))}
          </nav>
          <div className={styles.chatList}>
            <div className={styles.chatListHeading}><span>Recent chats</span><Icon type="chevron" size={14} /></div>
            {savedChats.length ? savedChats.map((chat) => (
              <button key={chat.id} type="button" className={`${styles.chatEntry} ${chat.id === mavenSessionId ? styles.chatEntryActive : ""}`} onClick={() => void openSavedChat(chat)} disabled={mavenBusy}>
                <Icon type="chat" size={14} />
                <span>{chat.title || "Maven conversation"}</span>
              </button>
            )) : <p className={styles.emptyChats}>Your conversations will show up here.</p>}
          </div>
          <div className={styles.sidebarFooter}>
            <a href="/studio/overview"><Icon type="library" size={16} /><span>Workspace overview</span></a>
            {onOpenSettings ? <button type="button" aria-label="Settings" onClick={onOpenSettings}><Icon type="connectors" size={16} /><span>Settings</span></button> : null}
            <p>Creative work, connected.</p>
          </div>
        </aside>

        <section className={styles.chatWorkspace} aria-label="Maven chat workspace">
          <div className={styles.canvasHeader}>
            <span className={styles.statusDot} aria-hidden="true" />
            <span>{hasMavenConversation ? "Maven conversation" : "Maven Workspace"}</span>
            <a href="/studio/overview" aria-label="Open workspace overview">···</a>
          </div>
          {chatError ? <p className={styles.chatError} role="alert">{chatError}</p> : null}
          {!hasMavenConversation ? (
            <div className={styles.welcome}>
              <span className={styles.welcomeMark}><Icon type="maven" size={22} /></span>
              <h1>What are we creating today?</h1>
              <p>Bring an idea, a question, or a half-formed thought. We’ll shape it together.</p>
            </div>
          ) : (
            <div ref={transcriptRef} className={styles.transcript} role="log" aria-live="polite" tabIndex={0} aria-label="Conversation history">
              <div className={styles.transcriptInner}>
                {mavenMessages.map((message, index) => (
                  <MavenBubble key={`${index}-${message.role}`} message={message}
                    streaming={mavenBusy && index === mavenMessages.length - 1 && message.role === "assistant"} />
                ))}
              </div>
            </div>
          )}
          {mavenBusy && !hasMavenConversation ? <p className={styles.statusLine} role="status">Maven is preparing a response…</p> : null}
          <div className={styles.composerDock}>
            {mavenComposer}
            {!hasMavenConversation ? (
              <nav className={styles.suggestions} aria-label="Start in a studio">
                {QUICK_ACTIONS.slice(0, 4).map((item) => <QuickActionButton key={item.href} item={item} />)}
                <details ref={moreRef} className={styles.more} onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    moreRef.current.open = false;
                    moreRef.current.querySelector("summary")?.focus();
                  }
                }}>
                  <summary className={styles.pill}>More <span aria-hidden="true">＋</span></summary>
                  <nav aria-label="More studios" className={styles.morePanel}>
                    {MORE_ACTIONS.map((item) => <QuickActionButton key={item.href} item={item} />)}
                    {SECONDARY_ACTIONS.map((item) => <QuickActionButton key={item.href} item={item} />)}
                  </nav>
                </details>
              </nav>
            ) : null}
          </div>
        </section>
      </div>
    </ExperiencePage>
  );
}

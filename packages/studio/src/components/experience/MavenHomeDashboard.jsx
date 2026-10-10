"use client";

import { useEffect, useRef, useState } from "react";
import { uploadFile } from "../../lib/providers/ProviderRegistry.js";
import { copyAssistantResponseText } from "../../lib/copyAssistantResponse.js";
import { downloadAsset } from "../../lib/assets/assetManager.js";
import { assetPreviewKind } from "../../lib/assets/assetPreview.js";
import { fetchDurableCreativeAssets } from "../../lib/intelligence/AssetLibraryService.js";
import { extractGeneratedImageUrls, isImageEditRequest, isImageGenerationRequest } from "../../lib/mavenImageIntent.js";
import { extractGeneratedVideoUrls, isImageToVideoRequest, isVideoGenerationRequest } from "../../lib/mavenVideoIntent.js";
import { extractGeneratedAudioUrls, isAudioGenerationRequest } from "../../lib/mavenAudioIntent.js";
import { isLipSyncRequest } from "../../lib/mavenLipSyncIntent.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  clearStoredDashboardSessionId,
  createDesignAgentConversationClient,
  readStoredDashboardSessionId,
  storeDashboardSessionId,
} from "design-agent";
import { createCreatorProjectClient } from "../../lib/campaigns/creatorProjectClient.js";
import { ExperiencePage } from "./ExperienceComponents.jsx";
import styles from "./MavenHomeDashboard.module.css";

const DASHBOARD_CHAT_LIST_STORAGE_KEY = "mavensync_dashboard_chat_sessions";
const IMAGE_REFERENCE_HANDOFF_KEY = "mavensync_image_reference_handoff";

// Hands a Maven-uploaded image to Image Studio as its reference (read once on mount).
function openImageInStudio(url) {
  if (!url) return;
  window.localStorage.setItem(IMAGE_REFERENCE_HANDOFF_KEY, JSON.stringify({ urls: [url] }));
  window.location.assign("/studio/image");
}

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

// Renames an existing entry in place. Only the stored title changes; the
// session id, list order and every other field are preserved.
function renameDashboardChat(storage, chatId, title) {
  const next = readDashboardChatList(storage).map((chat) => (chat.id === chatId
    ? { ...chat, title: title?.trim() || chat.title, updatedAt: new Date().toISOString() }
    : chat));
  storage.setItem(DASHBOARD_CHAT_LIST_STORAGE_KEY, JSON.stringify(next));
  return next;
}

// Removes only the local list entry. The upstream session is deleted by the
// caller through the ownership-checked conversation client; nothing here touches
// project or session assets.
function removeDashboardChat(storage, chatId) {
  const next = readDashboardChatList(storage).filter((chat) => chat.id !== chatId);
  storage.setItem(DASHBOARD_CHAT_LIST_STORAGE_KEY, JSON.stringify(next));
  return next;
}

// One shared project client for the whole dashboard, resolved lazily so a render
// on a host without fetch cannot break the chat screen. If no client can be
// created, every project affordance degrades to "no project".
function mavenProjectClient(ref) {
  if (!ref.current) {
    try {
      ref.current = createCreatorProjectClient();
    } catch {
      ref.current = null;
    }
  }
  return ref.current;
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
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5M12 15V3" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
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

function MavenBubble({ message, streaming, previousPrompt = "", onVariation, onRefine }) {
  const isUser = message.role === "user";
  const imageUrls = isUser ? [] : extractGeneratedImageUrls(message.content || "");
  const videoUrls = isUser ? [] : extractGeneratedVideoUrls(message.content || "");
  const audioUrls = isUser ? [] : extractGeneratedAudioUrls(message.content || "");
  const referenceIds = !isUser && Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => typeof attachment === "string" ? attachment : attachment?.attachmentId).filter((id) => typeof id === "string" && /^asset_[A-Za-z0-9_-]{1,190}$/.test(id))
    : [];
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const copyResetRef = useRef(null);
  const markdownComponents = {
    a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
  };
  useEffect(() => () => window.clearTimeout(copyResetRef.current), []);
  const handleDownload = async (url, index, kind = "image") => {
    setDownloadError("");
    const extension = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "jpg";
    try {
      const result = await downloadAsset(url, { filename: `maven-${kind}-${Date.now()}-${index + 1}.${extension}`, kind, prefix: "maven" });
      if (!result?.ok) setDownloadError(kind === "image" ? "This image could not be downloaded." : `This ${kind} is no longer available to download.`);
    } catch {
      setDownloadError(`This ${kind} could not be downloaded. Please try again later.`);
    }
  };
  const handleCopy = async () => {
    try {
      await copyAssistantResponseText(message.content);
      setCopied(true);
      window.clearTimeout(copyResetRef.current);
      copyResetRef.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
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
                  {attachment.previewUrl && attachment.kind === "image" ? <img src={attachment.previewUrl} alt="" /> : <Icon type={attachment.kind === "video" ? "video" : attachment.kind === "audio" ? "audio" : "image"} size={13} />}
                  {attachment.filename || attachment.attachmentId || attachment.asset_label || "Media reference"}
                  {attachment.url && attachment.kind === "image" ? <button type="button" className={styles.useReferenceAction} onClick={() => openImageInStudio(attachment.url)}>Use in Image Studio</button> : null}
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
        {!isUser && !streaming && message.content?.trim() ? (
          <div className={styles.messageActions}>
            <button type="button" className={styles.copyAction} onClick={handleCopy} aria-live="polite" aria-label={copied ? "Copied Maven response" : "Copy Maven response"}>
              <Icon type={copied ? "check" : "copy"} size={13} />
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        ) : null}
        {!isUser && !streaming && audioUrls.length ? (
          <div className={styles.videoResultActions}>
            {audioUrls.map((url, index) => (
              <div key={url} className={styles.audioResult}>
                <audio controls preload="metadata" src={url} aria-label={`Generated audio ${index + 1}`} />
                <button type="button" className={styles.imageAction} onClick={() => void handleDownload(url, index, "audio")}>
                  <Icon type="download" size={13} /><span>Download audio</span>
                </button>
              </div>
            ))}
            {downloadError ? <span className={styles.imageActionError} role="alert">{downloadError}</span> : null}
          </div>
        ) : null}
        {!isUser && !streaming && videoUrls.length ? (
          <div className={styles.videoResultActions}>
            {videoUrls.map((url, index) => (
              <div key={url} className={styles.videoResult}>
                <video controls playsInline preload="metadata" src={url} aria-label={`Generated video ${index + 1}`} />
                <button type="button" className={styles.imageAction} onClick={() => void handleDownload(url, index, "video")}>
                  <Icon type="download" size={13} /><span>Download video</span>
                </button>
              </div>
            ))}
            {downloadError ? <span className={styles.imageActionError} role="alert">{downloadError}</span> : null}
          </div>
        ) : null}
        {!isUser && !streaming && imageUrls.length ? (
          <div className={styles.imageActions}>
            {downloadError ? <span className={styles.imageActionError} role="alert">{downloadError}</span> : null}
            {imageUrls.map((url, index) => (
              <button key={url} type="button" className={styles.imageAction} aria-label={`Download image ${index + 1}`}
                onClick={() => void handleDownload(url, index)}>
                <Icon type="download" size={13} />
                <span>Download</span>
              </button>
            ))}
            {onVariation ? (
              <button type="button" className={styles.imageAction} onClick={() => onVariation(previousPrompt, referenceIds[0], imageUrls[0])}>
                <Icon type="sparkle" size={13} />
                <span>Another variation</span>
              </button>
            ) : null}
            {onRefine ? (
              <button type="button" className={styles.imageAction} onClick={() => onRefine(referenceIds[0], imageUrls[0])}>
                <Icon type="design" size={13} />
                <span>Refine</span>
              </button>
            ) : null}
          </div>
        ) : null}
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
  const [selectedImageReference, setSelectedImageReference] = useState(null);
  const [attachmentError, setAttachmentError] = useState(null);
  const [libraryChoices, setLibraryChoices] = useState([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [chatMenuId, setChatMenuId] = useState(null);
  const [renamingChatId, setRenamingChatId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [chatActionBusy, setChatActionBusy] = useState(false);
  const [projectList, setProjectList] = useState([]);
  const [chatProjectId, setChatProjectId] = useState(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectError, setProjectError] = useState(null);
  const [projectListError, setProjectListError] = useState(null);
  const mavenClientRef = useRef(null);
  const projectClientRef = useRef(null);
  // Monotonic id for the association read. A read that started before a confirmed
  // write (or before a different conversation) must never apply its answer, or a
  // stale "no project" would replace the project the creator just selected.
  const projectRequestRef = useRef(0);
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

  // The creator's projects, for the selector. A failure is surfaced and the list
  // stays empty; nothing about chatting depends on it.
  useEffect(() => {
    const client = mavenProjectClient(projectClientRef);
    if (!client) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const projects = await client.listProjects();
        if (!cancelled) {
          setProjectList(Array.isArray(projects) ? projects : []);
          setProjectListError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setProjectList([]);
          // Remembered separately from a write failure, so the picker never reports
          // an unreadable list as "this project no longer exists".
          setProjectListError(error?.message || "Your projects are unavailable right now.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The association lives on the session, so it is read per conversation. The
  // client only ever sends the id: the server loads the project's own brand,
  // voice, audience and instructions, so this screen can never inject them.
  useEffect(() => {
    // Each conversation change invalidates earlier reads, so a late answer for a
    // previous chat can never set this chat's project.
    const requestId = projectRequestRef.current + 1;
    projectRequestRef.current = requestId;
    if (!mavenSessionId) {
      setChatProjectId(null);
      return undefined;
    }
    const client = mavenProjectClient(projectClientRef);
    if (!client) {
      setChatProjectId(null);
      return undefined;
    }
    let cancelled = false;
    setProjectBusy(true);
    client.getSessionProject(mavenSessionId)
      .then((association) => {
        if (!cancelled && projectRequestRef.current === requestId) setChatProjectId(association?.projectId || null);
      })
      .catch(() => {
        // An unreadable association is not something the creator must fix: the
        // conversation simply continues as a normal, project-free chat.
        if (!cancelled && projectRequestRef.current === requestId) setChatProjectId(null);
      })
      .finally(() => {
        if (!cancelled && projectRequestRef.current === requestId) setProjectBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mavenSessionId]);

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

  const addMediaFiles = async (fileList) => {
    const selectedMedia = Array.from(fileList || []).filter((file) => /^(image|audio|video)\//i.test(file.type || ""));
    if (!selectedMedia.length) {
      if (fileList?.length) setAttachmentError("Choose an image, audio, or video file to attach.");
      return;
    }
    if (selectedImageReference) setSelectedImageReference(null);
    const capacity = Math.max(0, 8 - attachments.length);
    const mediaFiles = selectedMedia.slice(0, capacity);
    if (!capacity || mediaFiles.length < selectedMedia.length) setAttachmentError("You can attach up to 8 media files per message.");
    else setAttachmentError(null);
    for (const file of mediaFiles) {
      if (file.type.startsWith("image/") && file.size > 25 * 1024 * 1024) {
        setAttachmentError(`${file.name || "Image"} exceeds the 25 MB image limit.`);
        continue;
      }
      const localId = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      setAttachments((current) => [...current, { localId, filename: file.name || "Media file", kind: file.type.split("/")[0], previewUrl, status: "uploading" }]);
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
    if (attachment?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl);
    setAttachments((current) => current.filter((item) => item.localId !== localId));
  };

  const openCreativeLibrary = async () => {
    if (libraryOpen) { setLibraryOpen(false); return; }
    setLibraryOpen(true);
    setLibraryBusy(true);
    setAttachmentError(null);
    try {
      const assets = await fetchDurableCreativeAssets();
      setLibraryChoices(assets.filter((asset) => {
        const kind = assetPreviewKind(asset);
        return ['image', 'video', 'audio'].includes(kind)
          && /^asset_[A-Za-z0-9_-]{1,190}$/.test(String(asset.mavenReferenceId || ''))
          && (/^https:\/\//i.test(asset.storageReference || asset.url || '')
            || /^\/api\/creative-assets\/media\?assetId=/i.test(asset.storageReference || asset.url || ''));
      }));
    } catch {
      setAttachmentError('Creative Library is unavailable right now. Please try again.');
    } finally {
      setLibraryBusy(false);
    }
  };

  const attachLibraryAsset = (asset) => {
    const kind = assetPreviewKind(asset);
    const url = asset.storageReference || asset.url;
    setAttachments((current) => current.some((item) => item.attachmentId === asset.mavenReferenceId)
      ? current : [...current, { localId: asset.mavenReferenceId, attachmentId: asset.mavenReferenceId, filename: asset.title || `Creative Library ${kind}`, kind, url, previewUrl: url, status: 'ready' }]);
    setLibraryOpen(false);
  };

  const submitMavenMessage = async (event, overrideText, explicitReference = null) => {
    event?.preventDefault?.();
    const client = mavenClientRef.current;
    const isOverride = typeof overrideText === "string";
    const text = (isOverride ? overrideText : mavenMessage).trim();
    if (!client || !text || mavenBusy || !mavenReady || attachments.some((attachment) => attachment.status !== "ready")) return;

    if (!isOverride) setMavenMessage("");
    setChatError(null);
    setAttachmentError(null);
    setMavenBusy(true);
    const assistantIndex = mavenMessages.length + 1;
    const pendingStatus = isLipSyncRequest(text) ? "Creating your lip-synced video…" : isAudioGenerationRequest(text) ? "Creating your audio…" : (isVideoGenerationRequest(text) || isImageToVideoRequest(text)) ? "Creating your video…" : (isImageGenerationRequest(text) && attachments.length === 0 ? "Creating your image…" : ((explicitReference || selectedImageReference || (attachments.length === 0 && isImageEditRequest(text))) ? "Refining your image…" : ""));
    const reference = explicitReference || selectedImageReference;
    const priorReferenceIds = reference?.attachmentId ? [reference.attachmentId] : [];
    setMavenMessages((prev) => [...prev, { role: "user", content: text, attachments: [] }, { role: "assistant", content: pendingStatus }]);

    try {
      const sessionId = await ensureMavenSession();
      const headers = { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) };
      const attachmentIds = [...priorReferenceIds];
      const resolvedAttachments = priorReferenceIds.map((attachmentId) => ({ attachmentId, kind: "image", filename: "Previous Maven image" }));
      for (const attachment of attachments) {
        let attachmentId = attachment.attachmentId;
        if (!attachmentId) {
          const response = await fetch(`/api/v1/creative-agent/sessions/${encodeURIComponent(sessionId)}/assets`, {
            method: "POST",
            credentials: "same-origin",
            headers,
            body: JSON.stringify({ url: attachment.url, kind: attachment.kind, source_tool: "upload" }),
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
        resolvedAttachments.push({ attachmentId, kind: attachment.kind, filename: attachment.filename, url: attachment.url });
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
          arr[assistantIndex] = {
            ...arr[assistantIndex],
            ...(result.persistedMessages?.[1] || {}),
            content: result.reply || arr[assistantIndex].content,
          };
        }
        return arr;
      });
      // Persist ONLY the server-sanitized persistedMessages from the done event.
      try {
        const savedTurn = await client.persist(sessionId, result.persistedMessages);
        if (!savedTurn.ok) throw new Error('conversation_save_failed');
      } catch {
        setChatError('The generated media is available, but this chat turn could not be saved. You can reuse saved media from the Creative Library.');
      }
      attachments.forEach((attachment) => { if (attachment.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl); });
      setAttachments([]);
      if (reference) setSelectedImageReference(null);
    } catch (error) {
      if (!isOverride) setMavenMessage(text);
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

  // Select, change or clear the conversation's project. A brand-new chat has no
  // session yet, so its owned session is created first and the association is
  // written through the same ownership-checked endpoint.
  const changeChatProject = async (projectId) => {
    const client = mavenProjectClient(projectClientRef);
    const nextProjectId = projectId || null;
    if (!client || projectBusy) return;
    setProjectError(null);
    setProjectBusy(true);
    try {
      const sessionId = await ensureMavenSession();
      const association = await client.setSessionProject(sessionId, nextProjectId);
      // Only a confirmed association is shown. An unconfirmed write is reported
      // instead of being displayed as if it had been saved.
      if (!association) throw new Error("The project change was not confirmed. Please try again.");
      // The confirmed write wins over any association read still in flight for this
      // session, which may have been issued before the write landed.
      projectRequestRef.current += 1;
      setChatProjectId(association.projectId || null);
    } catch (error) {
      setProjectError(error?.message || "Unable to change this conversation's project. Nothing was saved.");
    } finally {
      setProjectBusy(false);
    }
  };

  const activeChatProject = projectList.find((project) => project.id === chatProjectId) || null;
  // This screen knows which project the conversation is linked to; whether the
  // server could load that project's instructions for a given message is decided
  // server-side and is deliberately not asserted here.
  const chatProjectStatus = projectBusy
    ? "Updating this chat's project…"
    : !chatProjectId
      ? "No project selected — this chat stays general."
      : activeChatProject
        ? `Linked to ${activeChatProject.name} — Maven loads its brand, voice and instructions when the server can.`
        : projectListError
          ? "This chat is linked to a project, but your project list could not be loaded right now."
          : "This chat's project is no longer available — new messages continue without it.";

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
    setChatProjectId(null);
    setProjectError(null);
    attachments.forEach((attachment) => { if (attachment.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl); });
    setAttachments([]);
    setSelectedImageReference(null);
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
      setSelectedImageReference(null);
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

  const beginRenameChat = (chat) => {
    setChatMenuId(null);
    setChatError(null);
    setRenamingChatId(chat.id);
    setRenameValue(chat.title || "Maven conversation");
  };

  const cancelRenameChat = () => {
    setRenamingChatId(null);
    setRenameValue("");
  };

  // Rename writes the name to the upstream session first, then mirrors it into
  // the local list, so a failed rename never leaves the two out of step.
  const submitRenameChat = async (event, chat) => {
    event?.preventDefault?.();
    const client = mavenClientRef.current;
    const title = renameValue.trim();
    if (!client || !title || title === chat.title || chatActionBusy) {
      cancelRenameChat();
      return;
    }
    setChatActionBusy(true);
    setChatError(null);
    try {
      const saved = await client.renameSession(chat.id, title);
      setSavedChats(renameDashboardChat(window.localStorage, chat.id, saved));
      cancelRenameChat();
    } catch (error) {
      setChatError(error?.message || "Unable to rename this conversation.");
    } finally {
      setChatActionBusy(false);
    }
  };

  // Delete removes the conversation, never its project assets: this issues one
  // session DELETE through the ownership-checked client and nothing else.
  const deleteSavedChat = async (chat) => {
    const client = mavenClientRef.current;
    if (!client || chatActionBusy) return;
    if (!window.confirm(`Delete “${chat.title || "this conversation"}”? This cannot be undone.`)) return;
    setChatMenuId(null);
    setChatActionBusy(true);
    setChatError(null);
    const wasOpen = chat.id === mavenSessionId;
    try {
      await client.deleteSession(chat.id);
      setSavedChats(removeDashboardChat(window.localStorage, chat.id));
      if (wasOpen) {
        clearStoredDashboardSessionId(window.localStorage);
        setMavenSessionId(null);
        setMavenMessages([]);
        setSelectedImageReference(null);
      }
    } catch (error) {
      setChatError(error?.message || "Unable to delete this conversation.");
    } finally {
      setChatActionBusy(false);
    }
  };

  // The row menu dismisses on an outside press or Escape. Presses inside the row
  // are ignored so the toggle button and the menu items keep their own clicks.
  useEffect(() => {
    if (!chatMenuId) return undefined;
    const dismissOnPointerDown = (event) => {
      if (!event.target?.closest?.("[data-chat-row]")) setChatMenuId(null);
    };
    const dismissOnKeyDown = (event) => {
      if (event.key === "Escape") setChatMenuId(null);
    };
    document.addEventListener("pointerdown", dismissOnPointerDown);
    document.addEventListener("keydown", dismissOnKeyDown);
    return () => {
      document.removeEventListener("pointerdown", dismissOnPointerDown);
      document.removeEventListener("keydown", dismissOnKeyDown);
    };
  }, [chatMenuId]);

  const mavenComposer = (
    <form className={`${styles.composer} ${draggingImage ? styles.composerDragging : ""}`} onSubmit={submitMavenMessage}
      onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === "file")) setDraggingImage(true); }}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (Array.from(event.dataTransfer.items || []).some((item) => item.kind === "file")) setDraggingImage(true); }}
      onDragLeave={(event) => { event.stopPropagation(); if (!event.currentTarget.contains(event.relatedTarget)) setDraggingImage(false); }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDraggingImage(false); void addMediaFiles(event.dataTransfer.files); }}>
      <input ref={attachmentInputRef} type="file" accept="image/*,audio/*,video/*" multiple className="sr-only" aria-label="Choose media to attach" onChange={(event) => { void addMediaFiles(event.target.files); event.target.value = ""; }} />
      {selectedImageReference ? <div className={styles.attachmentList} aria-label="Selected Maven image reference">
        <div className={styles.attachmentPreview}>
          {selectedImageReference.previewUrl ? <img src={selectedImageReference.previewUrl} alt="Selected image to refine" /> : <Icon type="image" size={13} />}
          <span>Previous Maven image selected</span>
          <button type="button" aria-label="Remove selected image reference" onClick={() => setSelectedImageReference(null)} disabled={mavenBusy}><Icon type="close" size={13} /></button>
        </div>
      </div> : null}
      {attachments.length ? <div className={styles.attachmentList} aria-label="Attached media">
        {attachments.map((attachment) => <div key={attachment.localId} className={styles.attachmentPreview}>
          {attachment.kind === "image" ? <img src={attachment.previewUrl} alt={attachment.filename} /> : <Icon type={attachment.kind === "video" ? "video" : "audio"} size={13} />}
          <span title={attachment.filename}>{attachment.filename} ({attachment.kind})</span>
          {attachment.status === "uploading" ? <small>Uploading…</small> : null}
          <button type="button" aria-label={`Remove ${attachment.filename}`} onClick={() => removeAttachment(attachment.localId)} disabled={mavenBusy || attachment.status === "uploading"}><Icon type="close" size={13} /></button>
        </div>)}
      </div> : null}
      {attachmentError ? <p className={styles.attachmentError} role="alert">{attachmentError}</p> : null}
      {libraryOpen ? <div className={styles.attachmentList} aria-label="Creative Library media">
        {libraryBusy ? <span>Loading Creative Library…</span> : libraryChoices.length
          ? libraryChoices.map((asset) => <button key={asset.id} type="button" className={styles.attachmentPreview} onClick={() => attachLibraryAsset(asset)}>
            {assetPreviewKind(asset) === 'image' ? <img src={asset.storageReference || asset.url} alt="" /> : <Icon type={assetPreviewKind(asset) === 'video' ? 'video' : 'audio'} size={13} />}
            <span>{asset.title || `Creative Library ${assetPreviewKind(asset)}`}</span>
          </button>)
          : <span>No saved media is available yet.</span>}
      </div> : null}
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
          <button type="button" className={styles.attachButton} aria-label="Attach media" title="Attach images, audio, or video" onClick={() => attachmentInputRef.current?.click()} disabled={!mavenReady || mavenBusy}>
            <Icon type="attach" size={17} />
          </button>
          <button type="button" className={styles.attachButton} aria-label="Choose from Creative Library" title="Choose saved media" onClick={() => void openCreativeLibrary()} disabled={!mavenReady || mavenBusy}>
            <Icon type="library" size={17} />
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
              <div key={chat.id} data-chat-row className={`${styles.chatEntryRow} ${chat.id === mavenSessionId ? styles.chatEntryActive : ""}`}>
                {renamingChatId === chat.id ? (
                  <form className={styles.chatRenameForm} onSubmit={(event) => void submitRenameChat(event, chat)}>
                    <label htmlFor={`rename-${chat.id}`} className="sr-only">Rename conversation</label>
                    <input
                      id={`rename-${chat.id}`}
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); cancelRenameChat(); } }}
                      maxLength={120}
                      autoFocus
                      disabled={chatActionBusy}
                    />
                    <button type="submit" aria-label="Save conversation name" disabled={chatActionBusy || !renameValue.trim()}><Icon type="check" size={13} /></button>
                    <button type="button" aria-label="Cancel rename" onClick={cancelRenameChat} disabled={chatActionBusy}><Icon type="close" size={13} /></button>
                  </form>
                ) : (
                  <>
                    <button type="button" className={styles.chatEntry} onClick={() => void openSavedChat(chat)} disabled={mavenBusy}>
                      <Icon type="chat" size={14} />
                      <span>{chat.title || "Maven conversation"}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.chatMenuButton}
                      aria-label={`Actions for ${chat.title || "conversation"}`}
                      aria-haspopup="menu"
                      aria-expanded={chatMenuId === chat.id}
                      onClick={() => setChatMenuId((current) => (current === chat.id ? null : chat.id))}
                      disabled={mavenBusy || chatActionBusy}
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                    {chatMenuId === chat.id ? (
                      <div role="menu" className={styles.chatMenu}>
                        <button type="button" role="menuitem" onClick={() => beginRenameChat(chat)}>Rename</button>
                        <button type="button" role="menuitem" className={styles.chatMenuDanger} onClick={() => void deleteSavedChat(chat)}>Delete</button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
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
            {mavenSessionId ? (
              <a
                href={`/studio/design-agent?session=${encodeURIComponent(mavenSessionId)}`}
                aria-label="Continue this Maven conversation in Creator OS"
                title="Turn this conversation into reviewed creative work in Creator OS"
              >
                Creator OS ↗
              </a>
            ) : null}
            <a href="/studio/overview" aria-label="Open workspace overview">···</a>
          </div>
          <div className={styles.projectBar}>
            <label className={styles.projectLabel} htmlFor="maven-chat-project">Chat project</label>
            <select
              id="maven-chat-project"
              className={styles.projectSelect}
              value={chatProjectId || ""}
              onChange={(event) => void changeChatProject(event.target.value || null)}
              disabled={!mavenReady || projectBusy}
              title="Use this project's brand, voice, audience and instructions in this conversation"
            >
              <option value="">No project</option>
              {projectList.map((project) => (
                <option key={project.id} value={project.id}>{project.name || "Untitled Campaign"}</option>
              ))}
            </select>
            <span className={styles.projectStatus} role="status">{chatProjectStatus}</span>
          </div>
          {projectError ? <p className={styles.projectError} role="alert">{projectError}</p> : null}
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
                    streaming={mavenBusy && index === mavenMessages.length - 1 && message.role === "assistant"}
                    previousPrompt={index > 0 && mavenMessages[index - 1].role === "user" ? mavenMessages[index - 1].content : ""}
                    onVariation={(prompt, attachmentId, previewUrl) => {
                      if (!attachmentId) { setChatError("This image is no longer available as a trusted session asset. Upload it again to create a variation."); return; }
                      void submitMavenMessage(null, "Make another variation of this image while preserving its subject and style.", { attachmentId, previewUrl });
                    }}
                    onRefine={(attachmentId, previewUrl) => {
                      if (!attachmentId) { setChatError("This image is no longer available as a trusted session asset. Upload it again to refine it."); return; }
                      setSelectedImageReference({ attachmentId, previewUrl });
                      setMavenMessage("");
                      composerInputRef.current?.focus();
                    }} />
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

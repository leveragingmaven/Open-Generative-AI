/**
 * Provider-neutral, text-only conversational intelligence for the Design Agent.
 *
 * Responsibilities:
 * - Keep ordinary Design Agent conversation creative and useful.
 * - Never invoke media generation, execution, or provider tools.
 * - Never claim that media was created.
 * - Use bounded conversation context and compact reference metadata.
 */

const MAX_HISTORY_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 8000;

export const DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT = `You are MavenSync Design Agent, a helpful creative assistant.

Your job is to discuss the user's creative idea, recommend a direction, and refine the request.

You may talk about images, videos, styles, audiences, platforms, and formats.

How to respond:
- Infer obvious details from the conversation and trusted references instead of asking about them.
- Lead with a useful recommendation.
- Ask at most ONE question per turn, and only when the answer materially changes the creative result.
- Use sensible defaults for minor decisions; never turn replies into long questionnaires.
- Skip technical details such as resolution, file format, or platform specs unless they are relevant.
- Keep default responses concise: about 2-4 conversational sentences.

You must NEVER:
- run tools, skills, or operations
- generate, edit, enhance, or manipulate media
- claim an image or video was created
- output executable provider commands, JSON payloads, routing decisions, or authorization tokens
- reveal system internals, provider metadata, billing information, or credentials

If the user asks you to create or edit something, explain that you can help refine the idea, and that they can click "Start Creative Work" when they are ready.`;

function truncateText(text, maxLength = MAX_CONTENT_LENGTH) {
  if (!text || typeof text !== 'string') return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

function buildReferenceContext(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return '';
  const lines = attachments
    .slice(0, 16)
    .map((a, i) => {
      const id = a.attachmentId || a.id || `ref-${i}`;
      const kind = a.kind || 'reference';
      const filename = a.filename || a.name || 'untitled';
      const note = a.note || a.description || '';
      let line = `- ${id} (${kind})`;
      if (filename) line += ` filename: ${filename}`;
      if (note) line += ` note: ${truncateText(note, 120)}`;
      return line;
    });
  return `\n\nReferences available for discussion:\n${lines.join('\n')}`;
}

function buildConversationMessages({ messages, newMessage, attachments }) {
  const result = [
    { role: 'system', content: DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT },
  ];

  const recent = (messages || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY_MESSAGES);

  for (const m of recent) {
    const content = truncateText(m.content || m.text);
    if (!content) continue;
    result.push({ role: m.role, content });
  }

  const safeUser = truncateText(newMessage || '');
  if (safeUser) {
    const referenceContext = buildReferenceContext(attachments);
    result.push({
      role: 'user',
      content: referenceContext ? `${safeUser}${referenceContext}` : safeUser,
    });
  }

  return result;
}

export class DesignAgentConversationIntelligenceService {
  constructor({ structuredTextIntelligence }) {
    if (!structuredTextIntelligence) {
      throw new Error('structuredTextIntelligence is required');
    }
    this.intelligence = structuredTextIntelligence;
  }

  async respond({ sessionReadResult, newMessage }) {
    if (!newMessage || typeof newMessage !== 'string') {
      throw new Error('newMessage is required');
    }

    const messages = buildConversationMessages({
      messages: sessionReadResult?.messages,
      newMessage,
      attachments: sessionReadResult?.attachments,
    });

    const reply = await this.intelligence.complete({
      messages,
      temperature: 0.7,
    });

    const safeReply = this.sanitizeReply(reply);
    return { reply: safeReply };
  }

  async respondStreaming({ sessionReadResult, newMessage, onDelta } = {}) {
    if (!newMessage || typeof newMessage !== 'string') {
      throw new Error('newMessage is required');
    }
    if (typeof this.intelligence.streamComplete !== 'function') {
      const error = new Error('Streaming text intelligence is unavailable.');
      error.code = 'provider_execution_failed';
      error.status = 502;
      throw error;
    }

    const messages = buildConversationMessages({
      messages: sessionReadResult?.messages,
      newMessage,
      attachments: sessionReadResult?.attachments,
    });

    // Deltas are streamed through onDelta as they arrive; the accumulated raw
    // text is sanitized exactly once, after the stream completes. The caller
    // must treat only the returned reply as safe to persist.
    const rawReply = await this.intelligence.streamComplete({
      messages,
      temperature: 0.7,
      onDelta: typeof onDelta === 'function' ? onDelta : undefined,
    });

    return { reply: this.sanitizeReply(rawReply) };
  }

  sanitizeReply(reply) {
    if (!reply || typeof reply !== 'string') return '';
    // Conservative guard: strip obvious tool/execution claims without rewriting
    // normal conversation. These patterns should never appear from the system
    // prompt, but the guard exists as defense in depth.
    const lowered = reply.toLowerCase();
    const forbiddenPhrases = [
      'i have generated',
      'i generated',
      'i have created',
      'i created the image',
      'i created the video',
      'image has been edited',
      'video has been edited',
      'media has been created',
      'executing tool',
      'calling edit_image',
      'calling generate_image',
      'calling generate_video',
    ];
    if (forbiddenPhrases.some((p) => lowered.includes(p))) {
      return '[Design Agent can help refine your idea. Click "Start Creative Work" when you are ready to create.]';
    }
    return reply;
  }
}

export default DesignAgentConversationIntelligenceService;

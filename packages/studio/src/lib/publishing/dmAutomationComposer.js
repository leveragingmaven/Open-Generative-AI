// Build minimal PATCH bodies so unsupported or hidden remote settings remain intact.
const fields = ['name', 'keywords', 'matchMode', 'dmMessage', 'alsoMatchInDms', 'isActive', 'audience', 'followGate', 'dmDelaySeconds', 'commentReplyDelaySeconds'];
export function automationEditor(record = {}) {
  return { ...record, name: record.name || '', accountId: record.accountId || '', keywordText: (record.keywords || []).join('\n'), keywords: record.keywords || [], matchMode: record.matchMode || 'contains', dmMessage: record.dmMessage || '', isActive: record.isActive === true, alsoMatchInDms: record.alsoMatchInDms === true, dmDelaySeconds: record.dmDelaySeconds ?? 0, commentReplyDelaySeconds: record.commentReplyDelaySeconds ?? 0 };
}
export function automationChanges(editor, original = null, platform) {
  const out = {};
  editor = { ...editor, keywords: editor.keywordText.split('\n').filter(k => k.trim()) };
  if (!original && platform === 'instagram' && !editor.audience) editor.audience = { followerStatus: 'any', whenUnknown: 'skip' };
  const baseline = original ? automationEditor(original) : null;
  for (const key of fields) {
    if (['audience', 'followGate'].includes(key) && platform !== 'instagram') continue;
    if (editor[key] !== undefined && (!baseline || JSON.stringify(editor[key]) !== JSON.stringify(baseline[key]))) out[key] = editor[key];
  }
  if (!original) out.accountId = editor.accountId;
  return out;
}

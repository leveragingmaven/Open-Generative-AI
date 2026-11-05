"use client";
import { useEffect, useRef, useState } from 'react';
import { automationEditor, automationChanges } from '../lib/publishing/dmAutomationComposer.js';

export default function DmAutomationPanel({ center, accounts = [], enabled }) {
  const [rules, setRules] = useState([]);
  const [editor, setEditor] = useState(null);
  const [original, setOriginal] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current;
    setRules([]); setEditor(null); setOriginal(null); setDiagnostics(null); setError(''); setNotice('');
    if (!enabled || !center) return;
    setLoading(true);
    center.listAutomations().then(items => { if (epoch.current === current) setRules(items); })
      .catch(e => { if (epoch.current === current) setError(e.message); })
      .finally(() => { if (epoch.current === current) setLoading(false); });
    return () => { epoch.current++; };
  }, [center, enabled]);
  async function action(fn) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    const current = epoch.current;
    const live = () => epoch.current === current;
    try { await fn(live); } catch (e) { if (live()) setError(e.message || 'Request failed. Refresh remote state before retrying.'); }
    finally { pending.current = false; setBusy(false); }
  }
  const connected = accounts.filter(a => ['instagram', 'facebook'].includes(a.platform) && a.connected === true && !a.needsReconnect);
  const platform = editor?.platform || connected.find(a => a.id === editor?.accountId)?.platform;
  const change = (key, value) => setEditor(current => ({ ...current, [key]: value }));
  const audience = { followerStatus: 'any', whenUnknown: original ? 'send' : 'skip', ...editor?.audience };
  const gate = editor?.followGate || {};
  const inputClass = 'mt-1 w-full rounded border border-white/20 bg-black/20 p-2 text-sm';
  const buttonClass = 'rounded border border-white/20 px-3 py-2 text-sm disabled:opacity-40';
  if (!enabled) return <section><h2>DM Automation</h2><p>Select Maven Social in Accounts to manage automations.</p></section>;
  return <section className="space-y-4" aria-label="DM Automation">
    <h2 className="text-lg font-semibold">Maven Social DM Automation</h2>
    <p className="text-sm opacity-80">New rules apply to keyword comments across every post on the selected account. Create paused, then explicitly activate when ready. Existing post bindings and settings are preserved.</p>
    {error && <p role="alert" className="rounded border border-red-400 p-3">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="flex gap-2"><button className={buttonClass} disabled={busy} onClick={() => { setEditor(automationEditor()); setOriginal(null); setError(''); }}>New Automation</button><button className={buttonClass} disabled={busy || loading} onClick={() => action(async live => { const list = await center.listAutomations(); if (live()) setRules(list); })}>Refresh remote list</button></div>
    {loading && <p role="status">Loading remote automations…</p>}
    {editor && <form className="space-y-4 rounded border border-white/20 p-4" onSubmit={event => { event.preventDefault(); void action(async live => {
      const payload = automationChanges(editor, original, platform);
      if (!Object.keys(payload).length) { if (live()) setNotice('No changes to save.'); return; }
      if (payload.keywords?.length === 0 && !window.confirm('An empty keyword list matches any comment. Apply this broader rule?')) return;
      if (payload.isActive === true && !window.confirm('Activate this rule? Matching comments may immediately trigger messages.')) return;
      const result = editor.id ? await center.updateAutomation(editor.id, payload) : await center.createAutomation(payload);
      if (live()) { setRules(items => [result.automation, ...items.filter(a => a.id !== result.automation.id)]); setEditor(null); setOriginal(null); setNotice('Remote automation confirmed. Active state is shown below.'); }
    }); }}>
      <fieldset disabled={busy} className="space-y-3">
        <label className="block">Name<input required maxLength={191} className={inputClass} value={editor.name} onChange={e => change('name', e.target.value)} /></label>
        <label className="block">Social account<select required disabled={Boolean(editor.id)} className={inputClass} value={editor.accountId} onChange={e => setEditor(current => { const { audience, followGate, ...rest } = current; return { ...rest, accountId: e.target.value }; })}><option value="">Choose Instagram or Facebook</option>{editor.id && !connected.some(a => a.id === editor.accountId) && <option value={editor.accountId}>{editor.accountId} · reconnect required</option>}{connected.map(a => <option key={a.id} value={a.id}>{a.displayName || a.username || a.name || a.id} · {a.platform}</option>)}</select></label>
        {editor.id && <p className="text-xs opacity-70">The account cannot be changed for an existing rule. Trigger: {editor.trigger || 'comment'}. Other remote settings remain unchanged.</p>}
        <label className="block">Keywords (one per line; new rules require a keyword)<textarea required={!editor.id} className={inputClass} value={editor.keywordText} onChange={e => change('keywordText', e.target.value)} /></label>
        <label className="block">Keyword matching<select className={inputClass} value={editor.matchMode} onChange={e => change('matchMode', e.target.value)}><option value="contains">Contains text, including inside another word</option><option value="word">Whole word</option><option value="exact">Entire comment</option></select></label>
        <label className="block">DM message<textarea required maxLength={1000} className={inputClass} value={editor.dmMessage} onChange={e => change('dmMessage', e.target.value)} /></label>
        <p className="text-xs opacity-70">Plain text and links. Existing buttons or templates may impose a shorter limit. A comment private reply has platform limits; an active badge does not confirm delivery.</p>
        <label className="block"><input type="checkbox" disabled={editor.trigger === 'story_reply'} checked={editor.alsoMatchInDms} onChange={e => change('alsoMatchInDms', e.target.checked)} /> Also answer incoming DMs containing these keywords</label>
        <label className="block">DM delay (seconds, 0–86400)<input type="number" min="0" max="86400" step="1" required className={inputClass} value={editor.dmDelaySeconds} onChange={e => change('dmDelaySeconds', Number(e.target.value))} /></label>
        {editor.id && <label className="block">Existing public-reply delay (seconds, 0–86400)<input type="number" min="0" max="86400" step="1" required className={inputClass} value={editor.commentReplyDelaySeconds} onChange={e => change('commentReplyDelaySeconds', Number(e.target.value))} /><span className="text-xs">Only affects a public reply already configured remotely. Does not add one.</span></label>}
        {platform === 'instagram' ? <div className="space-y-3 rounded border border-white/20 p-3">
          <label className="block">Follower audience<select className={inputClass} value={audience.followerStatus} onChange={e => change('audience', { ...audience, followerStatus: e.target.value })}><option value="any">Anyone</option><option value="follower">Followers only</option><option value="non_follower">Non-followers only</option></select></label>
          <label className="block">When follower status is unknown<select className={inputClass} value={audience.whenUnknown} onChange={e => change('audience', { ...audience, whenUnknown: e.target.value })}><option value="skip">Do not send</option><option value="verify">Ask for confirmation, then recheck</option><option value="send">Send anyway, without verifying</option></select></label>
          <p className="text-xs opacity-80">Commenting alone does not grant follow-check consent. Unknown never means non-follower. Zernio rechecks when the person taps the confirmation button; following alone does not unlock the resource. Permissions and Meta messaging restrictions still apply.</p>
          {(audience.whenUnknown === 'verify' || audience.followerStatus === 'follower') && <>
            <label className="block">Follow/confirmation prompt<textarea className={inputClass} maxLength={640} value={gate.message || ''} placeholder="Follow the account, then tap to check." onChange={e => change('followGate', { ...gate, message: e.target.value })} /></label>
            <label className="block">Confirmation button<input className={inputClass} maxLength={20} value={gate.buttonLabel || ''} placeholder="I'm following" onChange={e => change('followGate', { ...gate, buttonLabel: e.target.value })} /></label>
            <label className="block">If they still do not follow<textarea className={inputClass} maxLength={640} value={gate.notFollowingMessage || ''} placeholder="Follow, then try the confirmation again." onChange={e => change('followGate', { ...gate, notFollowingMessage: e.target.value })} /></label>
            <p className="text-xs">Blank untouched prompt fields use Zernio defaults. Delivery and rechecks are performed by Zernio; no follower status is simulated.</p>
          </>}
        </div> : <p className="text-xs">Follower verification is available only for Instagram.</p>}
        <label className="block"><input type="checkbox" disabled={!editor.id} checked={editor.isActive} onChange={e => change('isActive', e.target.checked)} /> {editor.id ? 'Active (messages may be sent when triggered)' : 'New automations are created paused; activate separately after review'}</label>
        <div className="flex gap-2"><button className={buttonClass} type="submit">{busy ? 'Saving…' : 'Save Automation'}</button><button className={buttonClass} type="button" onClick={() => { setEditor(null); setOriginal(null); }}>Cancel</button></div>
      </fieldset>
    </form>}
    {!loading && !rules.length && <p>No remote automations loaded. Refresh to check before retrying an uncertain creation.</p>}
    {rules.map(rule => <article key={rule.id} className="space-y-2 rounded border border-white/20 p-4">
      <h3 className="font-semibold">{rule.name} · {rule.isActive === true ? 'Active' : rule.isActive === false ? 'Paused' : 'State unknown'}</h3>
      <p className="text-sm">{rule.platform} · {rule.accountId} · {rule.trigger || 'comment'} · {(rule.keywords || []).join(', ') || 'Any comment'} · {rule.matchMode || 'Matching unknown'}</p>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClass} disabled={busy} onClick={() => action(async live => { const data = await center.getAutomation(rule.id); if (live()) { setEditor(automationEditor(data.automation)); setOriginal(data.automation); } })}>Edit</button>
        <button className={buttonClass} disabled={busy || typeof rule.isActive !== 'boolean'} onClick={() => { if (rule.isActive === false && !window.confirm('Activate this automation and allow triggered messages?')) return; void action(async live => { const result = await center.updateAutomation(rule.id, { isActive: !rule.isActive }); if (live()) setRules(items => items.map(a => a.id === rule.id ? result.automation : a)); }); }}>{rule.isActive ? 'Pause' : 'Activate'}</button>
        <button className={buttonClass} disabled={busy} onClick={() => action(async live => { const result = await center.getAutomationLogs(rule.id); if (live()) setDiagnostics({ id: rule.id, ...result }); })}>Delivery diagnostics</button>
        <button className={buttonClass} disabled={busy} onClick={() => { if (!window.confirm(`Permanently delete ${rule.name}?`)) return; void action(async live => { await center.deleteAutomation(rule.id); if (live()) { setRules(items => items.filter(a => a.id !== rule.id)); setDiagnostics(null); if (editor?.id === rule.id) { setEditor(null); setOriginal(null); } setNotice('Zernio confirmed deletion.'); } }); }}>Delete</button>
      </div>
    </article>)}
    {diagnostics && <section className="space-y-2 rounded border border-white/20 p-4" aria-label="Automation diagnostics"><h3>Remote delivery diagnostics · {diagnostics.id}</h3><p>{diagnostics.total} trigger records; {diagnostics.misses?.total || 0} non-matching comments in the provider retention window. Showing the latest 25 records.</p><p className="text-xs">Unknown follower status is shown explicitly. A consumed private reply must not be blindly retried.</p>{diagnostics.logs.map((log, index) => <div key={log.id || index} className="border-t border-white/10 py-2 text-sm"><p>{log.status} · {log.source || 'comment'} · {log.audienceOutcome || 'No audience outcome'} · follower: {log.commenterIsFollower === null ? 'unknown' : log.commenterIsFollower ? 'yes' : 'no'}</p>{log.nextDueAt && <p>Next due: {log.nextDueAt}</p>}{log.error && <p>{log.error}</p>}{log.platformError && <p>Platform code: {log.platformError.code}; subcode: {log.platformError.subcode}</p>}{log.privateReplyConsumed && <p>Private reply allowance consumed; inspect in Zernio before any retry.</p>}</div>)}</section>}
  </section>;
}

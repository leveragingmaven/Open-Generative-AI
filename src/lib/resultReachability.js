function configuredHosts(value = process.env.MAVENSYNC_ASSET_HOST_ALLOWLIST) {
  return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function isPrivateLiteral(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true;
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const [, aText, bText] = match;
  const a = Number(aText); const b = Number(bText);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function allowedHost(hostname, allowlist) {
  const host = hostname.toLowerCase();
  if (isPrivateLiteral(host)) return false;
  return allowlist.some((entry) => host === entry || (entry.startsWith('*.') && host.endsWith(entry.slice(1)) && host !== entry.slice(2)));
}

export async function checkResultReachability(reference, { fetcher = fetch, timeoutMs = 5000, allowlist = configuredHosts() } = {}) {
  let url;
  try { url = new URL(String(reference || '')); } catch { return false; }
  if (url.protocol !== 'https:' || !allowedHost(url.hostname, allowlist)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const head = await fetcher(url, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
    if (head.ok) return true;
    if (head.status !== 405 && head.status !== 501) return false;
    const ranged = await fetcher(url, { method: 'GET', redirect: 'manual', headers: { Range: 'bytes=0-0' }, signal: controller.signal });
    return ranged.ok || ranged.status === 206;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

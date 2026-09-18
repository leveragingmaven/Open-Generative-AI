import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { MySqlCreativeAssetRepository } from './creativeAssetRepository.js';

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg', 'video/x-msvideo', 'application/pdf']);

function error(code, message, status = 400) { const value = new Error(message); value.code = code; value.status = status; return value; }
function configuredHosts(value = process.env.MAVENSYNC_ASSET_HOST_ALLOWLIST) { return String(value || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean); }
function hostAllowed(hostname, allowlist) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return allowlist.some((entry) => host === entry || (entry.startsWith('*.') && host.endsWith(entry.slice(1)) && host !== entry.slice(2)));
}
function ipv4Parts(address) { const parts = String(address).split('.').map(Number); return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null; }
function ipv4Unsafe(address) {
  const parts = ipv4Parts(address); if (!parts) return false;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113)
    || a >= 224;
}
function ipv6Words(address) {
  let value = String(address).toLowerCase().split('%')[0];
  if (value.includes('.')) {
    const index = value.lastIndexOf(':'); const mapped = ipv4Parts(value.slice(index + 1));
    if (!mapped) return null;
    value = `${value.slice(0, index)}:${((mapped[0] << 8) | mapped[1]).toString(16)}:${((mapped[2] << 8) | mapped[3]).toString(16)}`;
  }
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':').filter(Boolean) : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const values = [...left, ...Array(missing).fill('0'), ...right].map((part) => parseInt(part, 16));
  return values.length === 8 && values.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff) ? values : null;
}
function ipv6Unsafe(address) {
  const words = ipv6Words(address); if (!words) return false;
  const first = words[0]; const second = words[1];
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (mapped) return ipv4Unsafe(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  return words.every((word) => word === 0) || (words.slice(0, 7).every((word) => word === 0) && words[7] === 1)
    || (first >= 0xfe80 && first <= 0xfebf) || (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xff00 && first <= 0xffff)
    || (first === 0x2001 && second === 0x0db8);
}
function unsafeAddress(address) { const family = net.isIP(String(address)); return family === 4 ? ipv4Unsafe(address) : family === 6 ? ipv6Unsafe(address) : true; }
async function resolveSafeAddresses(hostname, lookup = dns.lookup) {
  let results;
  try { results = await lookup(hostname, { all: true, verbatim: true }); } catch { throw error('zernio_media_unavailable', 'The selected media source could not be resolved.'); }
  const addresses = Array.isArray(results) ? results : [results];
  if (!addresses.length || addresses.some((item) => unsafeAddress(typeof item === 'string' ? item : item?.address))) throw error('zernio_media_unsupported', 'The selected media source resolves to an unsafe network target.');
  return addresses;
}
function safeUrl(reference, allowlist) { let url; try { url = new URL(String(reference || '')); } catch { throw error('zernio_media_unsupported', 'This creative asset cannot be used for Maven Social publishing.'); } if (url.protocol !== 'https:' || !hostAllowed(url.hostname, allowlist)) throw error('zernio_media_unsupported', 'This creative asset is not available from an approved media source.'); return url; }
function contentType(response) { return String(response?.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase(); }
function assetModality(asset = {}) { return String(asset.metadata?.modality || asset.type || asset.kind || '').toLowerCase(); }
function validateType(type, asset) { if (!SUPPORTED_TYPES.has(type)) throw error('zernio_media_unsupported', 'This creative asset has an unsupported media type.'); const modality = assetModality(asset); if (modality.includes('image') && !type.startsWith('image/')) throw error('zernio_media_invalid_type', 'This creative asset does not match its recorded media type.'); if (modality.includes('video') && !type.startsWith('video/')) throw error('zernio_media_invalid_type', 'This creative asset does not match its recorded media type.'); return type; }
function sizeFrom(response) { const value = Number(response?.headers?.get?.('content-length')); return Number.isFinite(value) && value >= 0 ? value : null; }
function extensionFor(type) { return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/mpeg': '.mpeg', 'video/x-msvideo': '.avi', 'application/pdf': '.pdf' }[type] || ''; }
function filenameFor(asset, url, type) { const supplied = asset.filename || asset.metadata?.filename || asset.name || asset.title; if (supplied && typeof supplied === 'string' && !(/[\\/]/.test(supplied))) return supplied.includes('.') ? supplied : `${supplied}${extensionFor(type)}`; const basename = path.basename(url.pathname || '').replace(/[^A-Za-z0-9._-]/g, '_'); return basename && basename !== '.' ? basename : `maven-asset-${asset.id || 'media'}${extensionFor(type)}`; }
function referencesFor(asset = {}) { return [...new Set([asset.storageReference, asset.providerOutputReference, ...(Array.isArray(asset.generatedFiles) ? asset.generatedFiles : []), asset.url].filter((value) => typeof value === 'string' && value.trim()))]; }
function rejectReference(reference) { if (/^(storage(?:\+signed)?|blob|data|file):/i.test(reference)) throw error('zernio_media_unsupported', 'This creative asset is stored in an unsupported format for Maven Social publishing.'); }
async function boundedBytes(response, maxBytes) {
  const declared = sizeFrom(response); if (declared !== null && declared > maxBytes) throw error('zernio_media_too_large', 'This creative asset is too large for Maven Social publishing.');
  if (!response?.body?.getReader) throw error('zernio_media_unavailable', 'The selected creative asset could not be streamed safely.');
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value?.byteLength || 0;
      if (total > maxBytes) { await reader.cancel(); throw error('zernio_media_too_large', 'This creative asset is too large for Maven Social publishing.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  const body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { body, sizeBytes: total };
}

export async function resolveZernioMedia({ identity, assetId, assetRepository = new MySqlCreativeAssetRepository(), fetcher = globalThis.fetch, lookup = dns.lookup, allowlist = configuredHosts(), maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const accountId = String(identity?.accountId || '').trim(); const creatorIdentityKey = String(identity?.identityKey || identity?.creatorIdentityKey || '').trim(); const id = String(assetId || '').trim();
  if (!accountId || !creatorIdentityKey) throw error('zernio_identity_required', 'Authenticated Creator OS identity is required.', 401);
  if (!id) throw error('zernio_asset_required', 'Select a saved creative asset before publishing.');
  if (typeof fetcher !== 'function') throw error('zernio_media_unavailable', 'Maven Social media acquisition is unavailable.', 503);
  const asset = await assetRepository.get(id, { accountId });
  if (!asset || String(asset.accountId) !== accountId || String(asset.creatorIdentityKey) !== creatorIdentityKey) throw error('zernio_asset_not_owned', 'The selected creative asset is not available to this Creator OS tenant.', 403);
  const references = referencesFor(asset); if (!references.length) throw error('zernio_media_unsupported', 'The selected creative asset has no publishable media reference.');
  let lastFailure = null;
  for (const reference of references) {
    try {
      rejectReference(reference); const url = safeUrl(reference, allowlist); await resolveSafeAddresses(url.hostname, lookup); const head = await fetcher(url, { method: 'HEAD', redirect: 'manual' });
      if (head.status >= 300 && head.status < 400) throw error('zernio_media_unsupported', 'The selected media source redirects and cannot be verified safely.');
      if (head.ok) {
        const sizeBytes = sizeFrom(head); if (sizeBytes !== null && sizeBytes > maxBytes) throw error('zernio_media_too_large', 'This creative asset is too large for Maven Social publishing.');
        const headType = contentType(head); if (SUPPORTED_TYPES.has(headType)) { const type = validateType(headType, asset); return { mode: 'publicUrl', url: url.toString(), contentType: type, filename: filenameFor(asset, url, type), sizeBytes, assetId: id }; }
      } else if (head.status !== 405 && head.status !== 501) throw error('zernio_media_unavailable', 'The selected creative asset could not be verified for publishing.');
      const response = await fetcher(url, { method: 'GET', redirect: 'manual' }); if (response.status >= 300 && response.status < 400) throw error('zernio_media_unsupported', 'The selected media source redirects and cannot be verified safely.'); if (!response.ok) throw error('zernio_media_unavailable', 'The selected creative asset could not be retrieved.'); const type = validateType(contentType(response), asset); const { body, sizeBytes } = await boundedBytes(response, maxBytes); return { mode: 'bytes', body, contentType: type, filename: filenameFor(asset, url, type), sizeBytes, assetId: id };
    } catch (failure) { lastFailure = failure; }
  }
  throw lastFailure || error('zernio_media_unavailable', 'The selected creative asset could not be acquired for Maven Social publishing.');
}

export { DEFAULT_MAX_BYTES, SUPPORTED_TYPES, configuredHosts, hostAllowed, safeUrl, unsafeAddress, resolveSafeAddresses };

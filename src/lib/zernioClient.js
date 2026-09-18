import Zernio from '@zernio/node';

let client;

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

export function getZernioApiKey() {
  return env('ZERNIO_API_KEY');
}

export function getZernioBaseUrl() {
  return env('ZERNIO_API_BASE_URL', 'https://zernio.com/api');
}

export function createZernioClient({ apiKey = getZernioApiKey(), baseURL = getZernioBaseUrl() } = {}) {
  if (!apiKey) {
    const error = new Error('Zernio API configuration is unavailable.');
    error.code = 'zernio_api_key_missing';
    error.status = 503;
    throw error;
  }
  return new Zernio({ apiKey, baseURL });
}

export function getZernioClient() {
  if (!client) client = createZernioClient();
  return client;
}

export function resetZernioClientForTests() {
  client = undefined;
}

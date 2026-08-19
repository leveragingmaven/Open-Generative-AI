import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';

function getApiKey(request) {
    const serverKey = getServerMuApiKey();
    if (serverKey) return serverKey;
    if (isAgencyModeEnabled()) return null;
    return request.headers.get('x-api-key') || null;
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('authorization');
    headers.delete('x-api-key');
    headers.delete('content-length');
    return headers;
}

export async function GET(request) {
    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const { search } = new URL(request.url);
    const targetUrl = `${getMuApiBaseUrl().replace(/\/+$/, '')}/app/get_file_upload_url${search}`;

    const headers = cleanHeaders(request);
    const apiKey = getApiKey(request);
    if (isAgencyModeEnabled() && !apiKey) {
        return NextResponse.json({ error: 'MUAPI_API_KEY is not configured.' }, { status: 500 });
    }
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const response = await fetch(targetUrl, {
            headers,
            method: 'GET',
        });

        const data = await response.json();

        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ error: 'Upload URL provider request failed.', code: 'upload_provider_failure' }, { status: 502 });
    }
}

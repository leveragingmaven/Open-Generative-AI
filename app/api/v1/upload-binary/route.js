import { NextResponse } from 'next/server';
import { validateUploadProxyTarget } from '../../../../src/lib/uploadProxyTarget';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { invalidUploadTargetResponse, requestExceedsUploadLimit, uploadTooLargeResponse, unsupportedMediaTypeResponse, validateMultipartUpload } from '@/src/lib/uploadSecurity';

export async function POST(request) {
    const auth = requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    if (requestExceedsUploadLimit(request)) return uploadTooLargeResponse();
    try {
        const formData = await request.formData();
        const upload = validateMultipartUpload(formData);
        if (upload.reason === 'upload_too_large') return uploadTooLargeResponse();
        if (!upload.ok) return unsupportedMediaTypeResponse();

        // Extract the original S3 target URL
        const targetUrl = formData.get('x-proxy-target-url');

        if (!targetUrl) {
            return NextResponse.json({ error: 'Missing proxy target URL' }, { status: 400 });
        }

        const validatedTarget = validateUploadProxyTarget(targetUrl);
        if (!validatedTarget.ok) {
            return invalidUploadTargetResponse();
        }

        const s3FormData = new FormData();
        for (const [key, value] of formData.entries()) {
            if (key !== 'x-proxy-target-url') {
                s3FormData.append(key, value);
            }
        }

        const s3Response = await fetch(validatedTarget.url, {
            method: 'POST',
            body: s3FormData,
        });

        if (s3Response.ok || s3Response.status === 204) {
            return new Response(null, { status: 204 });
        } else {
            return NextResponse.json({ error: 'Upload provider rejected the request.', code: 'upload_provider_failure' }, { status: 502 });
        }
    } catch (error) {
        return NextResponse.json({ error: 'Upload provider request failed.', code: 'upload_provider_failure' }, { status: 502 });
    }
}

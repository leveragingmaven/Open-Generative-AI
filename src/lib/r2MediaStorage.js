import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3AssetStorage } from '../../packages/studio/src/lib/intelligence/S3AssetStorage.js';

const REQUIRED = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
let cached;

export function createR2MediaStorage(env = process.env) {
  if (REQUIRED.some((name) => !env[name])) throw new Error('r2_storage_not_configured');
  const endpoint = new URL(env.R2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
    || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('r2_endpoint_invalid');
  }
  const bucket = env.R2_BUCKET;
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('r2_bucket_invalid');
  if (env.R2_REGION && env.R2_REGION !== 'auto') throw new Error('r2_region_invalid');
  const s3 = new S3Client({
    region: env.R2_REGION || 'auto', endpoint: endpoint.href, forcePathStyle: true,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const client = {
    putObject: (input) => s3.send(new PutObjectCommand(input)),
    headObject: (input) => s3.send(new HeadObjectCommand(input)),
    getObject: (input) => s3.send(new GetObjectCommand(input)),
    deleteObject: (input) => s3.send(new DeleteObjectCommand(input)),
  };
  return new S3AssetStorage({
    client, bucket,
    signer: ({ key, expiresIn = 3600 }) => getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn }),
  });
}

export function getR2MediaStorage() {
  cached ||= createR2MediaStorage();
  return cached;
}

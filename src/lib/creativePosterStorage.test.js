import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { handleCreativeMedia } from "./creativeMediaEndpoint.js";
import { creativeObjectKey, creativePosterKey, ownedCreativePosterKey, storeVideoPoster } from "./creativeMediaStorage.js";
import { PosterExtractionUnavailableError } from "./videoPoster.js";

const ASSET = `asset_${"a".repeat(64)}`;
const OTHER_ASSET = `asset_${"b".repeat(64)}`;
const ACCOUNT = "1";
const PRIMARY = creativeObjectKey(ACCOUNT, ASSET);
const POSTER = creativePosterKey(ACCOUNT, ASSET);
const POSTER_BYTES = Buffer.from("poster-webp-bytes");

const row = { id: ASSET, accountId: ACCOUNT, storageReference: `storage://${PRIMARY}` };
const repository = { async get(assetId, scope) { return assetId === ASSET && scope.accountId === ACCOUNT ? row : null; } };

function fakeStorage({ poster = true, puts = [] } = {}) {
  return {
    puts,
    async getMetadata(key) { return poster && key === POSTER ? { contentType: "image/webp", sizeBytes: POSTER_BYTES.length } : null; },
    async getObject(key) {
      if (key === POSTER) return poster ? { Body: Readable.from([POSTER_BYTES]), ContentType: "image/webp", ContentLength: POSTER_BYTES.length } : null;
      return { Body: Readable.from([Buffer.from("video")]), ContentType: "video/mp4", ContentLength: 5 };
    },
    async putObject(input) { puts.push(input); },
    async createDeliveryReference(key) { return `storage://${key}`; },
  };
}

const mediaRequest = (query, headers = {}) => new Request(`https://creator.test/api/creative-assets/media?${query}`, { headers });

test("a stored video's poster is served as its own small image", async () => {
  const storage = fakeStorage();
  const response = await handleCreativeMedia(mediaRequest(`assetId=${ASSET}&variant=poster`), { identity: { accountId: ACCOUNT }, repository, storage });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("content-length"), String(POSTER_BYTES.length));
  assert.equal(response.headers.get("accept-ranges"), null);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), POSTER_BYTES.toString());
});

test("a video without a stored poster answers 404 instead of serving the video as an image", async () => {
  const storage = fakeStorage({ poster: false });
  const response = await handleCreativeMedia(mediaRequest(`assetId=${ASSET}&variant=poster`), { identity: { accountId: ACCOUNT }, repository, storage });
  assert.equal(response.status, 404);
});

test("the poster stays inside the account ownership rule and refuses ranges and unknown variants", async () => {
  const storage = fakeStorage();
  const foreign = await handleCreativeMedia(mediaRequest(`assetId=${ASSET}&variant=poster`), { identity: { accountId: "2" }, repository, storage });
  assert.equal(foreign.status, 404);
  const ranged = await handleCreativeMedia(mediaRequest(`assetId=${ASSET}&variant=poster`, { range: "bytes=0-4" }), { identity: { accountId: ACCOUNT }, repository, storage });
  assert.equal(ranged.status, 416);
  const bogus = await handleCreativeMedia(mediaRequest(`assetId=${ASSET}&variant=still`), { identity: { accountId: ACCOUNT }, repository, storage });
  assert.equal(bogus.status, 400);
});

test("the poster key is only addressable for an asset this account already owns", () => {
  assert.equal(ownedCreativePosterKey(row, ACCOUNT), POSTER);
  assert.equal(ownedCreativePosterKey(row, "2"), null);
  assert.equal(ownedCreativePosterKey({ ...row, storageReference: "https://cdn.muapi.ai/legacy.mp4" }, ACCOUNT), null);
  assert.equal(ownedCreativePosterKey({ id: OTHER_ASSET, accountId: ACCOUNT, storageReference: "storage://x" }, ACCOUNT), null);
});

test("a poster is stored beside the video with the existing conventions", async () => {
  const storage = fakeStorage({ poster: false });
  const stored = await storeVideoPoster({ accountId: ACCOUNT, assetId: ASSET, sourcePath: "/tmp/video", storage, extract: async () => POSTER_BYTES });
  assert.deepEqual(stored, { key: POSTER, storageReference: `storage://${POSTER}`, contentType: "image/webp", sizeBytes: POSTER_BYTES.length, reused: false });
  assert.equal(storage.puts.length, 1);
  assert.equal(storage.puts[0].Key ?? storage.puts[0].key, POSTER);
  assert.equal(storage.puts[0].contentType, "image/webp");
  assert.deepEqual(storage.puts[0].body, POSTER_BYTES);
});

test("a runtime without a decoder stores nothing and never fails the asset", async () => {
  const storage = fakeStorage({ poster: false });
  const missing = await storeVideoPoster({ accountId: ACCOUNT, assetId: ASSET, sourcePath: "/tmp/video", storage, extract: async () => { throw new PosterExtractionUnavailableError(); } });
  assert.equal(missing, null);
  assert.equal(storage.puts.length, 0);
});

test("an existing poster is reused instead of re-extracted", async () => {
  const storage = fakeStorage();
  let extracted = 0;
  const reused = await storeVideoPoster({ accountId: ACCOUNT, assetId: ASSET, sourcePath: "/tmp/video", storage, extract: async () => { extracted += 1; return POSTER_BYTES; } });
  assert.equal(reused.reused, true);
  assert.equal(extracted, 0);
  assert.equal(storage.puts.length, 0);
});

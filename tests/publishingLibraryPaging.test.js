import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CREATIVE_LIBRARY_PAGE_SIZE, libraryPageRemaining, libraryPageWindow } from "../packages/studio/src/lib/assets/libraryPaging.js";
import { libraryPickerEntries } from "../packages/studio/src/lib/publishing/publishingLibraryPicker.js";

const publishingSource = readFileSync(new URL("../packages/studio/src/components/PublishingStudio.jsx", import.meta.url), "utf8");

/** The account media the Publishing Center offers: 35 saved images and videos. */
function accountMedia(count = 35) {
  return Array.from({ length: count }, (_, index) => {
    const id = `media-${String(index).padStart(2, "0")}`;
    const modality = index % 5 === 0 ? "video" : "image";
    return {
      id,
      title: `Saved media ${index}`,
      metadata: { assetType: "generated", modality },
      generatedFiles: [`/api/creative-assets/media?assetId=${id}`],
    };
  });
}

test("the Publishing Center picker offers twelve media, then twelve more, with nothing duplicated or skipped", () => {
  const entries = libraryPickerEntries(accountMedia());
  assert.equal(entries.length, 35);

  const first = libraryPageWindow(entries);
  const second = libraryPageWindow(entries, CREATIVE_LIBRARY_PAGE_SIZE * 2);
  const all = libraryPageWindow(entries, CREATIVE_LIBRARY_PAGE_SIZE * 3);

  assert.equal(first.length, 12);
  assert.equal(second.length, 24);
  assert.equal(all.length, 35);
  // Each batch only appends to the previous one, so the library order is kept and the same asset never repeats.
  assert.deepEqual(first.map((entry) => entry.id), entries.slice(0, 12).map((entry) => entry.id));
  assert.deepEqual(second.slice(0, 12), first);
  assert.deepEqual(all.map((entry) => entry.id), entries.map((entry) => entry.id));
  assert.equal(new Set(all.map((entry) => entry.id)).size, 35);
  assert.equal(libraryPageRemaining(entries), 23);
  assert.equal(libraryPageRemaining(entries, 24), 11);
  assert.equal(libraryPageRemaining(entries, 35), 0);
});

test("a new search pages from the first batch again while attaching a media item leaves the list alone", () => {
  const entries = libraryPickerEntries(accountMedia());
  // Selecting the attached asset is a no-op for the paging window: only a query change restarts it.
  assert.equal(entries.filter((entry) => entry.id === "media-07").length, 1);
  assert.equal(libraryPageRemaining(entries, CREATIVE_LIBRARY_PAGE_SIZE), 23);

  // A search that narrows the 35 saved assets to the 28 images is a new result set, so it starts at twelve.
  const images = libraryPickerEntries(accountMedia(), { query: "image" });
  assert.equal(images.length, 28);
  assert.equal(libraryPageWindow(images).length, CREATIVE_LIBRARY_PAGE_SIZE);
  assert.deepEqual(libraryPageWindow(images).map((entry) => entry.id), images.slice(0, 12).map((entry) => entry.id));
  assert.equal(libraryPageRemaining(images, CREATIVE_LIBRARY_PAGE_SIZE), 16);
});

test("both Publishing Center asset surfaces page twelve at a time and reuse the Creative Library helper", () => {
  assert.match(
    publishingSource,
    /import \{ CREATIVE_LIBRARY_PAGE_SIZE, libraryPageRemaining, libraryPageWindow \} from "\.\.\/lib\/assets\/libraryPaging\.js";/,
  );
  assert.ok(publishingSource.includes("useState(CREATIVE_LIBRARY_PAGE_SIZE)"));
  assert.ok(publishingSource.includes("libraryPageWindow(pickerEntries, libraryPickerVisibleCount)"));
  assert.ok(publishingSource.includes("libraryPageWindow(assets, creativeWorkVisibleCount)"));
  assert.ok(publishingSource.includes("libraryPageRemaining(pickerEntries, libraryPickerVisibleCount)"));
  assert.ok(publishingSource.includes("libraryPageRemaining(assets, creativeWorkVisibleCount)"));

  // Only the window is mapped, so neither surface can mount the whole account library at once.
  assert.ok(publishingSource.includes("{pickerVisibleEntries.map((entry) => ("));
  assert.ok(publishingSource.includes("{creativeWorkAssets.map((asset) => ("));
  assert.doesNotMatch(publishingSource, /\{pickerEntries\.map\(/);
  assert.doesNotMatch(publishingSource, /\{assets\.map\(/);

  // Each surface has its own compact Load More that reveals exactly the next batch.
  assert.ok(publishingSource.includes("setLibraryPickerVisibleCount((count) => count + CREATIVE_LIBRARY_PAGE_SIZE)"));
  assert.ok(publishingSource.includes("setCreativeWorkVisibleCount((count) => count + CREATIVE_LIBRARY_PAGE_SIZE)"));
  assert.ok(publishingSource.includes("Load {Math.min(CREATIVE_LIBRARY_PAGE_SIZE, pickerRemainingEntries)} more assets"));
  assert.ok(publishingSource.includes("Load {Math.min(CREATIVE_LIBRARY_PAGE_SIZE, creativeWorkRemaining)} more assets"));
  assert.ok(publishingSource.includes("{pickerRemainingEntries > 0 ?"));
  assert.ok(publishingSource.includes("{creativeWorkRemaining > 0 ?"));

  // A changed search term is the only thing that restarts a batch.
  assert.match(publishingSource, /useEffect\(\(\) => \{ setLibraryPickerVisibleCount\(CREATIVE_LIBRARY_PAGE_SIZE\); \}, \[libraryQuery\]\);/);

  // Paging reaches the two asset surfaces only: Calendar, Queue, and drafts are untouched.
  assert.equal(publishingSource.match(/libraryPageWindow\(/g).length, 2);
  assert.equal(publishingSource.match(/libraryPageRemaining\(/g).length, 2);
});

test("paging keeps selection, thumbnails, and the unloaded video poster wired", () => {
  assert.ok(publishingSource.includes("onClick={() => attachLibraryMedia(entry.asset)}"));
  assert.ok(publishingSource.includes("onClick={() => focusedDraft ? attachLibraryMedia(asset) : createDraft(asset)}"));
  assert.ok(publishingSource.includes('{focusedMediaAssetId === entry.id ? "Attached" : focusedDraft ? "Replace" : "Attach"}'));
  assert.ok(publishingSource.includes("<QueueMediaThumbnail media={publishingQueueMedia(entry.asset)} />"));
  assert.ok(publishingSource.includes("<QueueMediaThumbnail media={publishingQueueMedia(asset)} />"));
  // The viewport gate and the poster-until-played video tile are unchanged by paging.
  assert.ok(publishingSource.includes("const [frameRef, nearViewport] = useNearViewport({ enabled: !eager });"));
  assert.ok(publishingSource.includes("if (!eager && !nearViewport) return frame("));
});

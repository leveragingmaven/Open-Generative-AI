#!/usr/bin/env node
// LOCAL VERIFICATION HARNESS — not for production.
//
// Runs the REAL motion-carousel endpoint handler, the REAL in-memory job store and
// the REAL background worker (with the local renderer), so the Motion Design
// Carousel screen can be exercised end-to-end in a browser in an environment
// without the Creator OS MySQL database or SSO session. The only differences from
// production are: the identity is fixed, and persistence is the in-memory store
// (the MySQL store is used in production).
//
//   MAVEN_MOTION_ENGINE=/path/to/carousel.py node scripts/maven-motion/dev-api.mjs
import http from "node:http";
import { mkdir } from "node:fs/promises";
import { handleMotionCarouselPost, handleMotionCarouselGet } from "../../src/lib/motionCarouselEndpoint.js";
import { InMemoryMotionCarouselJobStore } from "../../src/lib/motionCarouselJobStore.js";
import { createMotionCarouselWorker } from "../../src/lib/motionCarouselWorker.js";
import { createLocalCarouselRenderer, resolveCarouselRuntime, describeRuntime } from "../../packages/studio/src/lib/motion/carousel/CarouselRenderer.js";
import { carouselOutputDir } from "../../src/lib/motionCarouselPaths.js";

const PORT = Number(process.env.DEV_API_PORT || 4517);
const runtime = resolveCarouselRuntime();
if (!runtime.configured) {
  console.error(describeRuntime(runtime));
  process.exit(2);
}

const store = new InMemoryMotionCarouselJobStore();
const renderer = createLocalCarouselRenderer({ runtime });
const identity = { accountId: "dev", identityKey: "dev" };
const worker = createMotionCarouselWorker({ store, renderer, runtime });
await worker.start();
await mkdir(carouselOutputDir("dev"), { recursive: true });

const server = http.createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let body;
  if (req.method === "POST") {
    body = await new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  }
  const request = new Request(url.toString(), {
    method: req.method,
    headers: { "content-type": req.headers["content-type"] || "application/json" },
    ...(body ? { body } : {}),
  });
  const response = req.method === "POST"
    ? await handleMotionCarouselPost(request, { identity, store, renderer, startWorker: () => worker })
    : await handleMotionCarouselGet(request, { identity, store });
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(PORT, "127.0.0.1", () => console.log(`[dev-api] motion-carousel harness on http://127.0.0.1:${PORT}`));

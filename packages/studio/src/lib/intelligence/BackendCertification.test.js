import test from "node:test";
import { runBackendCertification } from "./BackendCertificationFixture.js";

test("Creator OS backend certification journeys", async () => {
  await runBackendCertification();
});

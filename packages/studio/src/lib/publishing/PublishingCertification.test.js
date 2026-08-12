import test from "node:test";
import { runPublishingCertification } from "./PublishingCertificationFixture.js";

test("Publishing Center functional and multi-provider certification", async () => {
  await runPublishingCertification();
});

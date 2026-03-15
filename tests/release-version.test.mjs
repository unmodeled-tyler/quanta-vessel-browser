import assert from "node:assert/strict";
import test from "node:test";

import {
  compareVersions,
  incrementPatch,
  nextReleaseVersion,
  parseVersion,
} from "../scripts/release-version.mjs";

test("parseVersion accepts plain and v-prefixed semantic versions", () => {
  assert.deepEqual(parseVersion("0.1.0"), [0, 1, 0]);
  assert.deepEqual(parseVersion("v2.3.4"), [2, 3, 4]);
});

test("compareVersions sorts semantic versions numerically", () => {
  assert.equal(compareVersions("v0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "v1.0.0"), 0);
  assert.equal(compareVersions("0.9.9", "v1.0.0"), -1);
});

test("incrementPatch bumps the patch version", () => {
  assert.equal(incrementPatch("v1.4.9"), "1.4.10");
});

test("nextReleaseVersion uses the highest known version as the release base", () => {
  assert.equal(nextReleaseVersion("0.1.0", ["v0.1.0", "v0.1.7", "v0.1.3"]), "0.1.8");
  assert.equal(nextReleaseVersion("0.3.0", ["v0.2.9"]), "0.3.1");
});

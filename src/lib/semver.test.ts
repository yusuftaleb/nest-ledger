import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanVersion, isNewer } from "./semver.ts";

test("a release is newer only when its version is later", () => {
  assert.equal(isNewer("v0.2.0", "0.1.0"), true);
  assert.equal(isNewer("0.10.0", "0.9.3"), true);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("v0.1.0", "0.1.0"), false);
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
  assert.equal(isNewer("nightly", "0.1.0"), false);
  assert.equal(cleanVersion("v01.2.3"), "1.2.3");
});

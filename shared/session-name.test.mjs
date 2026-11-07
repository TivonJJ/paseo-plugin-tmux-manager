import assert from "node:assert/strict";
import test from "node:test";

import { validateNewSessionName } from "./session-name.ts";

test("accepts an ordinary name", () => {
  assert.equal(validateNewSessionName("work"), null);
});

test("accepts # in a name (the server escapes it)", () => {
  assert.equal(validateNewSessionName("work#(id)"), null);
});

for (const [label, name] of [
  ["empty", ""],
  ["leading dash", "-x"],
  ["inner space", "a b"],
  ["dot", "a.b"],
  ["colon", "a:b"],
  ["leading space", " work"],
  ["too long", "a".repeat(257)],
]) {
  test(`rejects ${label}`, () => {
    assert.equal(typeof validateNewSessionName(name), "string");
  });
}

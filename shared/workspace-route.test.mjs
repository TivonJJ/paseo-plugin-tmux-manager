import assert from "node:assert/strict";
import test from "node:test";

import { workspaceTerminalRoute } from "./workspace-route.ts";

test("builds the app route that focuses a terminal tab", () => {
  assert.equal(
    workspaceTerminalRoute("srv_1", "wks_6fed91d7196fda82", "term-abc"),
    "/h/srv_1/workspace/wks_6fed91d7196fda82?open=terminal%3Aterm-abc",
  );
});

test("encodes server and terminal IDs", () => {
  assert.equal(
    workspaceTerminalRoute("a b", "wks_1", "t/1"),
    "/h/a%20b/workspace/wks_1?open=terminal%3At%2F1",
  );
});

test("returns null when the app would base64-encode the workspace ID", () => {
  assert.equal(workspaceTerminalRoute("srv", "/Users/me/project", "t1"), null);
});

test("returns null for empty IDs", () => {
  assert.equal(workspaceTerminalRoute("", "wks_1", "t1"), null);
  assert.equal(workspaceTerminalRoute("srv", "wks_1", " "), null);
});

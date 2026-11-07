import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { FIELD_SEP } from "./tmux-format.ts";

function hasTmux() {
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("field separator is printable ASCII so tmux never escapes it", () => {
  assert.match(FIELD_SEP, /^[\x20-\x7e]+$/);
});

test("real tmux output splits into the requested fields", { skip: !hasTmux() && "tmux not installed" }, () => {
  const socket = `paseo-test-${randomBytes(4).toString("hex")}`;
  const tmux = (...args) => execFileSync("tmux", ["-L", socket, "-f", "/dev/null", ...args], { encoding: "utf8" });
  tmux("new-session", "-d", "-s", "sep-check");
  try {
    const out = tmux("list-sessions", "-F", ["#{session_id}", "#{session_name}", "#{session_windows}"].join(FIELD_SEP));
    const [id, name, windows] = out.trim().split(FIELD_SEP);
    assert.match(id, /^\$\d+$/);
    assert.equal(name, "sep-check");
    assert.equal(windows, "1");
  } finally {
    tmux("kill-server");
  }
});

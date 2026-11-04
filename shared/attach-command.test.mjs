import assert from "node:assert/strict";
import test from "node:test";

import { tmuxAttachCommand } from "./attach-command.ts";

test("copies a pasteable attach command for a simple session name", () => {
  assert.equal(tmuxAttachCommand("work"), "tmux attach-session -t 'work'");
});

test("shell-quotes session names containing apostrophes and metacharacters", () => {
  assert.equal(
    tmuxAttachCommand("a'b;$(echo pwned)"),
    "tmux attach-session -t 'a'\\''b;$(echo pwned)'",
  );
});

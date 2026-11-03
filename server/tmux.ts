import { execCommand } from "@getpaseo/plugin/server";

import type { TmuxSession } from "../shared/tmux";

/** Unit separator; cannot appear in tmux format field values we request. */
const FIELD_SEP = "\u001f";

const LIST_FORMAT = [
  "#{session_name}",
  "#{session_windows}",
  "#{session_attached}",
  "#{session_created}",
  "#{session_path}",
].join(FIELD_SEP);

export interface TmuxResult {
  available: boolean;
  error: string | null;
  sessions: TmuxSession[];
}

/** tmux session names may not contain whitespace, control chars, or a leading dash. */
const SESSION_NAME_RE = /^[^\s\u0000-\u001f]+$/;

export function isValidSessionName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 256 &&
    !name.startsWith("-") &&
    SESSION_NAME_RE.test(name)
  );
}

export class TmuxMissingError extends Error {
  constructor() {
    super("tmux is not installed or not on PATH");
    this.name = "TmuxMissingError";
  }
}

export class TmuxCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TmuxCommandError";
  }
}

/** Run a tmux subcommand with an argv array (no shell). Throws on failure. */
async function run(args: string[], timeoutMs = 5000): Promise<string> {
  try {
    const { stdout } = await execCommand("tmux", args, { timeout: timeoutMs });
    return stdout;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") throw new TmuxMissingError();
    const message = (err.stderr || err.message || String(error)).trim();
    throw new TmuxCommandError(message);
  }
}

/** Best-effort map of session name -> active pane command. Never throws. */
async function paneCommands(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const stdout = await run([
      "list-panes",
      "-a",
      "-F",
      `#{session_name}${FIELD_SEP}#{pane_active}${FIELD_SEP}#{pane_current_command}`,
    ]);
    for (const line of stdout.split("\n")) {
      if (!line) continue;
      const [name, active, command] = line.split(FIELD_SEP);
      if (active === "1" && name && command && !map.has(name)) {
        map.set(name, command);
      }
    }
  } catch {
    // Pane enrichment is optional; ignore failures.
  }
  return map;
}

export async function listSessions(): Promise<TmuxResult> {
  let stdout: string;
  try {
    stdout = await run(["list-sessions", "-F", LIST_FORMAT]);
  } catch (error) {
    if (error instanceof TmuxMissingError) {
      return { available: false, error: error.message, sessions: [] };
    }
    if (error instanceof TmuxCommandError) {
      // No server running => zero sessions, which is a normal, non-error state.
      if (/no server running|no sessions|error connecting/i.test(error.message)) {
        return { available: true, error: null, sessions: [] };
      }
      return { available: true, error: error.message, sessions: [] };
    }
    return { available: true, error: String(error), sessions: [] };
  }

  const commands = await paneCommands();
  const sessions: TmuxSession[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const [name, windows, attached, created, path] = line.split(FIELD_SEP);
    if (!name) continue;
    sessions.push({
      name,
      windows: Number.parseInt(windows ?? "0", 10) || 0,
      attached: attached === "1",
      createdAt: Number.parseInt(created ?? "0", 10) || 0,
      path: path ?? "",
      command: commands.get(name) ?? null,
    });
  }
  sessions.sort((a, b) => a.name.localeCompare(b.name));
  return { available: true, error: null, sessions };
}

/**
 * Set the `mouse` option for a single session only (session-scoped override).
 * Does not change the global tmux option or any other session. Best-effort:
 * returns false on failure instead of throwing, so attach never breaks on this.
 */
export async function setSessionMouse(name: string, on: boolean): Promise<boolean> {
  if (!isValidSessionName(name)) return false;
  try {
    await run(["set-option", "-t", name, "mouse", on ? "on" : "off"]);
    return true;
  } catch {
    return false;
  }
}

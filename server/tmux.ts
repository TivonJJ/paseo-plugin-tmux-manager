import { execCommand } from "@getpaseo/plugin/server";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TmuxSession } from "../shared/tmux";
import { FIELD_SEP } from "../shared/tmux-format";

const LIST_FORMAT = [
  "#{session_id}",
  "#{session_name}",
  "#{session_windows}",
  "#{session_attached}",
  "#{session_created}",
  "#{session_path}",
  "#{@paseo_tmux_manager_source}",
].join(FIELD_SEP);

const PASEO_KEY_TABLE = "paseo-tmux-manager-root";

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
  const attachedSources = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const [id, name, windows, attached, created, path, source] = line.split(FIELD_SEP);
    if (!name) continue;
    if (source) {
      if (attached === "1") attachedSources.add(source);
      continue;
    }
    sessions.push({
      id: id ?? "",
      name,
      windows: Number.parseInt(windows ?? "0", 10) || 0,
      attached: attached === "1",
      createdAt: Number.parseInt(created ?? "0", 10) || 0,
      path: path ?? "",
      command: commands.get(name) ?? null,
    });
  }
  for (const session of sessions) {
    if (attachedSources.has(session.name)) session.attached = true;
  }
  sessions.sort((a, b) => a.name.localeCompare(b.name));
  return { available: true, error: null, sessions };
}

/** Kill a session by its exact tmux ID after verifying the displayed name. */
export async function killSession(id: string, name: string): Promise<void> {
  if (!/^\$\d+$/.test(id) || !isValidSessionName(name)) {
    throw new Error("Invalid tmux session target");
  }
  const current = await listSessions();
  if (!current.sessions.some((session) => session.id === id && session.name === name)) {
    throw new Error("tmux session changed or no longer exists");
  }
  // Remove plugin-created grouped sessions first. Otherwise their shared
  // windows would keep running after the original session is killed.
  const groups = await run(["list-sessions", "-F", `#{session_id}${FIELD_SEP}#{@paseo_tmux_manager_source}`]);
  for (const line of groups.split("\n")) {
    const [groupId, source] = line.split(FIELD_SEP);
    if (source === name && /^\$\d+$/.test(groupId ?? "")) {
      await run(["kill-session", "-t", groupId]);
    }
  }
  await run(["kill-session", "-t", id]);
}

/** Copy root bindings and add Paseo-only history navigation keys. */
async function prepareKeyTable(): Promise<void> {
  const rootBindings = await run(["list-keys", "-T", "root"]);
  const lines = rootBindings
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replace(/-T root(?=\s)/, `-T ${PASEO_KEY_TABLE}`));
  if (lines.some((line) => !line.includes(`-T ${PASEO_KEY_TABLE}`))) {
    throw new TmuxCommandError("Could not copy tmux root key bindings");
  }
  const dir = await mkdtemp(join(tmpdir(), "paseo-tmux-keys-"));
  try {
    await writeFile(join(dir, "keys.conf"), `${lines.join("\n")}\n`);
    await run(["source-file", join(dir, "keys.conf")]);
    await run(["unbind-key", "-T", PASEO_KEY_TABLE, "M-Up"]).catch(() => undefined);
    await run(["unbind-key", "-T", PASEO_KEY_TABLE, "M-S-Up"]).catch(() => undefined);
    await run(["bind-key", "-T", PASEO_KEY_TABLE, "C-Up", "copy-mode", "-u"]);
    await run(["bind-key", "-T", PASEO_KEY_TABLE, "C-S-Up", "copy-mode; send-keys -X history-top"]);
    // Copy-mode tables are global. The condition keeps these keys inert in
    // ordinary local sessions, where they were previously unbound.
    const isPaseoSession = "#{!=:#{@paseo_tmux_manager_source},}";
    for (const table of ["copy-mode", "copy-mode-vi"]) {
      for (const key of ["M-S-Up", "M-S-Down"]) {
        const old = await run(["list-keys", "-T", table, key]).catch(() => "");
        if (old.includes("@paseo_tmux_manager_source")) await run(["unbind-key", "-T", table, key]);
      }
      await run(["bind-key", "-T", table, "C-S-Up", "if-shell", "-F", isPaseoSession, "send-keys -X history-top"]);
      await run(["bind-key", "-T", table, "C-S-Down", "if-shell", "-F", isPaseoSession, "send-keys -X history-bottom"]);
      const fallbackUp = table === "copy-mode" ? "send-keys -X scroll-up" : "";
      const fallbackDown = table === "copy-mode" ? "send-keys -X scroll-down" : "";
      await run(["bind-key", "-T", table, "C-Up", "if-shell", "-F", isPaseoSession, "send-keys -X page-up", fallbackUp]);
      await run(["bind-key", "-T", table, "C-Down", "if-shell", "-F", isPaseoSession, "send-keys -X page-down", fallbackDown]);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A grouped session shares panes but has its own mouse and key-table options. */
export async function createPaseoSession(source: string): Promise<string> {
  if (!isValidSessionName(source)) throw new Error("Invalid tmux session name");
  await prepareKeyTable();
  const name = `paseo_${randomBytes(8).toString("hex")}`;
  await run(["new-session", "-d", "-t", `=${source}`, "-s", name]);
  try {
    await run(["set-option", "-t", name, "@paseo_tmux_manager_source", source]);
    await run(["set-option", "-t", name, "key-table", PASEO_KEY_TABLE]);
    await run(["set-option", "-t", name, "mouse", "on"]);
    // Setting destroy-unattached before a client attaches kills the session.
    await run(["set-hook", "-t", name, "client-attached", `set-option -t ${name} destroy-unattached on`]);
    return name;
  } catch (error) {
    await destroyPaseoSession(name);
    throw error;
  }
}

export async function destroyPaseoSession(name: string): Promise<void> {
  try {
    await run(["kill-session", "-t", name]);
  } catch {
    // A detached grouped session may have already been auto-destroyed.
  }
}

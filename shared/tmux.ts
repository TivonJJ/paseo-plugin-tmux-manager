import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * How a tmux session was matched to a Paseo workspace.
 * - exact:   session path equals a workspace cwd
 * - project: session path lives under a registered project path
 * - fallback: nothing matched; the dedicated ops workspace is used
 */
export const bindingKindSchema = z.enum(["exact", "project", "fallback"]);

export const tmuxSessionSchema = z.object({
  name: z.string(),
  windows: z.number(),
  attached: z.boolean(),
  /** tmux session_created, unix seconds */
  createdAt: z.number(),
  /** tmux session_path (the session's working directory) */
  path: z.string(),
  /** command running in the session's active pane, best-effort */
  command: z.string().nullable(),
});
export type TmuxSession = z.infer<typeof tmuxSessionSchema>;

export const sessionBindingSchema = z.object({
  kind: bindingKindSchema,
  /** Workspace the session would attach into, resolved at list time when known */
  workspaceId: z.string().nullable(),
  /** Human-readable workspace name for display */
  workspaceName: z.string().nullable(),
  /** Project name when matched via a registered project */
  projectName: z.string().nullable(),
});

export type SessionBinding = z.infer<typeof sessionBindingSchema>;

export const sessionViewSchema = z.object({
  session: tmuxSessionSchema,
  binding: sessionBindingSchema,
});

export type SessionView = z.infer<typeof sessionViewSchema>;

/** List tmux sessions on the daemon host, each with its resolved workspace binding. */
export const listSessionsRpc = defineRpc({
  name: "tmux.list",
  input: z.object({}),
  output: z.object({
    available: z.boolean(),
    /** Present when tmux is missing or errored */
    error: z.string().nullable(),
    sessions: z.array(sessionViewSchema),
  }),
});

/**
 * Attach a Paseo terminal to an existing tmux session. The server resolves (or
 * lazily creates) the target workspace, then opens a terminal that runs
 * `tmux attach-session -t <grouped session>`. The grouped session shares the
 * source panes but has isolated key and mouse options, and is removed on detach.
 */
export const attachSessionRpc = defineRpc({
  name: "tmux.attach",
  input: z.object({ name: z.string() }),
  output: z.object({
    terminalId: z.string(),
    workspaceId: z.string(),
  }),
});

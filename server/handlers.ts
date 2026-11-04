import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";

import {
  type SessionView,
  attachSessionRpc,
  killSessionRpc,
  listSessionsRpc,
} from "../shared/tmux";
import { listSettingsDefinition } from "../shared/list-settings";
import {
  OPS_WORKSPACE_TITLE,
  type ProjectLike,
  type WorkspaceLike,
  resolveBinding,
} from "./binding";
import { createPaseoSession, destroyPaseoSession, isValidSessionName, killSession, listSessions } from "./tmux";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Extract an array of records from an SDK list result of unknown shape.
 * Different list APIs return a bare array, `{ entries }`, or a named field
 * (e.g. `{ projects }`); normalize all of them to an array. */
function toArray(result: any, namedKey?: string): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.entries)) return result.entries;
  if (namedKey && result && Array.isArray(result[namedKey])) return result[namedKey];
  return [];
}

/** Collect every visible workspace, paging through the directory. */
async function loadWorkspaces(paseo: any): Promise<WorkspaceLike[]> {
  const out: WorkspaceLike[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({ page: { limit: 100, cursor } });
    for (const w of toArray(page, "workspaces")) {
      out.push({
        id: String(w.id ?? w.workspaceId),
        name: String(w.name ?? w.id ?? w.workspaceId),
        directory: String(w.directory ?? w.cwd ?? ""),
        projectId: w.projectId != null ? String(w.projectId) : null,
        background: Boolean(w.background),
      });
    }
    cursor = page?.pageInfo?.nextCursor ?? undefined;
  } while (cursor);
  return out;
}

async function loadProjects(paseo: any): Promise<ProjectLike[]> {
  const result = await paseo.projects.list();
  const out: ProjectLike[] = [];
  for (const p of toArray(result, "projects")) {
    const path = String(p.path ?? p.directory ?? "");
    if (!path) continue;
    out.push({
      projectId: String(p.projectId ?? p.id),
      name: String(p.name ?? p.projectId ?? p.id),
      path,
    });
  }
  return out;
}

export function registerHandlers(server: PluginServerContext): void {
  server.registerSettings(listSettingsDefinition);
  server.handle(
    listSessionsRpc,
    async (_input: unknown, { paseo }: PluginHandlerContext) => {
      const tmux = await listSessions();
      if (!tmux.available || tmux.sessions.length === 0) {
        return { available: tmux.available, error: tmux.error, sessions: [] };
      }

      let workspaces: WorkspaceLike[] = [];
      let projects: ProjectLike[] = [];
      try {
        [workspaces, projects] = await Promise.all([
          loadWorkspaces(paseo),
          loadProjects(paseo),
        ]);
      } catch (error) {
        // Binding is best-effort; still return sessions with fallback bindings.
        console.error("[tmux-manager] failed to load workspaces/projects", error);
      }

      const sessions: SessionView[] = tmux.sessions.map((session) => ({
        session,
        binding: resolveBinding(session.path, workspaces, projects),
      }));
      return { available: true, error: null, sessions };
    },
  );

  server.handle(
    attachSessionRpc,
    async ({ name }: { name: string }, { paseo }: PluginHandlerContext) => {
      if (!isValidSessionName(name)) {
        throw new Error(`Invalid tmux session name: ${JSON.stringify(name)}`);
      }

      // Confirm the session actually exists right now; never create one.
      const tmux = await listSessions();
      const session = tmux.sessions.find((s) => s.name === name);
      if (!session) {
        throw new Error(`tmux session not found: ${name}`);
      }

      const [workspaces, projects] = await Promise.all([
        loadWorkspaces(paseo),
        loadProjects(paseo),
      ]);
      const binding = resolveBinding(session.path, workspaces, projects);

      const workspaceId = await ensureWorkspace(paseo, binding, session.path);

      const paseoSession = await createPaseoSession(name);
      try {
        const terminal = await paseo.workspaces.ref(workspaceId).terminals.create({
          name: `tmux: ${name}`,
          command: "tmux",
          args: ["attach-session", "-t", paseoSession],
        });
        return { terminalId: String(terminal.id), workspaceId };
      } catch (error) {
        await destroyPaseoSession(paseoSession);
        throw error;
      }
    },
  );

  server.handle(killSessionRpc, async ({ id, name }) => {
    await killSession(id, name);
    return { killed: true };
  });
}

/**
 * Resolve a concrete workspace id for the binding, reusing or creating one only
 * when needed. Uses `workspaces.open(cwd)`, which is reuse-or-create and avoids
 * guessing the create-source schema; it never spawns an agent.
 *
 * - exact / project with a known workspace: use it directly.
 * - project without a workspace: open one rooted at the session directory.
 * - fallback: open the ops workspace rooted at $HOME (a stable, single
 *   catch-all), then best-effort rename it to the ops title.
 */
async function ensureWorkspace(
  paseo: any,
  binding: { kind: string; workspaceId: string | null; projectName: string | null },
  sessionPath: string,
): Promise<string> {
  if (binding.workspaceId) return binding.workspaceId;

  if (binding.kind === "project" && sessionPath) {
    const ws = await paseo.workspaces.open(sessionPath);
    return String(ws.id);
  }

  // Fallback: a single catch-all workspace rooted at $HOME.
  const opsRoot = process.env.HOME || sessionPath || "/";
  const ws = await paseo.workspaces.open(opsRoot);
  const id = String(ws.id);
  try {
    if (typeof ws.setTitle === "function") await ws.setTitle(OPS_WORKSPACE_TITLE);
  } catch {
    // Title is cosmetic; ignore failures.
  }
  return id;
}

import { sep } from "node:path";

import type { SessionBinding } from "../shared/tmux";

/** Minimal shapes we rely on from the Paseo SDK. Kept local to avoid coupling
 * to SDK type names that may evolve. */
export interface WorkspaceLike {
  id: string;
  name: string;
  directory: string;
  projectId: string | null;
  background: boolean;
}

export interface ProjectLike {
  projectId: string;
  name: string;
  path: string;
}

/** The dedicated ops workspace title used when a session matches nothing. */
export const OPS_WORKSPACE_TITLE = "tmux-ops";

function normalize(p: string): string {
  if (!p) return p;
  // Strip a single trailing separator so "/a/b/" and "/a/b" compare equal.
  return p.length > 1 && p.endsWith(sep) ? p.slice(0, -1) : p;
}

/** True when `child` is `parent` or a descendant directory of `parent`. */
function isUnder(child: string, parent: string): boolean {
  const c = normalize(child);
  const p = normalize(parent);
  if (c === p) return true;
  return c.startsWith(p.endsWith(sep) ? p : p + sep);
}

/**
 * Resolve which workspace a tmux session (identified by its path) should bind to.
 *
 * Priority:
 *   1. exact    - a visible workspace whose directory equals the session path
 *   2. project  - a registered project whose path contains the session path;
 *                 reuse an existing workspace under it when present
 *   3. fallback - nothing matched; caller will use the ops workspace
 *
 * This function never creates anything. It reports the best binding it can
 * compute from current state; the caller decides whether to create a workspace.
 */
export function resolveBinding(
  sessionPath: string,
  workspaces: WorkspaceLike[],
  projects: ProjectLike[],
): SessionBinding {
  const path = normalize(sessionPath);
  const visible = workspaces.filter((w) => !w.background);

  // 1. Exact directory match. Prefer a non-background workspace; first wins.
  const exact = visible.find((w) => normalize(w.directory) === path);
  if (exact) {
    return {
      kind: "exact",
      workspaceId: exact.id,
      workspaceName: exact.name,
      projectName: null,
    };
  }

  // 2. Project subtree match. Pick the deepest (most specific) matching project.
  const matchingProjects = projects
    .filter((p) => p.path && isUnder(path, p.path))
    .sort((a, b) => normalize(b.path).length - normalize(a.path).length);
  const project = matchingProjects[0];
  if (project) {
    // Reuse an existing visible workspace in that project if one exists.
    const inProject = visible.find((w) => w.projectId === project.projectId);
    return {
      kind: "project",
      workspaceId: inProject?.id ?? null,
      workspaceName: inProject?.name ?? null,
      projectName: project.name,
    };
  }

  // 3. Fallback.
  return { kind: "fallback", workspaceId: null, workspaceName: null, projectName: null };
}

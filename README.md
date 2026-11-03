# paseo-tmux-manager

A Paseo plugin to list and attach to existing tmux sessions from any Paseo
client (desktop, web, mobile) — without starting new agent processes and without
killing the session when the client closes.

## What it does

- Adds a **Tmux** item to the sidebar that opens a screen listing the daemon
  host's tmux sessions (name, windows, attached state, age, active command,
  working directory).
- Each session shows its resolved **workspace binding**.
- Tapping a session attaches a Paseo terminal to it via
  `tmux attach-session -t <name>` and navigates to the owning workspace.
- Auto-refreshes the list every 5s; manual refresh button too.

It never runs `new-session` or `kill-session`. Closing the Paseo terminal is a
detach; the tmux session and its processes survive.

## Workspace binding

For each session, its `#{session_path}` is matched, in order:

1. **exact** — equals a visible workspace's directory → use that workspace.
2. **project** — lives under a registered project's path → reuse a workspace in
   that project, or open one rooted at the session directory.
3. **fallback** — no match → a single catch-all `tmux-ops` workspace.

When a project matches multiple workspaces, the first visible one is chosen
(Phase 2 will add explicit selection).

## Architecture

```
shared/tmux.ts      RPC contracts (zod): tmux.list, tmux.attach
server/tmux.ts      run tmux via node:child_process (argv array, no shell), parse
server/binding.ts   pure resolver: session path -> workspace binding
server/handlers.ts  wire RPCs to the Paseo SDK (workspaces, terminals)
client/tmux-screen.tsx   the Tmux screen (React Native, theme-aware)
index.server.ts / index.client.tsx   registration entry points
```

## Develop

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-tmux-manager   # requires pluginsEnabled
paseo plugin logs paseo-tmux-manager
# after edits:
paseo plugin reload paseo-tmux-manager
```

## Roadmap

- P1: create/kill/switch sessions (with confirm), windows/panes, search, filter.
- P2: associate Kiro/Codex hook events with sessions.
- Multi-host support via `client.hosts`.

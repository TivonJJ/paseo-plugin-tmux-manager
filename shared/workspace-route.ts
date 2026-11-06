/**
 * App route that opens a workspace and focuses one terminal tab. Mirrors the
 * Paseo app's `buildHostWorkspaceOpenRoute` (`/h/:serverId/workspace/:id?open=`),
 * which the plugin SDK's `openWorkspace` cannot express.
 *
 * Returns null for workspace IDs the app would base64-encode; callers then
 * fall back to `navigation.openWorkspace`.
 */
export function workspaceTerminalRoute(
  serverId: string,
  workspaceId: string,
  terminalId: string,
): string | null {
  const server = serverId.trim();
  const workspace = workspaceId.trim();
  const terminal = terminalId.trim();
  if (!server || !terminal || !/^[A-Za-z0-9._~-]+$/.test(workspace)) return null;
  return (
    `/h/${encodeURIComponent(server)}/workspace/${encodeURIComponent(workspace)}` +
    `?open=${encodeURIComponent(`terminal:${terminal}`)}`
  );
}

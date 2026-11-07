/** Same rule as the server's `isValidSessionName`: no whitespace or control characters. */
const NAME_RE = /^[^\s\u0000-\u001f]+$/;

/**
 * Validate a name for a session the plugin is about to create. Returns null
 * when valid, otherwise a message for the user. Stricter than attach: tmux
 * silently rewrites `.` and `:` to `_`, which would make the created session
 * impossible to find by the name the user typed.
 */
export function validateNewSessionName(name: string): string | null {
  if (name.length === 0) return "Enter a session name.";
  if (name.length > 256) return "Name must be 256 characters or fewer.";
  if (name.startsWith("-")) return "Name cannot start with a dash.";
  if (!NAME_RE.test(name)) return "Name cannot contain spaces or control characters.";
  if (name.includes(".") || name.includes(":")) return "Name cannot contain “.” or “:” (tmux renames them).";
  return null;
}

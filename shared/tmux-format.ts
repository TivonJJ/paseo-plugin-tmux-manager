/**
 * Separator between fields in tmux `-F` format output.
 *
 * Must be printable ASCII: tmux 3.4 and older escape control characters in
 * format output (e.g. U+001F is printed as the literal text `\037`), which
 * leaves every line unsplit and makes all sessions disappear from the list.
 */
export const FIELD_SEP = "|:paseo:|";

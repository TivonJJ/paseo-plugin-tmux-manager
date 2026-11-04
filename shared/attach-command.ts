/** Command to paste after connecting to the tmux host in an SSH terminal. */
export function tmuxAttachCommand(sessionName: string): string {
  const quotedName = `'${sessionName.replaceAll("'", "'\\''")}'`;
  return `tmux attach-session -t ${quotedName}`;
}

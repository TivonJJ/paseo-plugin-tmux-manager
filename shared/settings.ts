import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Host-scoped plugin settings.
 *
 * autoMouse: when attaching to a tmux session from Paseo, set that session's
 * `mouse on` so the wheel/scroll drives tmux scrollback inside the Paseo
 * terminal. This is a per-session tmux override; it does not touch the global
 * tmux config or other sessions. Default off: mouse mode changes text
 * selection and is of limited use on mobile terminals, so it is opt-in.
 */
export const settingsSchema = z.object({
  autoMouse: z.boolean().default(false),
});

export type TmuxManagerSettings = z.infer<typeof settingsSchema>;

export const settingsDefinition = defineSettings({
  id: "paseo-tmux-manager",
  scope: "host",
  version: 1,
  schema: settingsSchema,
});

export const defaultSettings: TmuxManagerSettings = { autoMouse: false };

import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const listSettingsDefinition = defineSettings({
  id: "paseo-tmux-manager-list",
  scope: "host",
  version: 1,
  schema: z.object({ autoRefresh: z.boolean().default(true) }),
});

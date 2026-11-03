import type { PluginServerContext } from "@getpaseo/plugin/server";

import { registerHandlers } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  registerHandlers(server);
  return () => {};
}

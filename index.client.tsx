import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

import { TmuxScreen } from "./client/tmux-screen";

function TmuxItem({ host, currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="SquareTerminal"
      label={`Tmux · ${host.label}`}
      active={currentScreen?.screenId === "tmux"}
      onPress={() => openScreen({ screenId: "tmux" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "tmux", title: "Tmux", Component: TmuxScreen });
  client.addSidebarHeaderItem({ id: "tmux", title: "Tmux", Component: TmuxItem });
  return () => {};
}

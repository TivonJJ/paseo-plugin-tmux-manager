import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

import { TmuxScreen } from "./client/tmux-screen";
import { SettingsScreen } from "./client/settings-screen";

function TmuxItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="SquareTerminal"
      label="Tmux"
      active={currentScreen?.screenId === "tmux"}
      onPress={() => openScreen({ screenId: "tmux" })}
    />
  );
}

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "tmux", title: "Tmux", Component: TmuxScreen });
  client.addSidebarHeaderItem({ id: "tmux", title: "Tmux", Component: TmuxItem });
  client.addSettingsScreen({
    id: "settings",
    title: "Tmux Manager",
    icon: "SquareTerminal",
    Component: SettingsScreen,
  });
  return () => {};
}

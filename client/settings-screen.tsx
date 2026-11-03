import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { View } from "react-native";
import { useMemo } from "react";

import { settingsDefinition } from "../shared/settings";

export function SettingsScreen({ theme, layout }: PluginSurfaceProps) {
  const settings = useSettings(settingsDefinition);

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 12 : 20,
        backgroundColor: theme.colors.surface0,
      },
    }),
    [theme, layout.compact],
  );

  const ready = settings.status === "ready";
  const autoMouse = ready ? settings.values.autoMouse : false;

  return (
    <View style={styles.screen}>
      <SettingsSection title="Terminal">
        <SettingsCard>
          <SettingsSwitch
            label="Enable mouse on attach"
            hint="When attaching to a tmux session from Paseo, turn on that session's mouse mode so the scroll wheel drives tmux scrollback. Affects only sessions you attach here, not your global tmux config."
            value={autoMouse}
            disabled={!ready || settings.saving}
            onValueChange={(next) => {
              if (settings.status === "ready") {
                void settings.save({ autoMouse: next }, settings.revision);
              }
            }}
            error={settings.saveError}
          />
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}

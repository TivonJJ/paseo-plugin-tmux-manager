import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Switch, Text, View } from "react-native";
import { FlatList, Icon, Modal, copyText, useToast } from "@getpaseo/plugin/client/ui";

import { tmuxAttachCommand } from "../shared/attach-command";
import { listSettingsDefinition } from "../shared/list-settings";
import type { SessionBinding, SessionView, TmuxSession } from "../shared/tmux";
import { attachSessionRpc, killSessionRpc, listSessionsRpc } from "../shared/tmux";
import { workspaceTerminalRoute } from "../shared/workspace-route";

/** The app's URL scheme (`scheme` in its Expo config, shared by every build variant). */
const APP_SCHEME = "paseo";

/**
 * Delays after opening the workspace at which the focus route is sent. The
 * first usually lands after the app refetches the workspace's terminal list;
 * the second covers a slow connection. Re-focusing the same tab is a no-op.
 */
const FOCUS_DELAYS_MS = [800, 2000];

/** Navigate the app to one of its own routes. */
function openAppRoute(route: string): void {
  if (Platform.OS === "web") {
    // Same mechanism the app's browser e2e tests use to drive expo-router.
    const win = (globalThis as { window?: any }).window;
    if (!win?.history?.pushState) return;
    win.history.pushState(null, "", route);
    win.dispatchEvent(new win.PopStateEvent("popstate"));
    return;
  }
  Linking.openURL(`${APP_SCHEME}:/${route}`).catch(() => undefined);
}

/** Cancels the focus timers of the previous attach, if still pending. */
let cancelPendingFocus: (() => void) | null = null;

/**
 * Open the workspace with the new terminal tab focused.
 *
 * The SDK's `openWorkspace` takes no tab target, so the app keeps whichever
 * tab was focused before. The app's `?open=terminal:<id>` route focuses a tab,
 * but sending it immediately does not stick: while the plugin screen is shown,
 * the workspace's terminal list query is disabled, and its cached list lacks
 * the new terminal. On arrival the app closes the tab as unknown, then re-adds
 * it unfocused at the end once the list refetches. So open the workspace first
 * (which re-enables the query), and send the focus route after the refetch.
 * Timers are not cancelled on unmount: the screen unmounts when it navigates.
 */
function openTerminalTab(
  navigation: PluginScreenProps["navigation"],
  target: { serverId: string; workspaceId: string; terminalId: string },
): void {
  cancelPendingFocus?.();
  cancelPendingFocus = null;
  navigation?.openWorkspace?.({ workspaceId: target.workspaceId, serverId: target.serverId });
  const route = workspaceTerminalRoute(target.serverId, target.workspaceId, target.terminalId);
  if (!route) return;
  const timers = FOCUS_DELAYS_MS.map((ms) => setTimeout(() => openAppRoute(route), ms));
  cancelPendingFocus = () => timers.forEach(clearTimeout);
}

function bindingLabel(b: SessionBinding): string {
  switch (b.kind) {
    case "exact":
      return `→ ${b.workspaceName ?? "workspace"}`;
    case "project":
      return b.workspaceName
        ? `→ ${b.workspaceName} (${b.projectName})`
        : `→ project ${b.projectName}`;
    case "fallback":
      return "→ tmux-ops (fallback)";
  }
}

function relativeAge(createdAt: number): string {
  if (!createdAt) return "";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - createdAt);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function TmuxScreen({ theme, host, layout, navigation }: PluginScreenProps) {
  const toast = useToast();
  const listSessions = useRpc(listSessionsRpc);
  const attach = useRpc(attachSessionRpc);
  const kill = useRpc(killSessionRpc);
  const listSettings = useSettings(listSettingsDefinition);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [killTarget, setKillTarget] = useState<TmuxSession | null>(null);
  const autoRefresh = listSettings.status === "ready" ? listSettings.values.autoRefresh : true;

  const query = useQuery({
    queryKey: ["tmux-manager", "sessions", host.id],
    queryFn: () => listSessions({}),
    refetchInterval: autoRefresh ? 5000 : false,
  });

  async function refreshManually() {
    setManualRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setManualRefreshing(false);
    }
  }

  const attachMutation = useMutation({
    mutationFn: (name: string) => attach({ name }),
    onSuccess: (result) => {
      openTerminalTab(navigation, {
        serverId: host.id,
        workspaceId: result.workspaceId,
        terminalId: result.terminalId,
      });
    },
  });

  const killMutation = useMutation({
    mutationFn: (session: TmuxSession) => kill({ id: session.id, name: session.name }),
    onSuccess: () => {
      setKillTarget(null);
      void query.refetch();
      toast.show("tmux session closed", { variant: "success" });
    },
  });

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        backgroundColor: theme.colors.surface0,
      },
      listContent: {
        padding: layout.compact ? 12 : 20,
        paddingBottom: 24,
      },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        paddingHorizontal: layout.compact ? 12 : 20,
        paddingTop: layout.compact ? 12 : 20,
        paddingBottom: 8,
      },
      notice: {
        paddingHorizontal: layout.compact ? 12 : 20,
      },
      title: { color: theme.colors.foreground, fontSize: layout.compact ? 18 : 22, fontWeight: "600" as const },
      refresh: { color: theme.colors.accent, fontSize: 14 },
      autoRefreshRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8, paddingHorizontal: layout.compact ? 12 : 20, paddingBottom: 8 },
      autoRefreshLabel: { color: theme.colors.foregroundMuted, fontSize: 13 },
      hostLabel: { color: theme.colors.foregroundMuted, fontSize: 13, paddingHorizontal: layout.compact ? 12 : 20, paddingBottom: 8 },
      card: {
        borderRadius: 10,
        backgroundColor: theme.colors.surface1,
        marginBottom: 10,
      },
      cardBody: { flex: 1, padding: 14 },
      actions: { flexDirection: "row" as const, alignItems: "center" as const, borderTopWidth: 1, borderTopColor: theme.colors.surface0, paddingHorizontal: 8, paddingVertical: 2 },
      row: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
      name: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 13, marginTop: 2 },
      binding: { color: theme.colors.foregroundMuted, fontSize: 13, marginTop: 4 },
      copyButton: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const },
      killButton: { height: 44, flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingHorizontal: 10 },
      killLabel: { color: theme.colors.statusDanger, fontSize: 13 },
      modalText: { color: theme.colors.foreground, fontSize: 15 },
      modalActions: { flexDirection: "row" as const, justifyContent: "flex-end" as const, gap: 18, marginTop: 18 },
      dot: { fontSize: 12 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 14, marginTop: 24, textAlign: "center" as const },
      error: { color: theme.colors.statusDanger, fontSize: 14, marginTop: 16 },
    }),
    [theme, layout.compact],
  );

  const data = query.data;

  const headerBar = (
    <View style={styles.header}>
      <Text style={styles.title}>tmux sessions</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh tmux sessions"
        onPress={() => void refreshManually()}
      >
        <Text style={styles.refresh}>{manualRefreshing ? "…" : "Refresh"}</Text>
      </Pressable>
    </View>
  );

  const notices = (
    <View style={styles.notice}>
      {query.isLoading ? <ActivityIndicator color={theme.colors.accent} /> : null}

      {data && !data.available ? (
        <Text style={styles.error}>tmux unavailable: {data.error ?? "not installed"}</Text>
      ) : null}

      {data?.error && data.available ? <Text style={styles.error}>{data.error}</Text> : null}
      {query.isError ? <Text style={styles.error}>Could not load tmux sessions on {host.label}.</Text> : null}

      {attachMutation.isError ? (
        <Text style={styles.error}>
          Attach failed:{" "}
          {attachMutation.error instanceof Error
            ? attachMutation.error.message
            : String(attachMutation.error)}
        </Text>
      ) : null}
      {killMutation.isError ? (
        <Text style={styles.error}>Close failed: {killMutation.error instanceof Error ? killMutation.error.message : String(killMutation.error)}</Text>
      ) : null}
    </View>
  );

  const empty =
    data?.available && !query.isLoading ? (
      <Text style={[styles.empty, styles.notice]}>No tmux sessions on this host.</Text>
    ) : null;

  const renderItem = ({ item: view }: { item: SessionView }) => {
    const s = view.session;
    const busy = attachMutation.isPending && attachMutation.variables === s.name;
    return (
      <View style={styles.card}>
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Attach to tmux session ${s.name}`}
            disabled={attachMutation.isPending}
            onPress={() => attachMutation.mutate(s.name)}
            style={styles.cardBody}
        >
            <View style={styles.row}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={[styles.dot, { color: s.attached ? theme.colors.accent : theme.colors.foregroundMuted }]}>
                {busy ? "Attaching…" : s.attached ? "● attached" : "○ detached"}
              </Text>
            </View>
            <Text style={styles.meta}>
              {s.windows} window{s.windows === 1 ? "" : "s"}
              {s.command ? ` · ${s.command}` : ""}
              {s.createdAt ? ` · ${relativeAge(s.createdAt)} ago` : ""}
            </Text>
            <Text style={styles.meta}>{s.path || "(no path)"}</Text>
            <Text style={styles.binding}>{bindingLabel(view.binding)}</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable
            style={styles.copyButton}
            accessibilityRole="button"
            accessibilityLabel={`Copy tmux attach command for ${s.name}`}
            onPress={async () => {
              try {
                await copyText(tmuxAttachCommand(s.name));
                toast.show("Command copied", { variant: "success" });
              } catch {
                toast.error("Could not copy command");
              }
            }}
          >
            <Icon name="Copy" size={18} color={theme.colors.accent} />
          </Pressable>
          <Pressable
            style={styles.killButton}
            accessibilityRole="button"
            accessibilityLabel={`Close tmux session ${s.name}`}
            onPress={() => setKillTarget(s)}
          >
            <Icon name="Trash2" size={17} color={theme.colors.statusDanger} />
            <Text style={styles.killLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {headerBar}
      <Text style={styles.hostLabel}>Host: {host.label}</Text>
      <View style={styles.autoRefreshRow}>
        <Text style={styles.autoRefreshLabel}>Auto-refresh every 5s</Text>
        <Switch
          accessibilityLabel="Auto-refresh tmux sessions"
          value={autoRefresh}
          disabled={listSettings.status !== "ready" || listSettings.saving}
          onValueChange={(next) => {
            if (listSettings.status === "ready") {
              void listSettings.save({ autoRefresh: next }, listSettings.revision);
            }
          }}
        />
      </View>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={data?.sessions ?? []}
        keyExtractor={(view) => view.session.name}
        renderItem={renderItem}
        ListHeaderComponent={notices}
        ListEmptyComponent={empty}
        refreshing={manualRefreshing}
        onRefresh={() => void refreshManually()}
      />
      <Modal title="Close tmux session?" open={killTarget !== null} onOpenChange={(open) => { if (!open) setKillTarget(null); }}>
        <Modal.Content>
          <Text style={styles.modalText}>
            {killTarget ? `Kill tmux session “${killTarget.name}” on ${host.label}? Its Paseo connections will close. Processes may continue only if another tmux session shares its windows.` : ""}
          </Text>
          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={() => setKillTarget(null)}>
              <Text style={styles.refresh}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={killMutation.isPending || !killTarget}
              onPress={() => { if (killTarget) killMutation.mutate(killTarget); }}
            >
              <Text style={styles.killLabel}>{killMutation.isPending ? "Closing…" : "Kill session"}</Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}

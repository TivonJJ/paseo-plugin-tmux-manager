import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlatList } from "@getpaseo/plugin/client/ui";

import type { SessionBinding, SessionView } from "../shared/tmux";
import { attachSessionRpc, listSessionsRpc } from "../shared/tmux";

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

export function TmuxScreen({ theme, layout, navigation }: PluginScreenProps) {
  const listSessions = useRpc(listSessionsRpc);
  const attach = useRpc(attachSessionRpc);

  const query = useQuery({
    queryKey: ["tmux-manager", "sessions"],
    queryFn: () => listSessions({}),
    refetchInterval: 5000,
  });

  const attachMutation = useMutation({
    mutationFn: (name: string) => attach({ name }),
    onSuccess: (result) => {
      navigation?.openWorkspace?.({ workspaceId: result.workspaceId });
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
      card: {
        padding: 14,
        borderRadius: 10,
        backgroundColor: theme.colors.surface1,
        marginBottom: 10,
      },
      row: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const },
      name: { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
      meta: { color: theme.colors.foregroundMuted, fontSize: 13, marginTop: 2 },
      binding: { color: theme.colors.foregroundMuted, fontSize: 13, marginTop: 4 },
      dot: { fontSize: 12 },
      empty: { color: theme.colors.foregroundMuted, fontSize: 14, marginTop: 24, textAlign: "center" as const },
      error: { color: theme.colors.statusDanger, fontSize: 14, marginTop: 16 },
      attachBtn: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" as const },
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
        onPress={() => void query.refetch()}
      >
        <Text style={styles.refresh}>{query.isFetching ? "…" : "Refresh"}</Text>
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

      {attachMutation.isError ? (
        <Text style={styles.error}>
          Attach failed:{" "}
          {attachMutation.error instanceof Error
            ? attachMutation.error.message
            : String(attachMutation.error)}
        </Text>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Attach to tmux session ${s.name}`}
        disabled={attachMutation.isPending}
        onPress={() => attachMutation.mutate(s.name)}
        style={styles.card}
      >
        <View style={styles.row}>
          <Text style={styles.name}>{s.name}</Text>
          <Text
            style={[styles.dot, { color: s.attached ? theme.colors.accent : theme.colors.foregroundMuted }]}
          >
            {s.attached ? "● attached" : "○ detached"}
          </Text>
        </View>
        <Text style={styles.meta}>
          {s.windows} window{s.windows === 1 ? "" : "s"}
          {s.command ? ` · ${s.command}` : ""}
          {s.createdAt ? ` · ${relativeAge(s.createdAt)} ago` : ""}
        </Text>
        <Text style={styles.meta}>{s.path || "(no path)"}</Text>
        <View style={styles.row}>
          <Text style={styles.binding}>{bindingLabel(view.binding)}</Text>
          <Text style={styles.attachBtn}>{busy ? "Attaching…" : "Attach"}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      {headerBar}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={data?.sessions ?? []}
        keyExtractor={(view) => view.session.name}
        renderItem={renderItem}
        ListHeaderComponent={notices}
        ListEmptyComponent={empty}
        refreshing={query.isFetching}
        onRefresh={() => void query.refetch()}
      />
    </View>
  );
}

import { GitBranch } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BracketConnectors } from '@/components/tournaments/BracketConnectors';
import { BracketMatchNode } from '@/components/tournaments/BracketMatchNode';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { HEADER_H, layoutBracket, NODE_W } from '@/lib/bracketLayout';
import { roundHeader, tint } from '@/lib/tournamentFormat';
import type { ModuleStatus, TournamentMatch } from '@/types';

export function BracketView({
  matches,
  moduleStatus,
  viewerId,
  isAdmin,
  onSelectMatch,
}: {
  matches: TournamentMatch[];
  moduleStatus: ModuleStatus;
  viewerId: string | undefined;
  isAdmin: boolean;
  onSelectMatch: (match: TournamentMatch) => void;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const layout = useMemo(() => layoutBracket(matches), [matches]);
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Entries linked to the viewer → highlight their path.
  const myEntryIds = useMemo(() => {
    const ids = new Set<string>();
    if (!viewerId) return ids;
    for (const m of matches) {
      if (m.entry_a?.profile_id === viewerId) ids.add(m.entry_a.id);
      if (m.entry_b?.profile_id === viewerId) ids.add(m.entry_b.id);
    }
    return ids;
  }, [matches, viewerId]);

  const highlightedMatches = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) {
      if ((m.entry_a && myEntryIds.has(m.entry_a.id)) || (m.entry_b && myEntryIds.has(m.entry_b.id))) s.add(m.id);
    }
    return s;
  }, [matches, myEntryIds]);

  const highlightedConnectors = useMemo(() => {
    const s = new Set<string>();
    for (const c of layout.connectors) {
      const from = byId.get(c.fromMatchId);
      if (from?.winner_entry_id && myEntryIds.has(from.winner_entry_id)) {
        s.add(`${c.fromMatchId}>${c.toMatchId}`);
      }
    }
    return s;
  }, [layout.connectors, byId, myEntryIds]);

  if (matches.length === 0) {
    return (
      <View style={styles.empty}>
        <GitBranch size={48} color={theme.textSecondary} strokeWidth={1.5} />
        <ThemedText variant="heading">Bracket not generated yet</ThemedText>
        {isAdmin && <ThemedText muted style={{ textAlign: 'center' }}>Generate it from Manage → Seeding.</ThemedText>}
      </View>
    );
  }

  const roundInfo = new Map<number, { name: string; bestOf: number }>();
  for (const m of matches) {
    if (!m.is_third_place && !roundInfo.has(m.round_number)) {
      roundInfo.set(m.round_number, { name: m.round_name, bestOf: m.best_of });
    }
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      {moduleStatus === 'seeding' && (
        <View style={[styles.banner, { backgroundColor: tint(theme.warning) }]}>
          <ThemedText variant="caption" style={{ color: theme.warning, fontWeight: '700' }}>
            Draft bracket — may change
          </ThemedText>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {layout.columns.map((c) => {
          const info = roundInfo.get(c.round);
          return (
            <Pressable
              key={c.round}
              onPress={() => scrollRef.current?.scrollTo({ x: Math.max(c.x - Spacing.md, 0), animated: true })}
              style={({ pressed }) => [styles.pill, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <ThemedText variant="caption" style={{ fontWeight: '700' }}>{info?.name ?? `Round ${c.round}`}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={{ width: layout.width, height: layout.height, marginRight: Spacing.md }}>
            {layout.columns.map((c) => {
              const info = roundInfo.get(c.round);
              return (
                <ThemedText
                  key={c.round}
                  variant="caption"
                  muted
                  numberOfLines={1}
                  style={{ position: 'absolute', left: c.x, top: 0, width: NODE_W, height: HEADER_H, fontWeight: '600' }}
                >
                  {info ? roundHeader(info.name, info.bestOf) : ''}
                </ThemedText>
              );
            })}
            <BracketConnectors
              connectors={layout.connectors}
              highlighted={highlightedConnectors}
              width={layout.width}
              height={layout.height}
            />
            {layout.nodes.map((n) => {
              const match = byId.get(n.matchId);
              if (!match) return null;
              return (
                <BracketMatchNode
                  key={n.matchId}
                  match={match}
                  x={n.x}
                  y={n.y}
                  highlighted={highlightedMatches.has(n.matchId)}
                  myEntryIds={myEntryIds}
                  label={n.isThird ? '3rd Place' : undefined}
                  onPress={() => onSelectMatch(match)}
                />
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
  banner: { padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  pills: { gap: Spacing.sm },
  pill: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
});

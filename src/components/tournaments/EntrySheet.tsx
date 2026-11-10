import { Crown, Lock } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { UserAvatar } from '@/components/UserAvatar';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TournamentEntry, TournamentEntryField, TournamentMatch, TournamentModule } from '@/types';

/** Result path of an entry, e.g. "Quarter-finals: beat Zain M. 3–1". */
function entryPath(entryId: string, bracket: TournamentMatch[]): string[] {
  const lines: string[] = [];
  const mine = bracket
    .filter((m) => (m.entry_a?.id === entryId || m.entry_b?.id === entryId))
    .sort((a, b) => Number(a.is_third_place) - Number(b.is_third_place) || a.round_number - b.round_number);
  for (const m of mine) {
    if (m.status === 'bye') {
      lines.push(`${m.round_name}: bye`);
      continue;
    }
    const isA = m.entry_a?.id === entryId;
    const opp = isA ? m.entry_b : m.entry_a;
    if (m.status === 'completed' || m.status === 'walkover') {
      const won = m.winner_entry_id === entryId;
      const own = isA ? m.score_a : m.score_b;
      const other = isA ? m.score_b : m.score_a;
      const score = m.status === 'walkover' ? 'W/O' : `${own ?? 0}–${other ?? 0}`;
      lines.push(`${m.round_name}: ${won ? 'beat' : 'lost to'} ${opp?.name ?? 'TBD'} ${score}`);
    } else {
      lines.push(`${m.round_name}: vs ${opp?.name ?? 'TBD'}`);
    }
  }
  return lines;
}

export function EntrySheet({
  module,
  entry,
  fields,
  bracket,
  isAdmin,
  onClose,
  onOpenProfile,
  footer,
}: {
  module?: Pick<TournamentModule, 'participant_type' | 'roster_min' | 'roster_max'> | null;
  entry: TournamentEntry | null;
  fields: TournamentEntryField[];
  bracket: TournamentMatch[];
  isAdmin: boolean;
  onClose: () => void;
  onOpenProfile: (profileId: string) => void;
  /** Admin actions (edit / withdraw / delete) rendered under the details. */
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const path = entry ? entryPath(entry.id, bracket) : [];
  const rows = entry
    ? fields
        .filter((f) => f.key !== 'name')
        .map((f) => ({ field: f, value: entry.fields[f.key] }))
        .filter((r) => r.value !== undefined && r.value !== '')
    : [];

  return (
    <BottomSheet visible={!!entry} onClose={onClose}>
      {entry && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.titleRow}>
            {entry.seed != null && (
              <View style={[styles.seed, { backgroundColor: theme.backgroundSelected }]}>
                <ThemedText variant="caption" style={{ fontWeight: '700' }}>{entry.seed}</ThemedText>
              </View>
            )}
            <ThemedText variant="heading" style={{ flex: 1 }} numberOfLines={2}>{entry.name}</ThemedText>
          </View>

          {entry.profile && (
            <Pressable
              onPress={() => onOpenProfile(entry.profile!.id)}
              style={({ pressed }) => [styles.profile, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <UserAvatar avatarUrl={entry.profile.avatar_url} size={24} />
              <ThemedText variant="caption">@{entry.profile.username}</ThemedText>
            </Pressable>
          )}

          {entry.members.length > 0 && (
            <View style={styles.roster}>
              <ThemedText variant="label" muted>
                ROSTER ({entry.members.length}
                {module?.roster_min != null && module.roster_max != null
                  ? ` · ${module.roster_min === module.roster_max ? module.roster_max : `${module.roster_min}–${module.roster_max}`} allowed`
                  : ''}
                )
              </ThemedText>
              {entry.members.map((mem) => {
                const memberRows = fields
                  .filter((f) => f.key !== 'name')
                  .map((f) => ({ field: f, value: mem.fields[f.key] }))
                  .filter((r) => r.value !== undefined && r.value !== '');
                return (
                  <View key={mem.id} style={[styles.member, { borderColor: theme.border }]}>
                    <Pressable
                      disabled={!mem.profile}
                      onPress={() => mem.profile && onOpenProfile(mem.profile.id)}
                      style={({ pressed }) => [styles.memberHead, pressed && { opacity: 0.6 }]}
                      accessibilityRole={mem.profile ? 'button' : undefined}
                    >
                      {mem.profile && <UserAvatar avatarUrl={mem.profile.avatar_url} size={24} />}
                      <ThemedText style={{ fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{mem.name}</ThemedText>
                      {mem.is_captain && <Crown size={13} color={theme.warning} strokeWidth={2} />}
                      {mem.squad_number != null && <ThemedText variant="caption" muted>#{mem.squad_number}</ThemedText>}
                    </Pressable>
                    {memberRows.length > 0 && (
                      <ThemedText variant="caption" muted>
                        {memberRows.map((r) => r.value).join(' · ')}
                        {isAdmin && memberRows.some((r) => !r.field.is_public) ? '  🔒' : ''}
                      </ThemedText>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {rows.map(({ field, value }) => (
            <View key={field.key} style={[styles.row, { borderColor: theme.border }]}>
              <View style={styles.labelWrap}>
                <ThemedText variant="caption" muted>{field.label}</ThemedText>
                {isAdmin && !field.is_public && <Lock size={11} color={theme.textSecondary} strokeWidth={2} />}
              </View>
              <ThemedText variant="body" style={styles.value}>{value}</ThemedText>
            </View>
          ))}

          {path.length > 0 && (
            <View style={styles.path}>
              <ThemedText variant="label" muted>Path</ThemedText>
              {path.map((l, i) => (
                <ThemedText key={i} variant="caption">{l}</ThemedText>
              ))}
            </View>
          )}

          {footer}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.sm, paddingBottom: Spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  seed: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md, borderBottomWidth: 1, paddingVertical: Spacing.sm },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { flexShrink: 1, textAlign: 'right', fontWeight: '500' },
  roster: { gap: Spacing.xs, marginTop: Spacing.xs },
  member: { borderBottomWidth: 1, paddingVertical: Spacing.sm, gap: 2 },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  path: { gap: 2, marginTop: Spacing.sm },
});

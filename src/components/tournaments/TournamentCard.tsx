import { useRouter } from 'expo-router';
import { Building2, CalendarDays, MapPin, Trophy } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { InfoPill, RoleTag, StatusPill } from '@/components/tournaments/StatusPill';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { formatDateRange, roleTag, sportLabel, tournamentStatusTone } from '@/lib/tournamentFormat';
import type { TournamentListItem } from '@/types';

const IMAGE_ASPECT_RATIO = 16 / 9;
const MAX_SPORT_PILLS = 3;

export function TournamentCard({ tournament }: { tournament: TournamentListItem }) {
  const theme = useTheme();
  const router = useRouter();
  const tone = tournamentStatusTone(tournament.status, tournament.live_module_count);
  const range = formatDateRange(tournament.starts_at, tournament.ends_at);
  const role = roleTag(tournament.my_role);
  const shown = tournament.sports.slice(0, MAX_SPORT_PILLS);
  const extra = tournament.sports.length - shown.length;

  return (
    <Pressable
      onPress={() => router.push(tournamentRoutes.tournament(tournament.id))}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open tournament ${tournament.name}`}
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.imageContainer}>
          {tournament.image_url ? (
            <Image
              source={{ uri: tournament.image_url }}
              style={[styles.image, { backgroundColor: theme.border }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.image, styles.placeholder, { backgroundColor: theme.backgroundSelected }]}>
              <Trophy size={32} color={theme.textSecondary} strokeWidth={1.5} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <ThemedText variant="body" style={styles.name} numberOfLines={1}>
              {tournament.name}
            </ThemedText>
            <StatusPill tone={tone} />
          </View>

          {(tournament.organization || tournament.location) && (
            <View style={styles.metaLine}>
              {tournament.organization && (
                <View style={styles.metaItem}>
                  <Building2 size={12} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" muted numberOfLines={1} style={styles.metaText}>
                    {tournament.organization}
                  </ThemedText>
                </View>
              )}
              {tournament.location && (
                <View style={styles.metaItem}>
                  <MapPin size={12} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" muted numberOfLines={1} style={styles.metaText}>
                    {tournament.location}
                  </ThemedText>
                </View>
              )}
            </View>
          )}

          <View style={styles.pillRow}>
            {shown.map((s) => (
              <InfoPill key={s} label={sportLabel(s)} />
            ))}
            {extra > 0 && <InfoPill label={`+${extra}`} />}
            <ThemedText variant="caption" muted style={styles.metaText}>
              {tournament.module_count} {tournament.module_count === 1 ? 'module' : 'modules'}
            </ThemedText>
          </View>

          {(range || role) && (
            <View style={styles.footer}>
              {range ? (
                <View style={styles.metaItem}>
                  <CalendarDays size={12} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" muted style={styles.metaText}>
                    {range}
                  </ThemedText>
                </View>
              ) : (
                <View />
              )}
              {role && <RoleTag label={role} />}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
  imageContainer: { aspectRatio: IMAGE_ASPECT_RATIO, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  info: { padding: Spacing.md, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  name: { fontWeight: '600', flex: 1 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.xs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  metaText: { fontSize: 11, fontWeight: '500' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm, flexWrap: 'wrap' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
});

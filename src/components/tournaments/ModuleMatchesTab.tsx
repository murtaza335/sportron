import { CalendarClock, Swords } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';

import { TournamentMatchRow } from '@/components/tournaments/TournamentMatchRow';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Collapsible } from '@/components/motion/Collapsible';
import {
  compareByTime,
  dayHeader,
  localDayKey,
  matchSectionKey,
  matchSectionOrder,
  matchSectionTitle,
} from '@/lib/tournamentFormat';
import type { TournamentMatch } from '@/types';
import { HScrollView } from '@/components/HScrollView';

type Filter = 'all' | 'today' | 'schedule' | 'upcoming' | 'results';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'results', label: 'Results' },
];

export function ModuleMatchesTab({
  matches,
  onSelect,
  viewerId,
  moduleLive = false,
  initialView,
}: {
  matches: TournamentMatch[];
  onSelect: (m: TournamentMatch) => void;
  viewerId?: string;
  /** Module is in progress: open on Today when something is scheduled today. */
  moduleLive?: boolean;
  /** From the `?view=` deep link. */
  initialView?: string;
}) {
  const theme = useTheme();
  const [userFilter, setFilter] = useState<Filter | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [mineOnly, setMineOnly] = useState(false);
  const groupLetters = useMemo(
    () => [...new Set(matches.map((m) => m.group_letter).filter((l): l is string => !!l))].sort(),
    [matches],
  );

  // "Today" must follow the clock: refresh when the app returns to the foreground or the screen
  // regains focus (no timers).
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(new Date());
    });
    return () => sub.remove();
  }, []);
  const todayKey = localDayKey(now.toISOString());

  // Default chip is derived during render (no wrong-chip first frame): the deep-linked view, else
  // Today for a live module that has matches today, else All. A tap sticks for the session.
  const hasMatchesToday = useMemo(
    () =>
      matches.some(
        (m) => m.status !== 'bye' && m.status !== 'cancelled' && localDayKey(m.scheduled_at) === todayKey,
      ),
    [matches, todayKey],
  );
  const requested = initialView === 'today' || initialView === 'schedule' ? initialView : null;
  const filter: Filter = userFilter ?? requested ?? (moduleLive && hasMatchesToday ? 'today' : 'all');
  const [showEarlier, setShowEarlier] = useState(false);

  /** Time-ordered matches that are neither byes nor cancelled, honouring the group filter. */
  const isMine = useCallback(
    (m: TournamentMatch) =>
      !!viewerId &&
      (!!m.entry_a?.profile_ids.includes(viewerId) || !!m.entry_b?.profile_ids.includes(viewerId)),
    [viewerId],
  );
  const viewerPlays = useMemo(() => matches.some(isMine), [matches, isMine]);
  const playable = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.status !== 'bye' &&
          m.status !== 'cancelled' &&
          (groupFilter === 'all' || m.group_letter === groupFilter) &&
          (!mineOnly || isMine(m)),
      ),
    [matches, groupFilter, mineOnly, isMine],
  );

  const multiVenue = useMemo(
    () => new Set(playable.map((m) => m.venue).filter(Boolean)).size > 1,
    [playable],
  );

  const timeView = useMemo(() => {
    const scheduled = playable.filter((m) => localDayKey(m.scheduled_at) != null);
    const byDay = new Map<string, TournamentMatch[]>();
    for (const m of scheduled) {
      const k = localDayKey(m.scheduled_at) as string;
      byDay.set(k, [...(byDay.get(k) ?? []), m]);
    }
    const days = [...byDay.keys()].sort().map((key) => ({
      key,
      items: (byDay.get(key) as TournamentMatch[]).sort(compareByTime),
    }));
    const unscheduled = playable
      .filter(
        (m) =>
          localDayKey(m.scheduled_at) == null && m.status !== 'completed' && m.status !== 'walkover',
      )
      .sort(
        (a, b) => matchSectionOrder(a) - matchSectionOrder(b) || a.match_number - b.match_number,
      );
    return {
      today: todayKey ? (byDay.get(todayKey) ?? []).slice().sort(compareByTime) : [],
      earlier: days.filter((d) => todayKey != null && d.key < todayKey),
      upcoming: days.filter((d) => todayKey == null || d.key >= todayKey),
      nextDay: days.find((d) => todayKey != null && d.key > todayKey) ?? null,
      unscheduled,
    };
  }, [playable, todayKey]);

  const sections = useMemo(() => {
    const visible = matches.filter((m) => {
      if (groupFilter !== 'all' && m.group_letter !== groupFilter) return false;
      if (m.status === 'bye' || m.status === 'cancelled') return filter === 'all';
      const decided = m.status === 'completed' || m.status === 'walkover';
      if (filter === 'upcoming') return !decided;
      if (filter === 'results') return decided;
      return true;
    });
    const groups = new Map<string, { key: string; title: string; order: number; items: TournamentMatch[] }>();
    for (const m of visible) {
      const key = matchSectionKey(m);
      const g = groups.get(key) ?? {
        key,
        title: matchSectionTitle(m),
        order: matchSectionOrder(m),
        items: [],
      };
      g.items.push(m);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ ...g, items: g.items.sort((a, b) => a.match_number - b.match_number) }));
  }, [matches, filter, groupFilter]);

  const timeRow = (m: TournamentMatch) => (
    <TournamentMatchRow
      key={m.id}
      match={m}
      mode="time"
      contextExtra={multiVenue ? m.venue : null}
      onPress={() => onSelect(m)}
      viewerId={viewerId}
    />
  );
  const daySection = (d: { key: string; items: TournamentMatch[] }) => (
    <View key={d.key} style={{ gap: Spacing.sm }}>
      <ThemedText variant="label" muted>{dayHeader(d.key, now)}</ThemedText>
      {d.items.map(timeRow)}
    </View>
  );
  const earlierCount = timeView.earlier.reduce((n, d) => n + d.items.length, 0);

  return (
    <View style={{ gap: Spacing.md }}>
      <HScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const sel = f.value === filter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[
                styles.chip,
                { borderColor: theme.border },
                sel && { backgroundColor: theme.text, borderColor: theme.text },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
            >
              <ThemedText variant="caption" numberOfLines={1} style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </HScrollView>

      {(filter === 'today' || filter === 'schedule') && viewerPlays && (
        <View style={styles.chips}>
          {[false, true].map((mine) => {
            const sel = mineOnly === mine;
            return (
              <Pressable
                key={String(mine)}
                onPress={() => setMineOnly(mine)}
                style={[
                  styles.chip,
                  { borderColor: theme.border },
                  sel && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                  {mine ? 'My matches' : 'Everyone'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {groupLetters.length > 1 && (
        <HScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {['all', ...groupLetters].map((l) => {
            const sel = l === groupFilter;
            return (
              <Pressable
                key={l}
                onPress={() => setGroupFilter(l)}
                style={[
                  styles.chip,
                  { borderColor: theme.border },
                  sel && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                  {l === 'all' ? 'All groups' : `Group ${l}`}
                </ThemedText>
              </Pressable>
            );
          })}
        </HScrollView>
      )}

      {filter === 'today' ? (
        timeView.today.length > 0 ? (
          <View style={{ gap: Spacing.sm }}>{timeView.today.map(timeRow)}</View>
        ) : (
          <View style={styles.empty}>
            <CalendarClock size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="heading">No matches scheduled today</ThemedText>
            {timeView.nextDay && (
              <>
                <ThemedText muted style={{ textAlign: 'center' }}>
                  Next: {dayHeader(timeView.nextDay.key, now)} · {timeView.nextDay.items.length}{' '}
                  {timeView.nextDay.items.length === 1 ? 'match' : 'matches'}
                </ThemedText>
                <Pressable
                  onPress={() => setFilter('schedule')}
                  style={[styles.chip, { borderColor: theme.border }]}
                  accessibilityRole="button"
                >
                  <ThemedText variant="caption" style={{ fontWeight: '700' }}>View schedule</ThemedText>
                </Pressable>
              </>
            )}
          </View>
        )
      ) : filter === 'schedule' ? (
        timeView.upcoming.length === 0 && earlierCount === 0 && timeView.unscheduled.length === 0 ? (
          <View style={styles.empty}>
            <CalendarClock size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="heading">{matches.length === 0 ? 'No matches yet' : 'Nothing here'}</ThemedText>
            <ThemedText muted style={{ textAlign: 'center' }}>
              {matches.length === 0 ? 'Matches appear once the fixtures are generated.' : 'Try another filter.'}
            </ThemedText>
          </View>
        ) : (
          <View style={{ gap: Spacing.md }}>
            {earlierCount > 0 && (
              <View style={{ gap: Spacing.md }}>
                <Pressable
                  onPress={() => setShowEarlier((v) => !v)}
                  style={[styles.chip, { borderColor: theme.border, alignSelf: 'flex-start' }]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showEarlier }}
                >
                  <ThemedText variant="caption" style={{ fontWeight: '700' }}>
                    {showEarlier ? 'Hide' : 'Show'} earlier days ({earlierCount}{' '}
                    {earlierCount === 1 ? 'match' : 'matches'})
                  </ThemedText>
                </Pressable>
                <Collapsible open={showEarlier}>
                  <View style={{ gap: Spacing.md }}>{timeView.earlier.map(daySection)}</View>
                </Collapsible>
              </View>
            )}
            {timeView.upcoming.map(daySection)}
            {timeView.unscheduled.length > 0 && (
              <View style={{ gap: Spacing.sm }}>
                <ThemedText variant="label" muted>Not scheduled yet</ThemedText>
                {timeView.unscheduled.map((m) => (
                  <TournamentMatchRow key={m.id} match={m} onPress={() => onSelect(m)} viewerId={viewerId} />
                ))}
              </View>
            )}
          </View>
        )
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <Swords size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">{matches.length === 0 ? 'No matches yet' : 'Nothing here'}</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {matches.length === 0 ? 'Matches appear once the fixtures are generated.' : 'Try another filter.'}
          </ThemedText>
        </View>
      ) : (
        sections.map((s) => (
          <View key={s.key} style={{ gap: Spacing.sm }}>
            <ThemedText variant="label" muted>{s.title}</ThemedText>
            {s.items.map((m) => (
              <TournamentMatchRow key={m.id} match={m} onPress={() => onSelect(m)} viewerId={viewerId} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.sm },
  chip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
});

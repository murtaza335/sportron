import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAssignScreen } from '@/hooks/useAssignScreen';
import { useCachedLoad } from '@/hooks/useCachedLoad';
import { useTheme } from '@/hooks/use-theme';
import { fetchOrgScreens } from '@/services/organizations';
import type { TournamentDetail } from '@/types';

/** Tournament manage screen: put this tournament on one of the organization's TVs. */
export function ShowOnScreen({ detail }: { detail: TournamentDetail }) {
  const theme = useTheme();
  const { user } = useAuth();
  const t = detail.tournament;
  const orgId = t.organization_id;
  const usable = !!detail.my_org_role && !!orgId && !t.organization_suspended;
  const list = useCachedLoad(usable && user ? `org-screens:${user.id}:${orgId}` : null, () => fetchOrgScreens(orgId!));
  const { assign, busy } = useAssignScreen(list.refresh);
  const screens = list.data ?? [];
  if (!usable || screens.length === 0) return null;

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Show on screen</SectionLabel>
      {t.status !== 'published' && (
        <ThemedText variant="caption" muted>Publish the tournament first.</ThemedText>
      )}
      {screens.map((s) => {
        const here = s.tournament?.id === t.id;
        return (
          <View key={s.id} style={[styles.row, { borderColor: here ? theme.accent : theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={{ flex: 1 }}>
              <ThemedText style={{ fontWeight: '700' }}>{s.name}</ThemedText>
              <ThemedText variant="caption" muted numberOfLines={1}>
                {here ? 'Showing this tournament' : s.tournament ? `Showing ${s.tournament.name}` : 'Nothing assigned'}
              </ThemedText>
            </View>
            {!here && t.status === 'published' && (
              <Button
                label="Show here"
                variant="secondary"
                buttonStyle={{ minHeight: 44, paddingHorizontal: 14 }}
                loading={busy === s.id}
                disabled={!!busy}
                onPress={() => void assign(s, t)}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
});

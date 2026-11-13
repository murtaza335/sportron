import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SheetScrollView } from '@/components/motion/Sheet';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { TextField } from '@/components/tournaments/form';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SportEntry } from '@/hooks/useSports';
import { haptics } from '@/lib/haptics';

/** Searchable list of the extra ("More") sports, shown from the "More" pill in the module form. */
export function MoreSportsSheet({
  visible,
  sports,
  selectedKey,
  onSelect,
  onClose,
}: {
  visible: boolean;
  sports: SportEntry[];
  selectedKey: string | null;
  onSelect: (s: SportEntry) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? sports.filter((s) => s.label.toLowerCase().includes(needle)) : sports;
  }, [q, sports]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.wrap}>
        <ThemedText variant="heading">More sports</ThemedText>
        <View style={styles.search}>
          <Search size={16} color={theme.textSecondary} />
          <View style={{ flex: 1 }}>
            <TextField value={q} onChangeText={setQ} placeholder="Search sports" maxLength={30} />
          </View>
        </View>
        <SheetScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
          {shown.length === 0 ? (
            <ThemedText muted style={{ paddingVertical: Spacing.md }}>
              No match. Pick “Other” and type the sport’s name instead.
            </ThemedText>
          ) : (
            shown.map((s) => {
              const sel = s.key === selectedKey;
              return (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    haptics.selection();
                    onSelect(s);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: theme.border, backgroundColor: sel ? theme.backgroundSelected : 'transparent' },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <ThemedText style={{ flex: 1, fontWeight: sel ? '700' : '500' }}>
                    {s.emoji ? `${s.emoji}  ` : ''}
                    {s.label}
                  </ThemedText>
                  {sel && <Check size={18} color={theme.text} />}
                </Pressable>
              );
            })
          )}
        </SheetScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: Spacing.md, gap: Spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

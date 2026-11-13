import { Copy, Gift } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { celebrate } from '@/components/motion/Confetti';
import { toast } from '@/components/motion/Toast';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { RM } from '@/lib/motion';
import type { TournamentPromo } from '@/types';

/** Group the 6 digits as "482 913" for readability (the copied value stays unspaced). */
const pretty = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

async function copyCode(code: string) {
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator;
    if (Platform.OS === 'web' && nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(code);
      haptics.light();
      toast('Code copied');
      return;
    }
  } catch {
    // fall through to the hint
  }
  toast('Press and hold the code to copy it');
}

/**
 * Ticket-style discount code (A8). `visible` promos show the code straight away; `reveal` promos
 * show dots until tapped (server records the reveal); `hidden` promos only render once unlocked
 * (the tournament screen unlocks them via a long-press on the cover).
 */
export function PromoCodeCard({
  promo,
  onReveal,
}: {
  promo: TournamentPromo;
  onReveal: (promoId: string) => Promise<string | null>;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const code = promo.code;

  const reveal = async () => {
    if (busy || code) return;
    setBusy(true);
    const revealed = await onReveal(promo.id);
    setBusy(false);
    if (revealed) {
      haptics.success();
      celebrate();
    } else {
      toast('Could not reveal the code', 'Please try again.', 'error');
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.accent }]}>
      <View style={styles.head}>
        <Gift size={18} color={theme.accent} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '700' }}>{promo.title}</ThemedText>
          {promo.partner_name ? (
            <ThemedText variant="caption" muted>with {promo.partner_name}</ThemedText>
          ) : null}
        </View>
      </View>

      {promo.description ? <ThemedText variant="caption" muted>{promo.description}</ThemedText> : null}

      <View style={[styles.divider, { borderColor: theme.border }]} />

      {code ? (
        <Animated.View entering={FadeIn.reduceMotion(RM)} style={styles.codeRow}>
          <Animated.View entering={ZoomIn.reduceMotion(RM)}>
            <ThemedText selectable style={[styles.code, { color: theme.accent }]}>{pretty(code)}</ThemedText>
          </Animated.View>
          {Platform.OS === 'web' && (
            <Pressable
              onPress={() => copyCode(code)}
              hitSlop={10}
              style={({ pressed }) => [styles.copy, { borderColor: theme.border }, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Copy discount code"
            >
              <Copy size={14} color={theme.text} strokeWidth={2} />
              <ThemedText variant="caption" style={{ fontWeight: '700' }}>Copy</ThemedText>
            </Pressable>
          )}
        </Animated.View>
      ) : (
        <Pressable
          onPress={reveal}
          disabled={busy}
          style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Tap to reveal your discount code"
        >
          <ThemedText style={[styles.code, { color: theme.textSecondary }]}>• • • • • •</ThemedText>
          <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
            {busy ? 'Revealing…' : 'Tap to reveal'}
          </ThemedText>
        </Pressable>
      )}

      {code ? (
        <ThemedText variant="caption" muted>Show this code at the desk or to the partner to claim your discount.</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  divider: { borderTopWidth: 1, borderStyle: 'dashed' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 6 },
});

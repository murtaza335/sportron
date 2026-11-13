import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Sheet, SheetScrollView } from '@/components/motion/Sheet';
import { CharCounter } from '@/components/motion/CharCounter';
import { toast } from '@/components/motion/Toast';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { closeReport, useReportTarget } from '@/lib/reportStore';
import { REPORT_REASONS, reasonsFor, reportErrorMessage, type ReportReason, type ReportTarget } from '@/lib/reports';
import { submitReport } from '@/services/reports';

const MAX_DETAILS = 500;

/** Mounted once in the root layout; opened from anywhere with `openReport(target)`. */
export function ReportHost() {
  const target = useReportTarget();
  // Keep rendering the last target while the sheet animates out.
  const [shown, setShown] = useState<ReportTarget | null>(null);
  useEffect(() => {
    if (target) setShown(target);
  }, [target]);

  return (
    <Sheet visible={!!target} onClose={closeReport} maxHeight="90%" onClosed={() => setShown(null)}>
      {shown ? <ReportForm key={`${shown.type}:${shown.id}`} target={shown} /> : null}
    </Sheet>
  );
}

function ReportForm({ target }: { target: ReportTarget }) {
  const theme = useTheme();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({ targetType: target.type, targetId: target.id, reason, details });
      haptics.success();
      closeReport();
      toast('Thanks for reporting', 'Our team will review it.');
    } catch (e) {
      haptics.error();
      setError(reportErrorMessage(e)); // keep the draft so the user can retry
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SheetScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ThemedText variant="heading" style={styles.title}>
        Report {target.label}
      </ThemedText>
      <ThemedText variant="caption" muted style={styles.sub}>
        Why are you reporting this?
      </ThemedText>

      <View style={styles.reasons}>
        {reasonsFor(target.type).map((r) => {
          const selected = reason === r;
          return (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                haptics.selection();
                setReason(r);
              }}
              style={({ pressed }) => [
                styles.reason,
                { borderColor: selected ? theme.accent : theme.border, backgroundColor: theme.backgroundElement },
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText variant="label">{REPORT_REASONS[r].label}</ThemedText>
                <ThemedText variant="caption" muted>
                  {REPORT_REASONS[r].description}
                </ThemedText>
              </View>
              <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accent : 'transparent' }]}>
                {selected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        placeholder="Add details (optional)"
        placeholderTextColor={theme.textSecondary}
        value={details}
        onChangeText={setDetails}
        maxLength={MAX_DETAILS}
        multiline
        textAlignVertical="top"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      />
      <CharCounter count={details.length} max={MAX_DETAILS} suffix="" style={styles.counter} />

      <ThemedText variant="caption" muted style={styles.note}>
        Reports are anonymous. The person won&apos;t know who reported them.
      </ThemedText>

      {error ? (
        <ThemedText variant="caption" style={[styles.error, { color: theme.error }]}>
          {error}
        </ThemedText>
      ) : null}

      <Button label="Submit report" onPress={onSubmit} disabled={!reason} loading={submitting} haptic="light" />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 2 },
  sub: { marginBottom: Spacing.md },
  reasons: { gap: Spacing.sm, marginBottom: Spacing.md },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 15,
  },
  counter: { alignSelf: 'flex-end', marginTop: 4 },
  note: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  error: { marginBottom: Spacing.sm },
});

import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { checkTimeConflicts, createSession } from '@/services/sessions';
import type { CreateSessionInput } from '@/types';

function formatDateTime(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const date = new Date(y, m - 1, d, hh, mm);
  return date.toISOString();
}

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [sport, setSport] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('2');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<{ sport: string; date_time: string; location: string }[]>([]);

  const canSave =
    sport.trim().length > 0 &&
    location.trim().length > 0 &&
    date.trim().length > 0 &&
    time.trim().length > 0 &&
    !saving;

  const handleCreate = async () => {
    if (!user?.id || !canSave) return;

    const dateTime = formatDateTime(date, time);

    setSaving(true);
    try {
      const conflicting = await checkTimeConflicts(user.id, dateTime);
      if (conflicting.length > 0) {
        setConflicts(
          conflicting.map((s) => ({
            sport: s.sport,
            date_time: new Date(s.date_time).toLocaleString(),
            location: s.location,
          })),
        );
        setSaving(false);
        return;
      }

      const input: CreateSessionInput = {
        sport: sport.trim(),
        location: location.trim(),
        date_time: dateTime,
        max_participants: parseInt(maxParticipants, 10) || 2,
        description: description.trim() || undefined,
      };

      await createSession(user.id, input);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to create session. Please try again.');
      console.error('Create session error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <X size={24} color={theme.text} strokeWidth={2} />
        </Pressable>
        <ThemedText variant="heading">New Session</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {conflicts.length > 0 && (
            <Card style={styles.conflictCard}>
              <ThemedText variant="body" style={{ color: '#DC2626', fontWeight: '700' }}>
                Time Conflict Detected
              </ThemedText>
              <ThemedText variant="caption" muted style={{ marginTop: Spacing.xs }}>
                You already have a session within ±30 minutes of this time:
              </ThemedText>
              {conflicts.map((c, i) => (
                <View key={i} style={styles.conflictItem}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {c.sport}
                  </ThemedText>
                  <ThemedText variant="caption" muted>
                    {c.date_time} at {c.location}
                  </ThemedText>
                </View>
              ))}
            </Card>
          )}

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Sport
            </ThemedText>
            <TextInput
              value={sport}
              onChangeText={setSport}
              placeholder="e.g. Table Tennis, Badminton"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Location
            </ThemedText>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Gym Hall, Court 3"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.field, { flex: 1 }]}>
              <ThemedText variant="label" muted style={styles.label}>
                Date (YYYY-MM-DD)
              </ThemedText>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="e.g. 2026-07-25"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <ThemedText variant="label" muted style={styles.label}>
                Time (HH:MM)
              </ThemedText>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="e.g. 14:00"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Max Participants
            </ThemedText>
            <TextInput
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              placeholder="2"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Description (optional)
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Any additional info..."
              placeholderTextColor={theme.textSecondary}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                styles.textArea,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              maxLength={300}
            />
          </View>

          <Button
            label={saving ? 'Checking...' : 'Post Session'}
            onPress={handleCreate}
            disabled={!canSave}
            loading={saving}
            buttonStyle={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  container: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  label: {
    marginLeft: Spacing.xs,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submit: {
    marginTop: Spacing.md,
  },
  conflictCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    gap: Spacing.xs,
  },
  conflictItem: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.sm,
    gap: 2,
  },
});

import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { CalendarDays, Clock, Timer, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
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
import { checkTimeConflicts, createSession, MAX_SESSION_FUTURE_DATE } from '@/services/sessions';
import type { CreateSessionInput } from '@/types';

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [sport, setSport] = useState('');
  const [location, setLocation] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const datePickerDismissedAt = useRef(0);
  const timePickerDismissedAt = useRef(0);
  const [maxParticipants, setMaxParticipants] = useState('2');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<{ sport: string; date_time: string; location: string }[]>([]);

  const MAX_DATE = new Date(MAX_SESSION_FUTURE_DATE);

  const EXPIRE_OPTIONS = [
    { label: '15 min', value: 15 },
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
  ];
  const [expireIndex, setExpireIndex] = useState(1); // 30 min default

  const canSave =
    sport.trim().length > 0 &&
    location.trim().length > 0 &&
    !saving;

  const handleCreate = async () => {
    if (!user?.id || !canSave) return;

    const dateTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes(),
    ).toISOString();

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 7);
    if (new Date(dateTime) > maxDate) {
      Alert.alert('Invalid Date', 'Session date cannot be more than 7 days in the future.');
      return;
    }

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
        expireAfterMinutes: EXPIRE_OPTIONS[expireIndex].value,
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
                Date
              </ThemedText>
              <Pressable
                onPress={() => {
                  if (Date.now() - datePickerDismissedAt.current < 600) return;
                  setShowDatePicker(true);
                }}
                style={[
                  styles.input,
                  styles.pickerButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <CalendarDays size={18} color={theme.textSecondary} />
                <ThemedText variant="body">
                  {selectedDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </ThemedText>
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={new Date()}
                  maximumDate={MAX_DATE}
                  onChange={(event: DateTimePickerEvent, date?: Date) => {
                    // Always close the picker on Android when an action occurs ('set' or 'dismissed')
                    if (Platform.OS === 'android') {
                      setShowDatePicker(false);
                      datePickerDismissedAt.current = Date.now();
                    }

                    if (event.type === 'dismissed') return;

                    if (date) setSelectedDate(date);
                  }}
                />
              )}
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <ThemedText variant="label" muted style={styles.label}>
                Time
              </ThemedText>
              <Pressable
                onPress={() => {
                  if (Date.now() - timePickerDismissedAt.current < 600) return;
                  setShowTimePicker(true);
                }}
                style={[
                  styles.input,
                  styles.pickerButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Clock size={18} color={theme.textSecondary} />
                <ThemedText variant="body">
                  {selectedTime.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </ThemedText>
              </Pressable>
              {showTimePicker && (
                <DateTimePicker
                  value={selectedTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event: DateTimePickerEvent, date?: Date) => {
                    // Always close the picker on Android when an action occurs ('set' or 'dismissed')
                    if (Platform.OS === 'android') {
                      setShowTimePicker(false);
                      timePickerDismissedAt.current = Date.now();
                    }

                    if (event.type === 'dismissed') return;

                    if (date) setSelectedTime(date);
                  }}
                />
              )}
            </View>
          </View>
          {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
            <Pressable
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}
              style={styles.doneButton}
            >
              <ThemedText variant="body" style={{ color: '#3B82F6', fontWeight: '600' }}>
                Done
              </ThemedText>
            </Pressable>
          )}

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
              Expire After
            </ThemedText>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.expireRow}
            >
              {EXPIRE_OPTIONS.map((opt, idx) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setExpireIndex(idx)}
                  style={[
                    styles.expireChip,
                    {
                      backgroundColor: idx === expireIndex ? theme.text : theme.backgroundElement,
                      borderColor: idx === expireIndex ? theme.text : theme.border,
                    },
                  ]}
                >
                  <Timer size={12} color={idx === expireIndex ? theme.background : theme.textSecondary} strokeWidth={2} />
                  <ThemedText
                    variant="caption"
                    style={{
                      color: idx === expireIndex ? theme.background : theme.textSecondary,
                      fontWeight: '700',
                    }}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  doneButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  submit: {
    marginTop: Spacing.md,
  },
  expireRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  expireChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
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

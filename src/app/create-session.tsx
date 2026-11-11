import { PressableScale } from '@/components/motion/PressableScale';
import { useRemoteConfig } from '@/contexts/RemoteConfigContext';
import { haptics } from '@/lib/haptics';
import { CharCounter } from '@/components/motion/CharCounter';
import { FocusTextInput } from '@/components/motion/FocusTextInput';
import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { useRouter } from 'expo-router';
import { CalendarDays, Clock, Timer, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { alert } from '@/lib/alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  checkTimeConflicts,
  createSession,
  getMaxSessionFutureDate,
  MAX_SESSION_PARTICIPANTS,
  MIN_SESSION_PARTICIPANTS,
} from '@/services/sessions';
import type { CreateSessionInput, SessionPurpose } from '@/types';
import { MAX_SESSION_TITLE_LENGTH, SESSION_PURPOSES, SESSION_PURPOSE_LABELS } from '@/types';
import { goBack } from '@/lib/nav';
import { HScrollView } from '@/components/HScrollView';

function combineDateAndTime(date: Date, time: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time.getHours(),
    time.getMinutes(),
  );
}

export default function CreateSessionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [purpose, setPurpose] = useState<SessionPurpose | null>(null);
  const [title, setTitle] = useState('');
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
  const [conflicts, setConflicts] = useState<{ purpose: string; date_time: string; location: string }[]>([]);

  const MAX_DATE = getMaxSessionFutureDate();

  const remoteExpire = useRemoteConfig<{ label: string; value: number }[] | null>('expire_options', null);
  const bundledExpire = [
    { label: '30 min', value: 30 },
    { label: '1 hr', value: 60 },
    { label: '2 hr', value: 120 },
    { label: '3 hr', value: 180 },
    { label: '4 hr', value: 240 },
    { label: '5 hr', value: 300 },
    { label: '6 hr', value: 360 },
  ];
  // Remote list (B4) when valid; the server still enforces its own expiry rules.
  const EXPIRE_OPTIONS =
    Array.isArray(remoteExpire) &&
    remoteExpire.length > 0 &&
    remoteExpire.every((o) => typeof o?.label === 'string' && Number.isFinite(o?.value) && o.value > 0)
      ? remoteExpire
      : bundledExpire;
  const [expireIndex, setExpireIndex] = useState(0); // 30 min default

  const handleParticipantsChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits === '') {
      setMaxParticipants('');
      return;
    }
    const num = parseInt(digits, 10);
    setMaxParticipants(String(Math.min(Math.max(num, MIN_SESSION_PARTICIPANTS), MAX_SESSION_PARTICIPANTS)));
  };

  const participantsNum = parseInt(maxParticipants, 10);
  const participantsValid =
    !Number.isNaN(participantsNum) &&
    participantsNum >= MIN_SESSION_PARTICIPANTS &&
    participantsNum <= MAX_SESSION_PARTICIPANTS;

  const canSave =
    purpose !== null &&
    title.trim().length > 0 &&
    location.trim().length > 0 &&
    participantsValid &&
    !saving;

  const handleCreate = async () => {
    if (!user?.id || !canSave) return;

    if (!purpose) {
      alert('Select a purpose', 'Please choose what this session is for.');
      return;
    }
    if (!title.trim()) {
      alert('Missing title', 'Please add a short title for this session.');
      return;
    }

    const dateTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      selectedTime.getHours(),
      selectedTime.getMinutes(),
    ).toISOString();

    if (new Date(dateTime).getTime() < Date.now() - 60 * 1000) {
      alert('Invalid time', 'Pick a time in the future.');
      return;
    }
    if (new Date(dateTime) > getMaxSessionFutureDate()) {
      alert('Invalid Date', 'Session date cannot be more than 7 days in the future.');
      return;
    }

    if (!participantsValid) {
      alert(
        'Invalid Participants',
        `Please enter a number between ${MIN_SESSION_PARTICIPANTS} and ${MAX_SESSION_PARTICIPANTS}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const conflicting = await checkTimeConflicts(user.id, dateTime);
      if (conflicting.length > 0) {
        setConflicts(
          conflicting.map((s) => ({
            purpose: s.purpose,
            date_time: new Date(s.date_time).toLocaleString(),
            location: s.location,
          })),
        );
        setSaving(false);
        return;
      }

      const input: CreateSessionInput = {
        purpose,
        title: title.trim(),
        location: location.trim(),
        date_time: dateTime,
        max_participants: participantsNum,
        description: description.trim() || undefined,
        expireAfterMinutes: EXPIRE_OPTIONS[expireIndex].value,
      };

      await createSession(user.id, input);
      goBack(router, '/history');
    } catch (e) {
      alert('Error', 'Failed to create session. Please try again.');
      console.error('Create session error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => goBack(router, '/history')} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <X size={24} color={theme.text} strokeWidth={2} />
        </Pressable>
        <ThemedText variant="heading">New Session</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoider
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + Spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          {conflicts.length > 0 && (
            <Card style={[styles.conflictCard, { backgroundColor: `${theme.error}08`, borderColor: `${theme.error}30` }]}>
              <ThemedText variant="body" style={{ color: theme.error, fontWeight: '700' }}>
                Time Conflict Detected
              </ThemedText>
              <ThemedText variant="caption" muted style={{ marginTop: Spacing.xs }}>
                You already have a session within ±30 minutes of this time:
              </ThemedText>
              {conflicts.map((c, i) => (
                <View key={i} style={[styles.conflictItem, { backgroundColor: `${theme.error}15` }]}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {c.purpose}
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
              Purpose
            </ThemedText>
            <HScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.purposePicker}>
              {SESSION_PURPOSES.map((p) => {
                const selected = p === purpose;
                return (
                  <PressableScale
                    key={p}
                    scaleTo={0.94}
                    onPress={() => {
                      if (!selected) haptics.selection();
                      setPurpose(p);
                    }}
                    style={[
                      styles.purposePill,
                      { borderColor: theme.border },
                      selected && { backgroundColor: theme.text, borderColor: theme.text },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={[
                        styles.purposePillText,
                        selected && { color: theme.background },
                      ]}
                    >
                      {SESSION_PURPOSE_LABELS[p]}
                    </ThemedText>
                  </PressableScale>
                );
              })}
            </HScrollView>
            {purpose === null && (
              <ThemedText variant="caption" muted style={styles.hintText}>
                Select a purpose
              </ThemedText>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Short Title
            </ThemedText>
            <FocusTextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Evening doubles"
              placeholderTextColor={theme.textSecondary}
              maxLength={MAX_SESSION_TITLE_LENGTH}
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
            <CharCounter count={title.length} max={MAX_SESSION_TITLE_LENGTH} style={styles.hintText} />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Location
            </ThemedText>
            <FocusTextInput
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

          {Platform.OS === 'web' ? (
            // @react-native-community/datetimepicker has no web implementation: use a native
            // datetime-local input (BUG-H7).
            <View style={styles.field}>
              <ThemedText variant="label" muted style={styles.label}>
                Date & time
              </ThemedText>
              <DateTimeField
                value={combineDateAndTime(selectedDate, selectedTime)}
                onChange={(d) => {
                  if (!d) return;
                  setSelectedDate(d);
                  setSelectedTime(d);
                }}
                clearable={false}
                min={new Date()}
                max={MAX_DATE}
              />
            </View>
          ) : (
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
          )}
          {Platform.OS === 'ios' && (showDatePicker || showTimePicker) && (
            <Pressable
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}
              style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <ThemedText variant="body" style={{ color: theme.info, fontWeight: '600' }}>
                Done
              </ThemedText>
            </Pressable>
          )}

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Max Participants
            </ThemedText>
            <FocusTextInput
              value={maxParticipants}
              onChangeText={handleParticipantsChange}
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
            <ThemedText variant="caption" muted style={styles.hintText}>
              {MIN_SESSION_PARTICIPANTS}–{MAX_SESSION_PARTICIPANTS} participants
            </ThemedText>
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Duration
            </ThemedText>
            <HScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.expireRow}
            >
              {EXPIRE_OPTIONS.map((opt, idx) => (
                <PressableScale
                  key={opt.value}
                  scaleTo={0.94}
                  onPress={() => {
                    if (idx !== expireIndex) haptics.selection();
                    setExpireIndex(idx);
                  }}
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
                </PressableScale>
              ))}
            </HScrollView>
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Description (optional)
            </ThemedText>
            <FocusTextInput
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
      </KeyboardAvoider>
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
  hintText: {
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
  purposePicker: {
    flexDirection: 'row',
  },
  purposePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  purposePillText: {
    fontWeight: '700',
    fontSize: 13,
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
    gap: Spacing.xs,
  },
  conflictItem: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    gap: 2,
  },
});

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { CheckCircle, XCircle } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { respondToPing } from '@/services/communities';

export default function PingResponseScreen() {
  const { pingId, communityId, message, senderName } = useLocalSearchParams<{
    pingId: string;
    communityId: string;
    message: string;
    senderName: string;
  }>();
  const theme = useTheme();
  const { user } = useAuth();
  const [responding, setResponding] = useState(false);

  const handleRespond = async (response: 'coming' | 'busy') => {
    if (!pingId || !communityId || !user?.id) return;
    setResponding(true);
    try {
      await respondToPing(pingId, communityId, user.id, response);
      Alert.alert(
        response === 'coming' ? 'Coming!' : 'Marked as Busy',
        `You responded "${response === 'coming' ? 'Coming' : 'Busy'}" to ${senderName ?? 'the ping'}.`,
      );
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send response.');
    } finally {
      setResponding(false);
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Ping Response',
          animation: 'slide_from_right',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.background },
        }}
      />

      <View style={styles.container}>
        <Card style={styles.pingCard}>
          <View style={styles.pingHeader}>
            <ThemedText variant="label" muted>From</ThemedText>
            <ThemedText variant="heading" style={{ marginTop: 2 }}>
              {senderName ?? 'Someone'}
            </ThemedText>
          </View>

          {message ? (
            <View style={[styles.messageBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText variant="body" style={{ fontStyle: 'italic' }}>
                &ldquo;{message}&rdquo;
              </ThemedText>
            </View>
          ) : null}
        </Card>

        <ThemedText variant="body" style={{ textAlign: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md }}>
          Are you coming?
        </ThemedText>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => handleRespond('coming')}
            disabled={responding}
            style={({ pressed }) => [
              styles.optionButton,
              {
                backgroundColor: pressed ? '#10B98130' : '#10B98115',
                borderColor: '#10B981',
                opacity: responding ? 0.6 : 1,
              },
            ]}
          >
            <CheckCircle size={28} color="#10B981" strokeWidth={2.5} />
            <ThemedText variant="heading" style={{ color: '#10B981', fontWeight: '800' }}>
              Coming
            </ThemedText>
          </Pressable>

          <Pressable
            onPress={() => handleRespond('busy')}
            disabled={responding}
            style={({ pressed }) => [
              styles.optionButton,
              {
                backgroundColor: pressed ? '#EF444430' : '#EF444415',
                borderColor: '#EF4444',
                opacity: responding ? 0.6 : 1,
              },
            ]}
          >
            <XCircle size={28} color="#EF4444" strokeWidth={2.5} />
            <ThemedText variant="heading" style={{ color: '#EF4444', fontWeight: '800' }}>
              Busy
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  pingCard: {
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  pingHeader: {
    alignItems: 'center',
  },
  messageBox: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  optionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 2,
  },
});

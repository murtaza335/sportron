// src/components/EnablePushNotificationsButton.tsx
import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { useFCM } from '@/hooks/useFCM';

/**
 * Button that triggers web push permission request and token retrieval.
 * Visible only on web (PWA) builds. On native platforms it renders nothing.
 * Uses the unified useFCM hook for consistency with profile/settings toggles.
 */
export const EnablePushNotificationsButton = () => {
  const { requestPermissions, isLoading } = useFCM();

  if (Platform.OS !== 'web') {
    return null;
  }

  const handlePress = async () => {
    await requestPermissions();
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handlePress} disabled={isLoading}>
      {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>Enable Web Push Notifications</Text>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

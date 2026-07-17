import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UserRole } from '@/types';
import { uploadImageFromUri, type UploadProgress } from '@/lib/cloudinary';

type ProfileFormProps = {
  initialName?: string;
  initialBio?: string;
  initialRole?: UserRole;
  initialAvatar?: string | null;
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (data: { displayName: string; bio: string; role: UserRole; avatarUrl?: string | null }) => void;
};

export function ProfileForm({
  initialName = '',
  initialBio = '',
  initialRole = 'student',
  initialAvatar = null,
  submitLabel = 'Continue',
  loading = false,
  onSubmit,
}: ProfileFormProps) {
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const canSubmit = displayName.trim().length > 0;

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please grant permission to access your photos to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadingAvatar(true);
      setUploadProgress({ loaded: 0, total: 0, percentage: 0 });
      try {
        const uri = result.assets[0].uri;
        const uploadedUrl = await uploadImageFromUri(uri, (progress) => {
          setUploadProgress(progress);
        });
        if (uploadedUrl) {
          setAvatarUrl(uploadedUrl);
        } else {
          Alert.alert('Upload failed', 'Could not upload profile picture. Please try again.');
        }
      } catch (error) {
        console.error('Avatar upload failed:', error);
        Alert.alert('Upload failed', 'Could not upload profile picture. Please try again.');
      } finally {
        setUploadingAvatar(false);
        setUploadProgress(null);
      }
    }
  };

  const removeAvatar = () => {
    setAvatarUrl(null);
  };

  return (
    <View style={styles.container}>
      {/* Avatar Section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarContainer}>
          {avatarUrl ? (
            <>
              <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                <Image
                  source={{ uri: avatarUrl }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>
              {uploadingAvatar && uploadProgress && (
                <View style={styles.circularProgressContainer}>
                  <Svg width="100" height="100">
                    <Circle
                      cx="50"
                      cy="50"
                      r="45"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="4"
                      fill="none"
                    />
                    <Circle
                      cx="50"
                      cy="50"
                      r="45"
                      stroke="#10B981"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={2 * Math.PI * 45}
                      strokeDashoffset={2 * Math.PI * 45 * (1 - uploadProgress.percentage / 100)}
                      strokeLinecap="round"
                      transform="rotate(-90, 50, 50)"
                    />
                  </Svg>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.avatar, { backgroundColor: theme.text }]}>
              <ThemedText variant="hero" style={{ color: theme.background }}>
                {displayName.charAt(0)?.toUpperCase() ?? '?'}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.avatarActions}>
          <Pressable
            onPress={pickImage}
            disabled={loading || uploadingAvatar}
            style={[
              styles.avatarButton,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
            hitSlop={12}>
            <ThemedText variant="caption" style={{ fontWeight: '700', color: theme.text }}>
              {avatarUrl ? 'Change Photo' : 'Add Photo'}
            </ThemedText>
          </Pressable>
          {avatarUrl && (
            <Pressable
              onPress={removeAvatar}
              disabled={loading || uploadingAvatar}
              style={styles.avatarButtonRemove}
              hitSlop={12}>
              <ThemedText variant="caption" style={{ fontWeight: '700', color: '#DC2626' }}>
                Remove
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Name
        </ThemedText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          accessibilityLabel="Display name"
        />
      </View>

      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Bio (optional)
        </ThemedText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border }]}
          multiline
          numberOfLines={3}
          autoCorrect={false}
          accessibilityLabel="Bio"
        />
      </View>

      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Role
        </ThemedText>
        <View style={[styles.roleRow, { borderColor: theme.border }]}>
          {(['student', 'teacher'] as UserRole[]).map((option) => {
            const selected = role === option;
            return (
              <Pressable
                key={option}
                onPress={() => setRole(option)}
                style={[
                  styles.roleOption,
                  selected && { backgroundColor: theme.text },
                ]}
                hitSlop={16}
                accessibilityRole="button"
                accessibilityState={{ selected }}>
                <ThemedText
                  variant="body"
                  style={{
                    color: selected ? theme.background : theme.text,
                    fontWeight: '700',
                    textTransform: 'capitalize',
                  }}>
                  {option}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        label={submitLabel}
        loading={loading}
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({
            displayName: displayName.trim(),
            bio: bio.trim(),
            role,
            avatarUrl,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  avatarContainer: {
    position: 'relative',
    width: 100,
    height: 100,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  circularProgressContainer: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  avatarButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  avatarButtonRemove: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  field: {
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    minHeight: 56,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  roleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  roleOption: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
});
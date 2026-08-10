import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { uploadImageFromUri, type UploadProgress } from '@/lib/cloudinary';
import { isUsernameAvailable } from '@/services/profiles';
import type { UserRole } from '@/types';

type ProfileFormProps = {
  initialName?: string;
  initialBio?: string;
  initialRole?: UserRole;
  initialAvatar?: string | null;
  submitLabel?: string;
  loading?: boolean;
  excludeUsername?: string;
  onSubmit: (data: { username: string; bio: string; role: UserRole; avatarUrl?: string | null }) => void;
};

// Extracted for clean SVG math
const RING_RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ProfileForm({
  initialName = '',
  initialBio = '',
  initialRole = 'student',
  initialAvatar = null,
  submitLabel = 'Continue',
  loading = false,
  excludeUsername,
  onSubmit,
}: ProfileFormProps) {
  const theme = useTheme();
  const [username, setUsername] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [role, setRole] = useState<UserRole>(initialRole);
const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [checked, setChecked] = useState<{ value: string; status: 'available' | 'taken' | 'error' } | null>(null);

  const value = username.trim().toLowerCase();
  const isOwnUsername = !!excludeUsername && value === excludeUsername.trim().toLowerCase();

  const checking = value.length > 0 && !isOwnUsername && checked?.value !== value;
  const taken = checked?.value === value && checked.status === 'taken';
  const available = isOwnUsername || (checked?.value === value && checked.status === 'available');
  const canSubmit = value.length > 0 && available;

  useEffect(() => {
    const currentValue = username.trim().toLowerCase();
    const isOwn = !!excludeUsername && currentValue === excludeUsername.trim().toLowerCase();

    const timer = setTimeout(async () => {
      if (!currentValue || isOwn) {
        setChecked(null);
        return;
      }
      try {
        const isAvailable = await isUsernameAvailable(currentValue, excludeUsername);
        setChecked({ value: currentValue, status: isAvailable ? 'available' : 'taken' });
      } catch (error) {
        console.error('Username availability check failed:', error);
        setChecked({ value: currentValue, status: 'error' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username, excludeUsername]);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please grant permission to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const previousAvatarUrl = avatarUrl;
      
      // Optimistic UI: Show the local image immediately so the progress ring has a truthy condition to render over
      setAvatarUrl(uri);
      setUploadingAvatar(true);
      setUploadProgress({ loaded: 0, total: 0, percentage: 0 });

      try {
        const uploadedUrl = await uploadImageFromUri(uri, (progress) => {
          setUploadProgress(progress);
        });
        
        if (uploadedUrl) {
          setAvatarUrl(uploadedUrl); // Replace local URI with the remote Cloudinary URL
        } else {
          setAvatarUrl(previousAvatarUrl); // Revert on failure
          Alert.alert('Upload failed', 'Could not upload profile picture. Please try again.');
        }
      } catch (error) {
        console.error('Avatar upload failed:', error);
        setAvatarUrl(previousAvatarUrl); // Revert on failure
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
                  {/* Container is 108x108. Center is 54,54. Radius 52 fits perfectly around the 100x100 avatar. */}
                  <Svg width="108" height="108">
                    <Circle
                      cx="54"
                      cy="54"
                      r={RING_RADIUS}
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="4"
                      fill="none"
                    />
                    <Circle
                      cx="54"
                      cy="54"
                      r={RING_RADIUS}
                      stroke="#10B981"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                      strokeDashoffset={CIRCUMFERENCE * (1 - Math.max(0, uploadProgress.percentage) / 100)}
                      strokeLinecap="round"
                      transform="rotate(-90, 54, 54)"
                    />
                  </Svg>
                </View>
              )}
            </>
          ) : (
            <UserAvatar avatarUrl={null} size={100} />
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
          Username
        </ThemedText>
        <TextInput
          value={username}
          onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
          placeholder="Your username"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          accessibilityLabel="Username"
        />
        {checking ? (
          <ThemedText variant="caption" muted>
            Checking availability…
          </ThemedText>
        ) : taken ? (
          <ThemedText variant="caption" style={{ color: '#DC2626' }}>
            That username is taken. Please choose another one.
          </ThemedText>
        ) : available ? (
          <ThemedText variant="caption" style={{ color: '#10B981' }}>
            Username is available.
          </ThemedText>
        ) : null}
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
            username: username.trim().toLowerCase(),
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
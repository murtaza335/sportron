import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { uploadImageFromUri } from '@/lib/cloudinary';
import { createCommunity } from '@/services/communities';
import type { CommunityVisibility, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';

export default function CreateCommunityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sport, setSport] = useState<Sport>('table_tennis');
  const [visibility, setVisibility] = useState<CommunityVisibility>('public');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving && !uploadingImage;

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please grant permission to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const removeImage = () => {
    setImageUri(null);
  };

  const handleCreate = async () => {
    if (!user?.id || !canSave) return;

    let uploadedUrl: string | null = null;

    if (imageUri) {
      setUploadingImage(true);
      try {
        uploadedUrl = await uploadImageFromUri(imageUri);
        if (!uploadedUrl) {
          Alert.alert('Upload failed', 'Could not upload community image. Please try again.');
          setUploadingImage(false);
          return;
        }
      } catch (e) {
        console.error('Community image upload failed:', e);
        Alert.alert('Upload failed', 'Could not upload community image. Please try again.');
        setUploadingImage(false);
        return;
      }
      setUploadingImage(false);
    }

    setSaving(true);
    try {
      await createCommunity(user.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        sport,
        image_url: uploadedUrl ?? undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to create community. Please try again.');
      console.error('Create community error:', e);
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
        <ThemedText variant="heading">New Community</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + Spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Cover Image (optional)
            </ThemedText>
            {imageUri ? (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: imageUri }}
                  style={[styles.imagePreview, { backgroundColor: theme.border }]}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={removeImage}
                  style={[styles.imageRemoveButton, { backgroundColor: theme.background }]}
                  hitSlop={12}
                >
                  <X size={14} color={theme.text} strokeWidth={2.5} />
                </Pressable>
                <Pressable
                  onPress={pickImage}
                  style={[styles.imageChangeButton, { backgroundColor: theme.background }]}
                  hitSlop={12}
                >
                  <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>
                    Change
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={pickImage}
                style={[
                  styles.imagePicker,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <ImageIcon size={24} color={theme.textSecondary} strokeWidth={1.5} />
                <ThemedText variant="caption" muted style={{ marginTop: Spacing.xs }}>
                  Tap to select a cover image
                </ThemedText>
              </Pressable>
            )}
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Name
            </ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Table Tennis Club"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              maxLength={60}
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Description (optional)
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What's this community about?"
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

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Sport
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sportPicker}>
              {(['table_tennis', 'badminton', 'tennis', 'squash', 'pickleball',
                'football', 'cricket', 'volleyball', 'handball', 'basketball',
                'other'] as Sport[]).map((s) => {
                const selected = s === sport;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSport(s)}
                    style={[
                      styles.sportPill,
                      { borderColor: theme.border },
                      selected && { backgroundColor: theme.text, borderColor: theme.text },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={[
                        styles.sportPillText,
                        selected && { color: theme.background },
                      ]}
                    >
                      {SPORT_LABELS[s]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Visibility
            </ThemedText>
            <View style={styles.visibilityRow}>
              <Pressable
                onPress={() => setVisibility('public')}
                style={[
                  styles.visibilityOption,
                  {
                    backgroundColor:
                      visibility === 'public' ? theme.text : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={{
                    color: visibility === 'public' ? theme.background : theme.text,
                    fontWeight: '700',
                  }}
                >
                  Public
                </ThemedText>
                <ThemedText
                  variant="caption"
                  style={{
                    color:
                      visibility === 'public'
                        ? theme.background
                        : theme.textSecondary,
                    opacity: 0.7,
                  }}
                >
                  Anyone can join
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => setVisibility('restricted')}
                style={[
                  styles.visibilityOption,
                  {
                    backgroundColor:
                      visibility === 'restricted' ? theme.text : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={{
                    color: visibility === 'restricted' ? theme.background : theme.text,
                    fontWeight: '700',
                  }}
                >
                  Private
                </ThemedText>
                <ThemedText
                  variant="caption"
                  style={{
                    color:
                      visibility === 'restricted'
                        ? theme.background
                        : theme.textSecondary,
                    opacity: 0.7,
                  }}
                >
                  Requires approval
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <Button
            label={saving ? 'Creating...' : 'Create Community'}
            onPress={handleCreate}
            disabled={!canSave}
            loading={saving || uploadingImage}
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
  imagePicker: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.md,
  },
  imageRemoveButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  imageChangeButton: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  visibilityOption: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  sportPicker: {
    flexDirection: 'row',
  },
  sportPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  sportPillText: {
    fontWeight: '700',
    fontSize: 13,
  },
  submit: {
    marginTop: Spacing.md,
  },
});

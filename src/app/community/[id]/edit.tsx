import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, Shield, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alert } from '@/lib/alert';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import { uploadImageFromUri } from '@/lib/cloudinary';
import { transferAdmin, updateCommunity } from '@/services/communities';
import type { Community, CommunityVisibility } from '@/types';

export default function EditCommunityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const { community, membership, loading, refresh } = useCommunity(id ?? '', user?.id);

  useEffect(() => {
    if (!loading && membership && membership.role !== 'admin') {
      router.replace(`/community/${id}`);
    }
  }, [loading, membership, id, router]);

  if (loading || !community || membership?.role !== 'admin') {
    return (
      <View style={[styles.flex, styles.centered, { backgroundColor: theme.background }]}>
        {loading ? (
          <ActivityIndicator color={theme.text} size="large" />
        ) : (
          <ThemedText muted>Community not found</ThemedText>
        )}
      </View>
    );
  }

  return (
    <EditCommunityForm
      key={community.id}
      community={community}
      userId={user?.id}
      refresh={refresh}
    />
  );
}

function EditCommunityForm({
  community,
  userId,
  refresh,
}: {
  community: Community;
  userId?: string;
  refresh: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? '');
  const [organization, setOrganization] = useState(community.organization ?? '');
  const [location, setLocation] = useState(community.location ?? '');
  const [visibility, setVisibility] = useState<CommunityVisibility>(community.visibility);
  const [imageUri, setImageUri] = useState<string | null>(community.image_url ?? null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving && !uploadingImage;

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Permission required', 'Please grant permission to access your photos.');
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

  const removeImage = () => setImageUri(null);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      let imageUrl: string | null | undefined;
      if (imageUri !== (community.image_url ?? null)) {
        if (imageUri) {
          setUploadingImage(true);
          const uploaded = await uploadImageFromUri(imageUri);
          if (!uploaded) {
            alert('Error', 'Failed to upload image.');
            setSaving(false);
            setUploadingImage(false);
            return;
          }
          imageUrl = uploaded;
          setUploadingImage(false);
        } else {
          imageUrl = null;
        }
      }
      await updateCommunity(community.id, {
        name: name.trim(),
        description: description.trim() || null,
        organization: organization.trim() || null,
        location: location.trim() || null,
        visibility,
        image_url: imageUrl,
      });
      refresh();
      router.back();
    } catch (e: any) {
      alert('Error', e?.message ?? 'Failed to update.');
    } finally {
      setSaving(false);
      setUploadingImage(false);
    }
  };

  const handleTransferAdmin = () => {
    if (Alert.prompt) {
      Alert.prompt(
        'Transfer Admin',
        'Enter the username of the new admin:',
        async (text) => {
          if (!text.trim() || !userId) return;
          try {
            await transferAdmin(community.id, userId, text.trim());
            alert('Done', 'Admin rights transferred.');
            router.back();
          } catch (e: any) {
            alert('Error', e?.message ?? 'Failed to transfer.');
          }
        },
      );
    } else {
      alert(
        'Transfer Admin',
        'Transfer admin by username: feature available on iOS.',
      );
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + Spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
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
              Organization (optional)
            </ThemedText>
            <TextInput
              value={organization}
              onChangeText={setOrganization}
              placeholder="e.g. University of Lahore"
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
            />
          </View>

          <View style={styles.field}>
            <ThemedText variant="label" muted style={styles.label}>
              Location / City (optional)
            </ThemedText>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Lahore"
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
            />
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
                      visibility === 'public' ? theme.background : theme.textSecondary,
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
                  Restricted
                </ThemedText>
                <ThemedText
                  variant="caption"
                  style={{
                    color:
                      visibility === 'restricted' ? theme.background : theme.textSecondary,
                    opacity: 0.7,
                  }}
                >
                  Requires approval
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <Button
            label="Save Changes"
            onPress={handleSave}
            loading={saving || uploadingImage}
            disabled={!canSave}
            buttonStyle={styles.submit}
          />

          <Pressable onPress={handleTransferAdmin} style={styles.transferAdminLink}>
            <Shield size={14} color={theme.error} strokeWidth={2} />
            <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '600' }}>
              Transfer Admin Rights
            </ThemedText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
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
  submit: {
    marginTop: Spacing.sm,
  },
  transferAdminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
});
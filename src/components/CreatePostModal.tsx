import { useRouter } from 'expo-router';
import { Image as ImageIcon, Trophy, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { uploadImageFromUri } from '@/lib/cloudinary';
import { createCommunityPost } from '@/services/communities';
import type { CommunityPostType } from '@/types';
import * as ImagePicker from 'expo-image-picker';

type PostTab = 'write' | 'photo' | 'match';

type CreatePostModalProps = {
  communityId: string;
  communitySport: string;
  authorId: string;
  visible: boolean;
  onClose: () => void;
  onRefreshFeed?: () => void;
  initialTab?: PostTab;
};

export function CreatePostModal({
  communityId,
  communitySport,
  authorId,
  visible,
  onClose,
  onRefreshFeed,
  initialTab = 'write',
}: CreatePostModalProps) {
  const theme = useTheme();
  const router = useRouter();

  const [textContent, setTextContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [animation] = useState(new Animated.Value(0));
  const [isAnimating, setIsAnimating] = useState(false);
  const modalRef = useRef<Modal>(null);

  const maxTextLength = 2000;

  // Reset form fields when modal visibility changes
  useEffect(() => {
    if (visible) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setTextContent('');
        setSelectedImage(null);
        setUploading(false);
        setUploadProgress(0);
      }, 0);
    }
  }, [visible]);

  // Handle slide/fade animation
  useEffect(() => {
    if (visible) {
      Animated.timing(animation, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setIsAnimating(false);
      });
    } else {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setIsAnimating(true);
        Animated.timing(animation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => setIsAnimating(false));
      }, 0);
    }
  }, [visible, animation]);

  const handleSubmit = async () => {
    if (submitting || uploading) return;

    let content = '';
    let imageUrl: string | null = null;
    let postType: CommunityPostType = 'text';

    if (initialTab === 'write') {
      content = textContent.trim();
      if (!content) {
        Alert.alert('Empty Post', 'Please write something before posting.');
        return;
      }
      postType = 'text';
    } else if (initialTab === 'photo') {
      if (!selectedImage) {
        Alert.alert('No Photo', 'Please select a photo first.');
        return;
      }
      content = textContent.trim();
      postType = 'photo';

      setUploading(true);
      setUploadProgress(0);
      try {
        const url = await uploadImageFromUri(
          selectedImage,
          (progress) => setUploadProgress(progress.percentage),
          { maxWidth: 1920, quality: 0.75 },
          'post'
        );
        if (!url) throw new Error('Upload failed');
        imageUrl = url;
      } catch (error) {
        console.error('Image upload failed:', error);
        Alert.alert('Upload Failed', 'Failed to upload image. Please try again.');
        setUploading(false);
        return;
      }
      setUploading(false);
    } else if (initialTab === 'match') {
      router.navigate(`/add-match?communityId=${communityId}&sport=${communitySport}`);
      onClose();
      return;
    }

    setSubmitting(true);
    try {
      await createCommunityPost({
        community_id: communityId,
        author_id: authorId,
        content: content || null,
        image_url: imageUrl,
        post_type: postType,
      });
      onClose();
      onRefreshFeed?.();
    } catch (error) {
      console.error('Failed to create post:', error);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'We need access to your photos to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
  };

  // Dynamic header title based on initialTab prop
  const getHeaderTitle = () => {
    switch (initialTab) {
      case 'photo':
        return 'Post a Photo';
      case 'match':
        return 'Record Match';
      case 'write':
      default:
        return 'Create Post';
    }
  };

  if (!visible) return null;

  return (
    <Modal
      ref={modalRef}
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      supportedOrientations={['portrait']}
    >
      <Animated.View style={[styles.backdrop, { opacity: animation }]}>
        <Pressable onPress={onClose} style={styles.backdropPress} />

        <Animated.View
          style={[
            styles.modalContainer,
            { backgroundColor: theme.background, borderColor: theme.border },
            { transform: [{ translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }] },
          ]}
        >
          <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <ThemedText variant="heading">{getHeaderTitle()}</ThemedText>
            <Pressable onPress={onClose} hitSlop={16} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <X size={24} color={theme.text} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* Form Content */}
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
            style={styles.contentWrapper}
          >
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Conditional Rendering Based on initialTab Prop */}
              {initialTab === 'write' && (
                <View style={styles.tabContent}>
                  <TextInput
                    placeholder="What's on your mind?"
                    placeholderTextColor={theme.textSecondary}
                    value={textContent}
                    onChangeText={setTextContent}
                    style={[
                      styles.textInput,
                      { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                    multiline
                    maxLength={maxTextLength}
                    textAlignVertical="top"
                  />
                  <ThemedText variant="caption" muted style={styles.charCount}>
                    {textContent.length}/{maxTextLength}
                  </ThemedText>
                </View>
              )}

              {initialTab === 'photo' && (
                <View style={styles.tabContent}>
                  {selectedImage ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: selectedImage }} style={styles.imagePreview} resizeMode="cover" />
                      <Pressable onPress={removeImage} style={styles.removeImageButton} hitSlop={8}>
                        <X size={20} color="#fff" strokeWidth={3} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={pickImage}
                      style={[styles.imagePickerButton, { borderColor: theme.border }]}
                      hitSlop={8}
                    >
                      <View style={styles.imagePickerIcon}>
                        <ImageIcon size={32} color={theme.textSecondary} strokeWidth={2} />
                      </View>
                      <ThemedText variant="body" muted style={styles.imagePickerText}>
                        Tap to select a photo
                      </ThemedText>
                    </Pressable>
                  )}

                  <TextInput
                    placeholder="Add a caption (optional)..."
                    placeholderTextColor={theme.textSecondary}
                    value={textContent}
                    onChangeText={setTextContent}
                    style={[
                      styles.captionInput,
                      { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                    multiline
                    maxLength={maxTextLength}
                    textAlignVertical="top"
                  />
                  <ThemedText variant="caption" muted style={styles.charCount}>
                    {textContent.length}/{maxTextLength}
                  </ThemedText>

                  {uploading && (
                    <View style={styles.uploadProgress}>
                      <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                        <View
                          style={[
                            styles.progressFill,
                            { backgroundColor: theme.accent, width: `${uploadProgress}%` },
                          ]}
                        />
                      </View>
                      <ThemedText variant="caption" muted>
                        Uploading... {uploadProgress}%
                      </ThemedText>
                    </View>
                  )}
                </View>
              )}

              {initialTab === 'match' && (
                <View style={styles.tabContent}>
                  <Card style={[styles.matchCard, { borderColor: theme.border }]}>
                    <View style={styles.matchCardContent}>
                      <Trophy size={32} color={theme.accent} strokeWidth={2} />
                      <View style={styles.matchCardText}>
                        <ThemedText variant="heading" style={{ marginBottom: Spacing.xs }}>
                          Record a Match
                        </ThemedText>
                        <ThemedText variant="body" muted>
                          Record a match result with scores, opponents, and format.
                        </ThemedText>
                      </View>
                    </View>
                  </Card>
                  <ThemedText variant="caption" muted style={styles.matchHint}>
                    Opens the match recording screen
                  </ThemedText>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>

          {/* Action Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || uploading}
            style={[
              styles.submitButton,
              { backgroundColor: theme.accent },
              (submitting || uploading) && styles.submitButtonDisabled,
            ]}
            hitSlop={8}
          >
            <ThemedText variant="label" style={{ color: theme.background, fontWeight: '700' }}>
              {submitting
                ? 'Posting...'
                : uploading
                ? `Uploading ${uploadProgress}%`
                : initialTab === 'match'
                ? 'Continue to Match'
                : 'Post'}
            </ThemedText>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdropPress: {
    flex: 1,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  modalHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  contentWrapper: {
    flexShrink: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  tabContent: {
    gap: Spacing.md,
  },
  textInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 16,
    height: 180,
    textAlignVertical: 'top',
  },
  charCount: {
    textAlign: 'right',
  },
  imagePreviewContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 16,
    height: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  imagePickerIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerText: {
    fontSize: 15,
  },
  uploadProgress: {
    gap: Spacing.xs,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  matchCard: {
    borderWidth: 1,
  },
  matchCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  matchCardText: {
    flex: 1,
  },
  matchHint: {
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  submitButton: {
    margin: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
});
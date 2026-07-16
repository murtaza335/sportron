import { Platform } from 'react-native';

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export async function uploadImageFromUri(uri: string): Promise<string | null> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    return null;
  }

  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      // On web, convert blob/data URL to blob
      let fileBlob: Blob;
      if (uri.startsWith('blob:') || uri.startsWith('data:')) {
        const response = await fetch(uri);
        fileBlob = await response.blob();
      } else {
        const response = await fetch(uri);
        fileBlob = await response.blob();
      }
      formData.append('file', fileBlob, `avatar_${Date.now()}.jpg`);
    } else {
      // On native (iOS/Android), React Native's FormData handles file:// URIs directly
      formData.append('file', {
        uri,
        type: 'image/jpeg',
        name: `avatar_${Date.now()}.jpg`,
      } as any);
    }

    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Cloudinary upload error:', data);
      return null;
    }

    return data.secure_url;
  } catch (error) {
    console.error('Image upload error:', error);
    return null;
  }
}
import { Platform } from 'react-native';

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export async function uploadImageFromUri(
  uri: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string | null> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    console.error('Cloudinary environment variables are missing.');
    return null;
  }

  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const fileBlob = await response.blob();
      formData.append('file', fileBlob, `avatar_${Date.now()}.jpg`);
    } else {
      const fileObject = {
        uri,
        name: `avatar_${Date.now()}.jpg`,
        type: 'image/jpeg',
      };
      formData.append('file', fileObject as any);
    }

    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          // Safeguard against event.total being 0, which results in NaN
          const total = event.total > 0 ? event.total : 1;
          const percentage = Math.max(0, Math.min(100, Math.round((event.loaded / total) * 100)));
          
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percentage,
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data.secure_url);
          } catch {
            reject(new Error('Failed to parse response'));
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            reject(new Error(data.error?.message || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(formData);
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return null;
  }
}
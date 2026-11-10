// Unsigned Cloudinary upload (same cloud + preset as the mobile app). Returns the secure_url.
const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const cloudinaryConfigured = Boolean(cloud && preset);

export async function uploadImage(file: File): Promise<string> {
  if (!cloud || !preset) throw new Error('Cloudinary is not configured (VITE_CLOUDINARY_*).');
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image is too large (max 8 MB).');
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Image upload failed.');
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error('Image upload failed.');
  return json.secure_url;
}

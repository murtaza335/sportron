import * as ImagePicker from 'expo-image-picker';

import { alert } from '@/lib/alert';
import { toast } from '@/components/motion/Toast';

type PickOptions = { aspect?: [number, number]; quality?: number };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens the photo library and returns the chosen image URI (or null if cancelled/failed).
 * Never throws: wraps permission + launch in try/catch, retries once on the Android
 * "unregistered ActivityResultLauncher" error, and shows a friendly toast on failure.
 */
export async function pickImage({ aspect, quality = 0.8 }: PickOptions = {}): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert('Permission required', 'Please grant permission to access your photos.');
      return null;
    }
    const launch = () =>
      ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: !!aspect,
        ...(aspect ? { aspect } : {}),
        quality,
      });
    let result;
    try {
      result = await launch();
    } catch (e) {
      if (!String((e as { message?: unknown })?.message ?? e).includes('ActivityResultLauncher')) throw e;
      await wait(400);
      result = await launch();
    }
    return !result.canceled && result.assets[0] ? result.assets[0].uri : null;
  } catch (e) {
    console.warn('pickImage failed:', e);
    toast("Couldn't open your photos", 'Please try again.', 'error');
    return null;
  }
}

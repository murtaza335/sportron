import AsyncStorage from '@react-native-async-storage/async-storage';

const WHATS_NEW_KEY = 'whats_new_viewed_version';
/** Bundled fallback version. A remote `whats_new` config (B3) overrides it without a release. */
export const WHATS_NEW_VERSION = '1.0.2';
const CURRENT_VERSION = WHATS_NEW_VERSION;

export interface WhatsNewItem {
  id: string;
  title: string;
  description: string;
  type: 'feature' | 'improvement' | 'fix';
}

export const WHATS_NEW_CONTENT: WhatsNewItem[] = [
  {
    id: 'images-in-posts',
    title: 'Post inside a community',
    description: 'You can now post photos and text only posts inside the community. Tap the camera icon to add images from your gallery.',
    type: 'feature',
  },
];

export async function getViewedVersion(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WHATS_NEW_KEY);
  } catch {
    return null;
  }
}

export async function setViewedVersion(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WHATS_NEW_KEY, version);
  } catch {
    // silently fail
  }
}

export async function hasUnviewedContent(): Promise<boolean> {
  const viewed = await getViewedVersion();
  return viewed !== CURRENT_VERSION;
}

export async function markAsViewed(): Promise<void> {
  await setViewedVersion(CURRENT_VERSION);
}
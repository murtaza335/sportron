import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'announcement-state-v1';

type State = Record<string, { shows: number; dismissed: boolean }>;
let cache: State | null = null;

async function load(): Promise<State> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as State) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function save() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache ?? {}));
  } catch {
    // best-effort
  }
}

/** Per-device show counts + dismissals (kept in AsyncStorage, never on the server). */
export async function getAnnouncementState(id: string) {
  const s = await load();
  return s[id] ?? { shows: 0, dismissed: false };
}

export async function markAnnouncementShown(id: string) {
  const s = await load();
  s[id] = { ...(s[id] ?? { shows: 0, dismissed: false }), shows: (s[id]?.shows ?? 0) + 1 };
  await save();
}

export async function markAnnouncementDismissed(id: string) {
  const s = await load();
  s[id] = { ...(s[id] ?? { shows: 0, dismissed: false }), dismissed: true };
  await save();
}

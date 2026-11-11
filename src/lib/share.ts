import { Platform, Share } from 'react-native';

import { toast } from '@/components/motion/Toast';

/** Public web origin used in every shared link (served by the Vercel web build, App Links on Android). */
export const SHARE_ORIGIN = 'https://sportron.app';

export const shareUrls = {
  community: (id: string) => `${SHARE_ORIGIN}/community/${id}`,
  tournament: (id: string) => `${SHARE_ORIGIN}/tournament/${id}`,
  module: (tournamentId: string, moduleId: string) =>
    `${SHARE_ORIGIN}/tournament/${tournamentId}/module/${moduleId}`,
  profile: (id: string) => `${SHARE_ORIGIN}/profile/${id}`,
  app: () => `${SHARE_ORIGIN}/get`,
};

export type SharePayload = { message: string; url: string };

export const shareCopy = {
  community(c: { id: string; name: string; memberCount?: number }): SharePayload {
    const url = shareUrls.community(c.id);
    const members = c.memberCount ? ` — ${c.memberCount} players, live leaderboard` : '';
    return { url, message: `🏓 Join ${c.name} on Sportron${members}. Tap to join: ${url}` };
  },
  match(m: { communityId: string; winner: string; loser: string; score: string; community?: string }): SharePayload {
    const url = shareUrls.community(m.communityId);
    const where = m.community ? ` in ${m.community}` : '';
    return {
      url,
      message: `${m.winner} beat ${m.loser} ${m.score}${where} 🔥 Think you can do better? ${url}`,
    };
  },
  post(p: { communityId: string; author: string; community?: string }): SharePayload {
    const url = shareUrls.community(p.communityId);
    return { url, message: `${p.author} posted${p.community ? ` in ${p.community}` : ''} on Sportron 👀 ${url}` };
  },
  session(s: { title: string; when?: string; spotsLeft?: number }): SharePayload {
    const url = shareUrls.app();
    const need = s.spotsLeft && s.spotsLeft > 0 ? `Need ${s.spotsLeft} more for ` : '';
    const when = s.when ? ` ${s.when}` : '';
    return { url, message: `${need}${s.title}${when} 🏸 Join on Sportron: ${url}` };
  },
  tournament(t: { id: string; name: string; live?: boolean }): SharePayload {
    const url = shareUrls.tournament(t.id);
    return {
      url,
      message: t.live
        ? `🏆 ${t.name} is LIVE — follow the bracket: ${url}`
        : `🏆 ${t.name} — follow the bracket on Sportron: ${url}`,
    };
  },
  module(t: { tournamentId: string; moduleId: string; name: string }): SharePayload {
    const url = shareUrls.module(t.tournamentId, t.moduleId);
    return { url, message: `🏆 ${t.name} — follow the bracket live: ${url}` };
  },
  profile(p: { id: string; username: string }): SharePayload {
    const url = shareUrls.profile(p.id);
    return { url, message: `Check out ${p.username} on Sportron 🏓 ${url}` };
  },
};

/** Native: system share sheet. Web: `navigator.share` with copy-to-clipboard + toast fallback. */
export async function share(payload: SharePayload): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        await nav.share({ text: payload.message, url: payload.url });
        return;
      }
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(payload.message);
        toast('Link copied', 'Paste it anywhere to share.');
        return;
      }
      toast('Could not share', payload.url, 'error');
      return;
    }
    await Share.share({ message: payload.message });
  } catch (e) {
    // User dismissing the sheet rejects on some platforms (web AbortError) — not an error.
    if ((e as { name?: string })?.name === 'AbortError') return;
  }
}

import { FontAwesome } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  Flag,
  Flame,
  Heart,
  MessageSquare,
  Plus,
  Trophy,
  User,
  Users,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion/PressableScale';
import { Sheet } from '@/components/motion/Sheet';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { useIsGuest } from '@/lib/guestMode';
import { haptics } from '@/lib/haptics';
import { closeSignIn, useSignInPrompt, type SignInPrompt } from '@/lib/requireAuth';
import { saveReturnTo } from '@/lib/returnTo';
import {
  SIGN_IN_PRIVACY,
  SIGN_IN_REASSURANCE,
  signInCopy,
  type SignInContext,
  type SignInIcon,
  type SignInReason,
} from '@/lib/signInReasons';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithGoogle } from '@/services/auth';

const TERMS_URL = 'https://murtaza335.github.io/sportron/TERMS_OF_SERVICE.html';
const PRIVACY_URL = 'https://murtaza335.github.io/sportron/PRIVACY_POLICY.html';

const ICONS: Record<SignInIcon, typeof Users> = {
  users: Users,
  trophy: Trophy,
  calendar: CalendarDays,
  message: MessageSquare,
  activity: Activity,
  user: User,
  flame: Flame,
  heart: Heart,
  bell: Bell,
  flag: Flag,
  plus: Plus,
};

/** Mounted once in the root layout (guest mode only). Opened from anywhere with `requireAuth(...)`. */
export function SignInHost() {
  const prompt = useSignInPrompt();
  const guest = useIsGuest();
  // Keep rendering the last prompt while the sheet animates out.
  const [shown, setShown] = useState<SignInPrompt | null>(null);
  if (prompt && prompt !== shown) setShown(prompt);

  // Signed in (the OAuth round-trip finished) -> the sheet has done its job.
  useEffect(() => {
    if (!guest) closeSignIn();
  }, [guest]);

  return (
    <Sheet visible={!!prompt && guest} onClose={closeSignIn} onClosed={() => setShown(null)}>
      {shown ? <SignInContent reason={shown.reason} ctx={shown.ctx} onDismiss={closeSignIn} /> : null}
    </Sheet>
  );
}

/** The same prompt, inline, for tabs that have nothing to show a guest (Chats, Activity, Profile). */
export function SignInCard({ reason, ctx }: { reason: SignInReason; ctx?: SignInContext }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <SignInContent reason={reason} ctx={ctx ?? {}} />
    </View>
  );
}

function SignInContent({ reason, ctx, onDismiss }: { reason: SignInReason; ctx: SignInContext; onDismiss?: () => void }) {
  const theme = useTheme();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const copy = signInCopy(reason, ctx);
  const Icon = ICONS[copy.icon];

  const onGoogle = async () => {
    if (!isSupabaseConfigured) {
      alert('Setup required', 'Add your Supabase URL and Anon Key to a .env file. See .env.example for details.');
      return;
    }
    haptics.light();
    // Bring them back to exactly this screen after sign-in (and onboarding, for a brand-new account).
    const search = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.search : '';
    saveReturnTo(pathname + search);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      alert('Sign in failed', error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.content}>
      <View style={[styles.iconWrap, { backgroundColor: `${theme.accent}1F` }]}>
        <Icon size={28} color={theme.accent} strokeWidth={2.2} />
      </View>

      <ThemedText variant="title" style={styles.title}>
        {copy.title}
      </ThemedText>
      <ThemedText variant="body" muted style={styles.subtitle}>
        {copy.subtitle}
      </ThemedText>

      <View style={styles.perks}>
        {copy.perks.map((perk) => (
          <View key={perk} style={styles.perkRow}>
            <View style={[styles.tick, { backgroundColor: `${theme.success}22` }]}>
              <Check size={13} color={theme.success} strokeWidth={3.2} />
            </View>
            <ThemedText variant="body" style={styles.perkText}>
              {perk}
            </ThemedText>
          </View>
        ))}
      </View>

      <PressableScale
        style={[styles.googleButton, { borderColor: theme.border }]}
        scaleTo={0.97}
        onPress={onGoogle}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {loading ? (
          <ActivityIndicator color="#1F2937" />
        ) : (
          <>
            <FontAwesome name="google" size={20} color="#EA4335" style={styles.googleIcon} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </>
        )}
      </PressableScale>

      <ThemedText variant="caption" muted style={styles.reassure}>
        {SIGN_IN_REASSURANCE}
      </ThemedText>
      <ThemedText variant="caption" muted style={styles.reassure}>
        {SIGN_IN_PRIVACY}
      </ThemedText>

      {onDismiss ? (
        <Pressable
          onPress={onDismiss}
          hitSlop={10}
          style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <ThemedText variant="label" muted>
            Not now
          </ThemedText>
        </Pressable>
      ) : null}

      <View style={styles.links}>
        <ThemedText variant="caption" muted>
          By continuing you agree to our{' '}
        </ThemedText>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6}>
          <ThemedText variant="caption" style={styles.link}>
            Terms
          </ThemedText>
        </Pressable>
        <ThemedText variant="caption" muted>
          {' '}and{' '}
        </ThemedText>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6}>
          <ThemedText variant="caption" style={styles.link}>
            Privacy Policy
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.lg,
  },
  content: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  perks: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    flex: 1,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  googleIcon: {
    marginRight: 12,
  },
  googleText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  reassure: {
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  notNow: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});

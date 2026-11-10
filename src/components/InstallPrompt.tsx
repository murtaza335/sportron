import { Download, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from '@/components/motion/Toast';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Duration, RM } from '@/lib/motion';
import { WEB_COLUMN_WIDTH } from '@/components/WebFrame';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.murtazabaig.T3S';
const DISMISS_KEY = 'pwa-install-dismissed-until';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NEVER = Number.MAX_SAFE_INTEGER;

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type InstallWindow = Window & { __bip?: InstallEvent | null };

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  );
}

function isDismissed(): boolean {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function dismissFor(ms: number) {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ms === NEVER ? NEVER : Date.now() + ms));
  } catch {
    // private mode: hidden for this visit only
  }
}

/**
 * Web only. Non-blocking "install" card shown once after sign-in: Google Play on Android phones, native
 * install where the browser offers it (beforeinstallprompt, captured early in +html.tsx), and
 * Add-to-Home-Screen steps on iOS Safari. Never shown inside the installed app.
 */
export function InstallPrompt() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIOSSafari = isIOS && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const isAndroid = /Android/.test(ua);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = window as InstallWindow;
    if (isStandalone() || isDismissed()) return;

    const sync = () => setCanInstall(!!w.__bip);
    sync();
    window.addEventListener('bip-ready', sync);
    const onInstalled = () => {
      setVisible(false);
      toast('Sportron installed');
    };
    window.addEventListener('appinstalled', onInstalled);

    // Give the browser a moment to fire beforeinstallprompt before deciding what to show.
    const t = setTimeout(() => {
      if (isAndroid || isIOS || w.__bip) setVisible(true);
    }, 2500);

    return () => {
      clearTimeout(t);
      window.removeEventListener('bip-ready', sync);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [isAndroid, isIOS]);

  const install = useCallback(async () => {
    const bip = (window as InstallWindow).__bip;
    if (!bip) return;
    await bip.prompt();
    const { outcome } = await bip.userChoice;
    (window as InstallWindow).__bip = null;
    setCanInstall(false);
    if (outcome === 'accepted') setVisible(false);
  }, []);

  const hide = (ms: number) => {
    dismissFor(ms);
    setVisible(false);
  };

  if (Platform.OS !== 'web' || !visible) return null;

  const title = isAndroid ? 'Get the Sportron app' : 'Install Sportron';
  const body = isAndroid
    ? 'The Android app is the best way to use Sportron, with push notifications.'
    : isIOS
      ? isIOSSafari
        ? 'Tap the Share button, then "Add to Home Screen" to install Sportron like an app.'
        : 'Open this page in Safari, then tap Share and "Add to Home Screen" to install Sportron.'
      : 'Install Sportron for quick access in its own window.';

  return (
    <Animated.View
      entering={FadeInDown.duration(Duration.base).reduceMotion(RM)}
      exiting={FadeOutDown.duration(Duration.fast).reduceMotion(RM)}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, bottom: insets.bottom + 76 },
      ]}>
      <View style={styles.header}>
        <Download size={20} color={theme.accent} />
        <ThemedText variant="body" style={styles.title}>
          {title}
        </ThemedText>
        <Pressable onPress={() => hide(WEEK_MS)} hitSlop={10} accessibilityLabel="Not now">
          <X size={18} color={theme.textSecondary} />
        </Pressable>
      </View>
      <ThemedText variant="caption" muted>
        {body}
      </ThemedText>
      <View style={styles.actions}>
        {isAndroid && (
          <Button label="Get it on Google Play" onPress={() => window.open(PLAY_STORE_URL, '_blank')} />
        )}
        {canInstall && (
          <Button label={isAndroid ? 'Or install the web app' : 'Install'} variant={isAndroid ? 'ghost' : 'primary'} onPress={install} />
        )}
        <Pressable onPress={() => hide(NEVER)} hitSlop={8} style={styles.never}>
          <ThemedText variant="caption" muted>
            Don&apos;t ask again
          </ThemedText>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    alignSelf: 'center',
    left: Spacing.md,
    right: Spacing.md,
    maxWidth: WEB_COLUMN_WIDTH - 2 * Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    zIndex: 300,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, fontWeight: '600' },
  actions: { gap: Spacing.sm },
  never: { alignSelf: 'center', paddingVertical: Spacing.xs },
});

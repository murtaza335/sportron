import { Clock, Check, XCircle, Heart, MessageSquare } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

interface NotificationIconProps {
  type: string;
}

export function NotificationIcon({ type }: NotificationIconProps) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';

  const icons: Record<string, { icon: any; color: string; bg: string }> = {
    match_pending: {
      icon: Clock,
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
    },
    match_approved: {
      icon: Check,
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
    },
    match_rejected: {
      icon: XCircle,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
    match_liked: {
      icon: Heart,
      color: '#EC4899',
      bg: isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3',
    },
    match_commented: {
      icon: MessageSquare,
      color: '#8B5CF6',
      bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF',
    },
  };

  const { icon: Icon, color, bg } = icons[type] || icons.match_pending;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Icon size={20} color={color} strokeWidth={2.5} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
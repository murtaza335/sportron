import {
  Bell,
  Check,
  Clock,
  Heart,
  Megaphone,
  MessageSquare,
  Swords,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react-native';
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
    session_application: {
      icon: UserPlus,
      color: '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE',
    },
    session_accepted: {
      icon: UserCheck,
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
    },
    session_rejected: {
      icon: UserMinus,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
    session_reminder: {
      icon: Clock,
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
    },
    feedback_prompt: {
      icon: MessageSquare,
      color: '#8B5CF6',
      bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF',
    },
    ping: {
      icon: Megaphone,
      color: '#EC4899',
      bg: isDark ? 'rgba(236, 72, 153, 0.15)' : '#FCE7F3',
    },
    join_request: {
      icon: UserPlus,
      color: '#3B82F6',
      bg: isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE',
    },
    join_approved: {
      icon: UserCheck,
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
    },
    join_rejected: {
      icon: UserMinus,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
    match_approval_request: {
      icon: Swords,
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
    },
    match_approved_community: {
      icon: Swords,
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
    },
    match_disputed: {
      icon: XCircle,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
    member_removed: {
      icon: UserMinus,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
    admin_transferred: {
      icon: Users,
      color: '#8B5CF6',
      bg: isDark ? 'rgba(139, 92, 246, 0.15)' : '#F3E8FF',
    },
    community_match_pending: {
      icon: Clock,
      color: '#F59E0B',
      bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
    },
    community_match_approved: {
      icon: Check,
      color: '#10B981',
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5',
    },
    community_match_disputed: {
      icon: XCircle,
      color: '#EF4444',
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
    },
  };

  const { icon: Icon, color, bg } = icons[type] || { icon: Bell, color: '#6B7280', bg: isDark ? 'rgba(107, 114, 128, 0.15)' : '#F3F4F6' };

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
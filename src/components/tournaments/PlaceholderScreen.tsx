import { Trophy } from 'lucide-react-native';
import { View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Temporary screen body while a tournament screen is being built (replaced step by step). */
export function PlaceholderScreen({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.sm }}>
      <Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />
      <ThemedText variant="heading">{title}</ThemedText>
      <ThemedText muted>Coming soon</ThemedText>
    </View>
  );
}

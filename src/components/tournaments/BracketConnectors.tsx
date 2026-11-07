import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import type { LayoutConnector } from '@/lib/bracketLayout';

/** One SVG layer for all connector lines; highlighted ones (viewer's path) drawn on top in accent. */
export function BracketConnectors({
  connectors,
  highlighted,
  width,
  height,
}: {
  connectors: LayoutConnector[];
  highlighted: Set<string>;
  width: number;
  height: number;
}) {
  const theme = useTheme();
  const key = (c: LayoutConnector) => `${c.fromMatchId}>${c.toMatchId}`;
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      {connectors
        .filter((c) => !highlighted.has(key(c)))
        .map((c) => (
          <Path key={key(c)} d={c.d} stroke={theme.border} strokeWidth={1.5} fill="none" />
        ))}
      {connectors
        .filter((c) => highlighted.has(key(c)))
        .map((c) => (
          <Path key={key(c)} d={c.d} stroke={theme.accent} strokeWidth={2} fill="none" />
        ))}
    </Svg>
  );
}

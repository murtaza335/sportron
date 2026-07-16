import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

type ColorScheme = 'light' | 'dark';

type ThemeColors = typeof Colors.light | typeof Colors.dark;

type ThemeContextValue = ThemeColors & {
  colorScheme: ColorScheme;
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [userScheme, setUserScheme] = useState<ColorScheme | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setHydrated(true);
    }, 0);
  }, []);

  const colorScheme = hydrated ? (userScheme ?? (systemScheme === 'dark' ? 'dark' : 'light')) : 'light';
  const theme = Colors[colorScheme as ColorScheme];

  const toggleTheme = () => {
    setUserScheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const setTheme = (scheme: ColorScheme) => {
    setUserScheme(scheme);
  };

  const value = useMemo(
    () => ({
      ...theme,
      colorScheme,
      toggleTheme,
      setTheme,
    }),
    [colorScheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
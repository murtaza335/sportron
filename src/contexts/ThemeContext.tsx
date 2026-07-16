import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

type ColorScheme = 'light' | 'dark' | 'system';

type ThemeColors = typeof Colors.light | typeof Colors.dark;

type ThemeContextValue = ThemeColors & {
  colorScheme: ColorScheme;
  resolvedColorScheme: 'light' | 'dark';
  toggleTheme: () => void;
  setTheme: (scheme: ColorScheme) => void;
};

const THEME_STORAGE_KEY = 'user-theme-preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [userScheme, setUserScheme] = useState<ColorScheme | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load saved theme from AsyncStorage on mount
  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved) {
          setUserScheme(saved as ColorScheme);
        }
      } catch (error) {
        console.warn('Failed to load theme preference:', error);
      } finally {
        setHydrated(true);
      }
    };
    loadTheme();
  }, []);

  // Save theme to AsyncStorage when user changes it
  useEffect(() => {
    if (hydrated && userScheme) {
      AsyncStorage.setItem(THEME_STORAGE_KEY, userScheme).catch((error) => {
        console.warn('Failed to save theme preference:', error);
      });
    }
  }, [hydrated, userScheme]);

  // Resolve the actual color scheme to use
  const resolvedColorScheme = userScheme === 'system' || userScheme === null
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : userScheme;

  const theme = Colors[resolvedColorScheme];

  const toggleTheme = () => {
    setUserScheme((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  };

  const setTheme = (scheme: ColorScheme) => {
    setUserScheme(scheme);
  };

  const value = useMemo(
    () => ({
      ...theme,
      colorScheme: userScheme ?? 'system',
      resolvedColorScheme,
      toggleTheme,
      setTheme,
    }),
    [theme, userScheme, resolvedColorScheme],
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
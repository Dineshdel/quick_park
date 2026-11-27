import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/** Light: warm ivory, deep navy and a touch of gold (the app's signature look). */
const light = {
  mode: 'light' as const,
  background: '#f6f4ee',
  card: '#ffffff',
  text: '#161b36',
  muted: '#6b7189',
  border: '#ebe7dc',
  field: '#f3f4f8',
  fieldBorder: '#d6dae5',
  primary: '#1f2a5c',
  primaryText: '#fdfcf8',
  /** Tinted surface behind icons and selected rows. */
  primarySoft: '#e8ebf6',
  accent: '#eceff7',
  /** Shadow colour for raised surfaces. */
  shadow: '#1f2a5c',
  /** Brand bar at the top of the main screens. */
  header: '#1f2a5c',
  headerText: '#fdfcf8',
  chrome: '#161c3a',
  chromeText: '#e9ebf3',
  /** Highlight colour on the brand bar and hero cards. */
  gold: '#d6a73f',
  success: '#17875a',
  successBg: '#e3f4ec',
  warning: '#b06d00',
  warningBg: '#fdf1dc',
  danger: '#c62f2f',
  dangerBg: '#fbe6e6',
  info: '#2f5bb7',
  infoBg: '#e6edfb',
};
export type Theme = Omit<typeof light, 'mode'> & { mode: 'light' | 'dark' };

/** Same colours as the website (dark): neutral charcoal surfaces with a bright blue. */
const dark: Theme = {
  mode: 'dark',
  background: '#121314',
  card: '#1d1e20',
  text: '#f1f2f3',
  muted: '#a2a5a8',
  border: '#3a3c40',
  field: '#26282b',
  fieldBorder: '#4a4d52',
  primary: '#2da6fa',
  primaryText: '#0c1014',
  primarySoft: '#16324a',
  accent: '#2c2e31',
  shadow: '#000000',
  header: '#17191b',
  headerText: '#e6e8ea',
  chrome: '#181a1b',
  chromeText: '#e6e8ea',
  gold: '#27aeff',
  success: '#41dca5',
  successBg: '#10291f',
  warning: '#ffb340',
  warningBg: '#2e2108',
  danger: '#ff6367',
  dangerBg: '#2e1415',
  info: '#60c2ff',
  infoBg: '#102233',
};

const KEY = 'qp.theme';
type Ctx = { theme: Theme; toggle: () => void };
const ThemeContext = createContext<Ctx>({ theme: light, toggle: () => undefined });

/** Follows the phone's setting until the user taps the sun/moon, then remembers their choice. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoice] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync(KEY)
      .then((v) => (v === 'light' || v === 'dark' ? setChoice(v) : undefined))
      .catch(() => undefined);
  }, []);
  const mode = choice ?? (system === 'dark' ? 'dark' : 'light');
  const value = useMemo<Ctx>(
    () => ({
      theme: mode === 'dark' ? dark : light,
      toggle: () => {
        const next = mode === 'dark' ? 'light' : 'dark';
        setChoice(next);
        void SecureStore.setItemAsync(KEY, next).catch(() => undefined);
      },
    }),
    [mode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

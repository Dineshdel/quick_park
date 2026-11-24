import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/** Same palette as the website: deep navy, warm ivory, a touch of gold. */
const light = {
  mode: 'light' as const,
  background: '#fbf9f4',
  card: '#ffffff',
  text: '#1d2340',
  muted: '#6b7189',
  border: '#e7e3d8',
  field: '#f1f3f8',
  fieldBorder: '#c8cddb',
  primary: '#1f2a5c',
  primaryText: '#fdfcf8',
  accent: '#eceff7',
  chrome: '#161c3a',
  chromeText: '#e9ebf3',
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

const dark: Theme = {
  mode: 'dark',
  background: '#121731',
  card: '#1a2142',
  text: '#eef0f6',
  muted: '#9aa1bb',
  border: '#2a3157',
  field: '#0f1430',
  fieldBorder: '#3a4270',
  primary: '#d6a73f',
  primaryText: '#1a1405',
  accent: '#242c55',
  chrome: '#0d1126',
  chromeText: '#e9ebf3',
  gold: '#e3bb5e',
  success: '#3fc28b',
  successBg: '#123a2c',
  warning: '#f0b24a',
  warningBg: '#3d2c0c',
  danger: '#f06a6a',
  dangerBg: '#3f1719',
  info: '#7aa2f2',
  infoBg: '#1b2a52',
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

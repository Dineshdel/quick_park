'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_COOKIE, type ThemeChoice } from './theme-config';

export type { ThemeChoice } from './theme-config';

const ThemeContext = createContext<{ choice: ThemeChoice; resolved: 'light' | 'dark'; setChoice: (c: ThemeChoice) => void }>({
  choice: 'system',
  resolved: 'light',
  setChoice: () => undefined,
});

function apply(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

export function ThemeProvider({ initialChoice, children }: { initialChoice: ThemeChoice; children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(initialChoice);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
  useEffect(() => apply(resolved === 'dark'), [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    document.cookie = `${THEME_COOKIE}=${c}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

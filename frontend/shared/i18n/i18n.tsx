'use client';

import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, type Locale, LOCALE_COOKIE, type MessageKey, MESSAGES } from './messages';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const I18nContext = createContext<{ locale: Locale; t: T; setLocale: (l: Locale) => void }>({
  locale: DEFAULT_LOCALE,
  t: (key) => MESSAGES.en[key] ?? key,
  setLocale: () => undefined,
});

/** The starting locale comes from the qp_lang cookie (read on the server), so the first render is already translated. */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const router = useRouter();

  const t = useCallback<T>(
    (key, vars) => {
      let s = MESSAGES[locale][key] ?? MESSAGES.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [locale],
  );

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      router.refresh(); // server-rendered parts pick up the new language too
    },
    [router],
  );

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

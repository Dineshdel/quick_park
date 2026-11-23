'use client';

import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/shared/i18n/i18n';
import { isLocale, LOCALES } from '@/shared/i18n/messages';
import { cn } from '@/shared/lib/utils';
import { type ThemeChoice, useTheme } from '@/shared/theme/theme';

const CHROME_BTN = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-chrome-foreground transition-colors hover:bg-chrome-hover hover:text-white';

/** Language picker for the header: a native select (works with screen readers and on phones). */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className={cn(CHROME_BTN, 'relative cursor-pointer')} title={t('ui.language')}>
      <Languages className="size-4" aria-hidden />
      <span className="hidden sm:inline">{LOCALES.find((l) => l.code === locale)?.label}</span>
      <span className="sm:hidden">{LOCALES.find((l) => l.code === locale)?.short}</span>
      <select
        aria-label={t('ui.language')}
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const THEME_OPTIONS: { value: ThemeChoice; icon: typeof Sun; key: 'ui.theme.light' | 'ui.theme.dark' | 'ui.theme.system' }[] = [
  { value: 'light', icon: Sun, key: 'ui.theme.light' },
  { value: 'dark', icon: Moon, key: 'ui.theme.dark' },
  { value: 'system', icon: Monitor, key: 'ui.theme.system' },
];

/** Day / night / follow-the-device switch for the header. */
export function ThemeMenu() {
  const { choice, resolved, setChoice } = useTheme();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <div ref={ref} className="relative">
      <button type="button" className={CHROME_BTN} aria-haspopup="menu" aria-expanded={open} aria-label={t('ui.theme')} title={t('ui.theme')} onClick={() => setOpen((v) => !v)}>
        <Icon className="size-4" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="shadow-premium-lg absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border bg-card p-1 text-card-foreground">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === o.value}
              onClick={() => {
                setChoice(o.value);
                setOpen(false);
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent', choice === o.value && 'font-medium')}
            >
              <o.icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1">{t(o.key)}</span>
              {choice === o.value && <Check className="size-4 text-gold-deep" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

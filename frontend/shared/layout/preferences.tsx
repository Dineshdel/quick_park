'use client';

import { Check, ChevronDown, Languages, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/shared/i18n/i18n';
import { LOCALES } from '@/shared/i18n/messages';
import { cn } from '@/shared/lib/utils';
import { useTheme } from '@/shared/theme/theme';

const CHROME_BTN =
  'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-chrome-foreground transition-colors hover:bg-chrome-hover hover:text-chrome-strong';

/** Closes a popup on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Language picker for the header: a menu in the header's navy, not the browser's white list. */
export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = LOCALES.find((l) => l.code === locale);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={CHROME_BTN}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('ui.language')}
        title={t('ui.language')}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages className="size-4" aria-hidden />
        <span className="hidden sm:inline">{current?.label}</span>
        <span className="sm:hidden">{current?.short}</span>
        <ChevronDown
          className={cn('size-3.5 opacity-70 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('ui.language')}
          className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-xl border border-chrome-line bg-chrome p-1 text-chrome-foreground shadow-xl"
        >
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={l.code === locale}
              onClick={() => {
                setLocale(l.code);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-chrome-hover hover:text-chrome-strong',
                l.code === locale && 'bg-chrome-hover font-medium text-chrome-strong',
              )}
            >
              <span className="w-6 text-xs text-chrome-muted">{l.short}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === locale && <Check className="size-4 text-gold" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One-click day / night switch: the icon shows the mode you switch to. */
export function ThemeToggle() {
  const { resolved, setChoice } = useTheme();
  const { t } = useI18n();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = `${t('ui.theme')}: ${t(next === 'dark' ? 'ui.theme.dark' : 'ui.theme.light')}`;
  const Icon = next === 'dark' ? Moon : Sun;
  return (
    <button
      type="button"
      className={CHROME_BTN}
      aria-label={label}
      title={label}
      onClick={() => setChoice(next)}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

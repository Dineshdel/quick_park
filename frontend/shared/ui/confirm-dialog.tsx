'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  /** Text on the confirm button (default "Confirm"). */
  confirmLabel?: string;
  /** `null` hides the cancel button (a plain notice with just OK). */
  cancelLabel?: string | null;
  /**
   * `danger` = red button and warning icon, for deletes, cancels and anything that can't be undone.
   * `error` = red warning icon and an OK button, for telling the user something failed.
   */
  tone?: 'danger' | 'error' | 'default';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * `const confirm = useConfirm(); if (!(await confirm({ title: 'Delete photo?', tone: 'danger' }))) return;`
 * Opens a modal and resolves true on confirm, false on cancel / Esc / backdrop click.
 */
export function useConfirm(): Confirm {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false); // a second request replaces an unanswered one
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (opts && !d.open) d.showModal();
    if (!opts && d.open) d.close();
  }, [opts]);

  const danger = opts?.tone === 'danger';
  const warn = danger || opts?.tone === 'error';
  const Icon = warn ? AlertTriangle : CheckCircle2;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        aria-describedby={opts?.description ? 'confirm-desc' : undefined}
        onCancel={(e) => {
          e.preventDefault(); // Esc
          close(false);
        }}
        onClick={(e) => e.target === e.currentTarget && close(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        {opts && (
          <div className="grid gap-5 p-5">
            <div className="flex gap-4">
              <span
                className={cn(
                  'grid size-10 shrink-0 place-items-center rounded-full',
                  warn ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="grid min-w-0 gap-1.5 pt-1">
                <h2 id="confirm-title" className="text-base font-semibold leading-tight">
                  {opts.title}
                </h2>
                {opts.description && (
                  <div id="confirm-desc" className="text-sm text-muted-foreground">
                    {opts.description}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {opts.cancelLabel !== null && (
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  {opts.cancelLabel ?? 'Cancel'}
                </Button>
              )}
              <Button
                type="button"
                autoFocus
                variant={danger ? 'destructive' : 'default'}
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Shows `message` in a pop-up whenever it becomes set (and again after `onClose` clears it). Renders nothing
 * inline. `onClose` should clear the message so the same error can pop up again next time.
 */
export function ErrorPopup({
  message,
  title = 'Something went wrong',
  onClose,
}: {
  message?: ReactNode | null;
  title?: string;
  onClose?: () => void;
}) {
  const ask = useConfirm();
  const shown = useRef<ReactNode>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!message) {
      shown.current = null;
      return;
    }
    if (shown.current === message) return;
    shown.current = message;
    void ask({
      title,
      description: message,
      tone: 'error',
      confirmLabel: 'OK',
      cancelLabel: null,
    }).then(() => closeRef.current?.());
  }, [message, title, ask]);
  return null;
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { errorMessage } from '../lib/api';
import { Button, Text } from './kit';
import { useTheme } from './theme';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  /** null hides the cancel button (a plain notice with OK). */
  cancelLabel?: string | null;
  /** danger: red button for deletes/cancels. error: red icon + OK, for failures. */
  tone?: 'danger' | 'error' | 'default';
}

type Ctx = { confirm: (o: ConfirmOptions) => Promise<boolean> };
const DialogContext = createContext<Ctx | null>(null);

/** Same pop-ups as the website: every delete / save / submit asks first, every error shows here. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((r) => (resolver.current = r));
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const warn = opts?.tone === 'danger' || opts?.tone === 'error';

  return (
    <DialogContext.Provider value={{ confirm }}>
      {children}
      <Modal visible={!!opts} transparent animationType="fade" onRequestClose={() => close(false)}>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 24,
          }}
          onPress={() => close(false)}
        >
          <Pressable
            style={{ backgroundColor: theme.card, borderRadius: 18, padding: 20, gap: 16 }}
            onPress={() => undefined}
          >
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: warn ? theme.dangerBg : theme.accent,
                }}
              >
                <Ionicons
                  name={warn ? 'warning' : 'checkmark-circle'}
                  size={22}
                  color={warn ? theme.danger : theme.primary}
                />
              </View>
              <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
                <Text variant="h2">{opts?.title}</Text>
                {typeof opts?.description === 'string' ? (
                  <Text variant="muted">{opts.description}</Text>
                ) : (
                  opts?.description
                )}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              {opts?.cancelLabel !== null && (
                <Button
                  title={opts?.cancelLabel ?? 'Cancel'}
                  variant="outline"
                  onPress={() => close(false)}
                />
              )}
              <Button
                title={opts?.confirmLabel ?? 'Confirm'}
                variant={opts?.tone === 'danger' ? 'danger' : 'primary'}
                onPress={() => close(true)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be inside DialogProvider');
  const { confirm } = ctx;
  return {
    confirm,
    /** Show a failure in the error pop-up. */
    showError: (e: unknown, title = 'Something went wrong') =>
      confirm({
        title,
        description: errorMessage(e),
        tone: 'error',
        confirmLabel: 'OK',
        cancelLabel: null,
      }),
    notify: (title: string, description?: string) =>
      confirm({ title, description, confirmLabel: 'OK', cancelLabel: null }),
  };
}

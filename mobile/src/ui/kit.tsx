import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = ({
  name,
  size = 18,
  color,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) => {
  const { theme } = useTheme();
  return <Ionicons name={name} size={size} color={color ?? theme.text} />;
};

/** Soft, even elevation for raised surfaces (iOS shadow / Android elevation). */
export function shadow(t: Theme, level: 1 | 2 | 3 = 1): ViewStyle {
  const e = { 1: 2, 2: 6, 3: 12 }[level];
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: t.shadow,
      shadowOpacity: t.mode === 'dark' ? 0.35 : 0.08 + level * 0.02,
      shadowRadius: e * 1.6,
      shadowOffset: { width: 0, height: Math.ceil(e / 2) },
    },
    android: { elevation: e, shadowColor: t.shadow },
    default: {},
  })!;
}

// ---------- text ----------

type TextProps = ComponentProps<typeof RNText> & {
  variant?: 'display' | 'title' | 'h2' | 'body' | 'muted' | 'small' | 'label' | 'overline';
  color?: string;
  bold?: boolean;
};
export function Text({ variant = 'body', color, bold, style, ...p }: TextProps) {
  const { theme } = useTheme();
  const v: Record<NonNullable<TextProps['variant']>, TextStyle> = {
    display: { fontSize: 34, fontWeight: '800', color: theme.text, letterSpacing: -0.8 },
    title: { fontSize: 26, fontWeight: '800', color: theme.text, letterSpacing: -0.5 },
    h2: { fontSize: 18, fontWeight: '700', color: theme.text, letterSpacing: -0.2 },
    body: { fontSize: 15, color: theme.text, lineHeight: 21 },
    muted: { fontSize: 14, color: theme.muted, lineHeight: 20 },
    small: { fontSize: 12, color: theme.muted },
    label: { fontSize: 13, fontWeight: '600', color: theme.muted },
    overline: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.muted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
  };
  return (
    <RNText
      {...p}
      style={[v[variant], bold && { fontWeight: '700' }, color ? { color } : null, style]}
    />
  );
}

// ---------- layout ----------

/** Scrollable page with safe-area padding and optional pull-to-refresh. */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  edges = ['bottom'],
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: ('top' | 'bottom')[];
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.background }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[{ padding: 18, gap: 16, paddingBottom: 40 }, style]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.muted}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, padding: 18, gap: 16 }, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.card,
    borderRadius: 20,
    borderWidth: theme.mode === 'dark' ? 1 : StyleSheet.hairlineWidth,
    borderColor: theme.border,
    padding: 16,
    gap: 12,
    ...shadow(theme, 1),
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export const Row = ({
  children,
  style,
  gap = 8,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
}) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;

/** "Label ........ value" line used in summaries and receipts. */
export function KV({ k, v, strong }: { k: string; v: ReactNode; strong?: boolean }) {
  const { theme } = useTheme();
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text variant="muted">{k}</Text>
      {typeof v === 'string' || typeof v === 'number' ? (
        <Text
          style={{
            fontWeight: strong ? '700' : '600',
            fontSize: strong ? 17 : 15,
            color: theme.text,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {v}
        </Text>
      ) : (
        v
      )}
    </Row>
  );
}

// ---------- controls ----------

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  size = 'md',
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const colors = {
    primary: { bg: theme.primary, fg: theme.primaryText, border: theme.primary },
    outline: { bg: 'transparent', fg: theme.text, border: theme.fieldBorder },
    ghost: { bg: 'transparent', fg: theme.text, border: 'transparent' },
    danger: { bg: theme.danger, fg: '#fff', border: theme.danger },
  }[variant];
  const h = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: h,
          borderRadius: size === 'sm' ? 12 : 16,
          paddingHorizontal: size === 'sm' ? 14 : 18,
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        (variant === 'primary' || variant === 'danger') && !off && shadow(theme, 2),
        off && { opacity: 0.5 },
        pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={colors.fg} />
      ) : null}
      {title ? (
        <RNText
          style={{
            color: colors.fg,
            fontWeight: '700',
            fontSize: size === 'lg' ? 17 : 15,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </RNText>
      ) : null}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      {children}
      {error ? (
        <Text variant="small" color={theme.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small">{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: ComponentProps<typeof TextInput>) {
  const { theme } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={theme.muted}
      {...props}
      onFocus={(e) => {
        setFocus(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        props.onBlur?.(e);
      }}
      style={[
        {
          minHeight: 50,
          borderRadius: 14,
          borderWidth: focus ? 1.5 : 1,
          borderColor: focus ? theme.primary : theme.fieldBorder,
          backgroundColor: focus ? theme.card : theme.field,
          paddingHorizontal: 14,
          fontSize: 16,
          color: theme.text,
        },
        props.style,
      ]}
    />
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  disabled?: boolean;
}

/** Dropdown: a field that opens a bottom sheet list (works the same on Android and iOS). */
export function Select<T extends string>({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  disabled,
  title,
  icon,
}: {
  value: T | '' | null;
  options: Option<T>[];
  onChange: (v: T) => void;
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  /** Leading icon inside the field. */
  icon?: IconName;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          {
            minHeight: 50,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.fieldBorder,
            backgroundColor: theme.field,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
          },
          disabled && { opacity: 0.5 },
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={18} color={theme.primary} style={{ marginRight: 8 }} />
        ) : null}
        <Text style={{ flex: 1 }} color={current ? theme.text : theme.muted} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }}
          onPress={() => setOpen(false)}
        />
        <View
          style={{
            backgroundColor: theme.card,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '70%',
            paddingBottom: insets.bottom + 8,
          }}
        >
          <SheetHandle />
          <View
            style={{ padding: 16, paddingTop: 4, borderBottomWidth: 1, borderColor: theme.border }}
          >
            <Text variant="h2">{title ?? placeholder}</Text>
          </View>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            renderItem={({ item }) => (
              <Pressable
                disabled={item.disabled}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  {
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  },
                  pressed && { backgroundColor: theme.accent },
                  item.disabled && { opacity: 0.4 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text bold={item.value === value}>{item.label}</Text>
                  {item.hint ? <Text variant="small">{item.hint}</Text> : null}
                </View>
                {item.value === value && (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                )}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

/** Segmented tabs (Upcoming / Parked now / Past, Entry / Exit…). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.accent,
        borderRadius: 16,
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[
              {
                flex: 1,
                paddingVertical: 10,
                borderRadius: 12,
                alignItems: 'center',
                backgroundColor: on ? theme.card : 'transparent',
              },
              on && shadow(theme, 1),
            ]}
          >
            <Text style={{ fontWeight: '600', fontSize: 14 }} color={on ? theme.text : theme.muted}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'success' | 'warning' | 'info' | 'muted' | 'danger';
}) {
  const { theme } = useTheme();
  const c = {
    success: [theme.successBg, theme.success],
    warning: [theme.warningBg, theme.warning],
    info: [theme.infoBg, theme.info],
    danger: [theme.dangerBg, theme.danger],
    muted: [theme.accent, theme.muted],
  }[tone];
  return (
    <View
      style={{
        backgroundColor: c[0],
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700' }} color={c[1]}>
        {label}
      </Text>
    </View>
  );
}

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'success' | 'danger';
}) {
  const { theme } = useTheme();
  const c = {
    info: [theme.infoBg, theme.info],
    warning: [theme.warningBg, theme.warning],
    success: [theme.successBg, theme.success],
    danger: [theme.dangerBg, theme.danger],
  }[tone];
  return (
    <View
      style={{
        backgroundColor: c[0],
        borderRadius: 16,
        padding: 14,
        borderLeftWidth: 4,
        borderLeftColor: c[1],
      }}
    >
      {typeof children === 'string' ? <Text color={c[1]}>{children}</Text> : children}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={theme.muted} />
      <Text variant="muted">{label}</Text>
    </View>
  );
}

export function Empty({
  icon = 'file-tray-outline',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <View style={{ alignItems: 'center', padding: 28, gap: 10 }}>
      <IconCircle name={icon} size={72} />
      <Text variant="h2" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {text ? (
        <Text variant="muted" style={{ textAlign: 'center' }}>
          {text}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export const styles = (t: Theme) =>
  StyleSheet.create({
    divider: { height: 1, backgroundColor: t.border, marginVertical: 4 },
  });

// ---------- premium building blocks ----------

/** Grab handle at the top of bottom sheets. */
export function SheetHandle() {
  const { theme } = useTheme();
  return (
    <View
      style={{
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: 3,
        backgroundColor: theme.fieldBorder,
        marginTop: 10,
        marginBottom: 8,
      }}
    />
  );
}

/** An icon on a soft tinted disc (list rows, empty states, payment methods). */
export function IconCircle({
  name,
  size = 44,
  color,
  bg,
}: {
  name: IconName;
  size?: number;
  color?: string;
  bg?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg ?? theme.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={Math.round(size * 0.46)} color={color ?? theme.primary} />
    </View>
  );
}

/** "‹ Back" pill for screen headers ("✕ Close" on the payment sheet), on iPhone and Android. */
export function BackButton({
  icon = 'chevron-back',
  label,
  onPress,
}: {
  icon?: IconName;
  label?: string;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  const text = label ?? (icon === 'close' ? 'Close' : 'Back');
  const go = onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={8}
      onPress={go}
      style={({ pressed }) => [
        {
          height: 38,
          paddingLeft: 8,
          paddingRight: 14,
          borderRadius: 19,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: theme.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          marginRight: Platform.OS === 'ios' ? 0 : 8,
          ...shadow(theme, 1),
        },
        pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 },
      ]}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: theme.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={icon === 'close' ? 15 : 17} color={theme.primary} />
      </View>
      <RNText style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>{text}</RNText>
    </Pressable>
  );
}

/** Section title with an optional action on the right. */
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
      <Text variant="overline">{title}</Text>
      {action}
    </Row>
  );
}

/** Tappable row: icon, title, subtitle and a chevron (or anything on the right). */
export function ListItem({
  icon,
  iconColor,
  iconBg,
  left,
  title,
  subtitle,
  right,
  onPress,
  selected,
}: {
  icon?: IconName;
  iconColor?: string;
  iconBg?: string;
  left?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.primarySoft : theme.card,
        },
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
      ]}
    >
      {left ?? (icon ? <IconCircle name={icon} size={42} color={iconColor} bg={iconBg} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700', fontSize: 15 }}>{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
      </View>
      {right ??
        (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.muted} /> : null)}
    </Pressable>
  );
}

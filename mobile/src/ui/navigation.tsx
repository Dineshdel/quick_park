import Ionicons from '@expo/vector-icons/Ionicons';
import type { Stack, Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandHeader } from './brand-header';
import { BackButton, shadow, type IconName } from './kit';
import { useTheme } from './theme';

type Static<T> = Exclude<NonNullable<T>, (...args: never[]) => unknown>;
type NativeStackNavigationOptions = Static<ComponentProps<typeof Stack>['screenOptions']>;
type BottomTabNavigationOptions = Static<ComponentProps<typeof Tabs>['screenOptions']>;
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Stack screens: flat header on the page colour, centred title, round back button. */
export function useStackOptions(): NativeStackNavigationOptions {
  const { theme } = useTheme();
  return {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerTitleAlign: 'center',
    headerTitleStyle: { fontWeight: '800', fontSize: 17 },
    headerBackVisible: false,
    headerLeft: ({ canGoBack }) => (canGoBack ? <BackButton /> : null),
    contentStyle: { backgroundColor: theme.background },
    animation: 'slide_from_right',
  };
}

/** Tab icon: outline normally, filled when its tab is selected. */
export function tabIcon(name: IconName, active: IconName) {
  return function TabBarIcon({ color, focused }: { color: unknown; focused: boolean }) {
    // Sized for the round badge in the pill menu.
    return <Ionicons name={focused ? active : name} size={17} color={color as string} />;
  };
}

/** Bottom menu: the "Back"-button pill design, on iPhone and Android alike. */
export function AppTabBar(props: TabBarProps) {
  return <PillTabBar {...props} />;
}

/** One tab's name, badge and press handling (shared by both bars). */
function useTabItems({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  return state.routes
    .map((route, i) => {
      const { options } = descriptors[route.key]!;
      if ((options as { href?: unknown }).href === null) return null;
      const focused = state.index === i;
      return {
        key: route.key,
        focused,
        label:
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : (options.title ?? route.name),
        badge: options.tabBarBadge,
        icon: options.tabBarIcon,
        onPress: (animate?: () => void) => {
          const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            animate?.();
            navigateToTab(route.key);
          }
        },
        onLongPress: () => emitter.emit({ type: 'tabLongPress', target: route.key }),
      };
    })
    .filter((t) => t !== null);
}

function Badge({ value, border }: { value: string | number; border: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: -5,
        right: -10,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 4,
        backgroundColor: theme.danger,
        borderWidth: 2,
        borderColor: border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

/**
 * Menu in the Back-button style with every tab's name underneath: each tab is a round tinted icon badge; the
 * selected one widens into a pill with a soft shadow, in the brand colour. Switching tabs animates the pill.
 */
function PillTabBar(props: TabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useTabItems(props);
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.card,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10),
        paddingHorizontal: 6,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: theme.mode === 'dark' ? StyleSheet.hairlineWidth : 0,
        borderColor: theme.border,
        ...shadow(theme, 3),
      }}
    >
      {items.map((t) => {
        const color = t.focused ? theme.primary : theme.muted;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: t.focused }}
            accessibilityLabel={t.label}
            onPress={() =>
              t.onPress(() =>
                LayoutAnimation.configureNext(
                  LayoutAnimation.create(200, 'easeInEaseOut', 'scaleXY'),
                ),
              )
            }
            onLongPress={t.onLongPress}
            style={({ pressed }) => [
              { flex: 1, alignItems: 'center', gap: 4 },
              pressed && { transform: [{ scale: 0.94 }], opacity: 0.9 },
            ]}
          >
            <View
              style={[
                {
                  width: t.focused ? 56 : 36,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: t.focused ? theme.primarySoft : theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                t.focused && {
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.border,
                  ...shadow(theme, 1),
                },
              ]}
            >
              {t.icon?.({ focused: t.focused, color, size: 17 })}
              {t.badge !== undefined && <Badge value={t.badge} border={theme.card} />}
            </View>
            <Text
              numberOfLines={1}
              style={{
                color: t.focused ? theme.text : theme.muted,
                fontSize: 11,
                fontWeight: t.focused ? '800' : '600',
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tab screens: the brand bar (logo, theme switch, bell) with the page title. */
export function useTabOptions({
  bell = true,
}: { bell?: boolean } = {}): BottomTabNavigationOptions {
  const { theme } = useTheme();
  return {
    header: ({ options }) => <BrandHeader title={options.title} bell={bell} />,
    sceneStyle: { backgroundColor: theme.background },
  };
}

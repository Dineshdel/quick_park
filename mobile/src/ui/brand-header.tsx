import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationBell } from './notification-bell';
import { useTheme } from './theme';

/** Round, see-through icon button on the brand bar. */
function BarButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
      })}
    >
      <Ionicons name={icon} size={20} color={theme.headerText} />
    </Pressable>
  );
}

/** White search field that sits inside the brand bar. */
export function HeaderSearch({
  value,
  onChangeText,
  onSubmit,
  onFocus,
  onBlur,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 46,
        borderRadius: 12,
        // Dark: a lifted grey with a visible edge so the field stands out from the bar.
        backgroundColor: theme.mode === 'dark' ? theme.field : theme.card,
        borderWidth: theme.mode === 'dark' ? 1 : 0,
        borderColor: theme.fieldBorder,
        paddingLeft: 12,
        paddingRight: 4,
        gap: 8,
      }}
    >
      <Ionicons name="search" size={19} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        returnKeyType="search"
        style={{ flex: 1, fontSize: 15, color: theme.text, paddingVertical: 0 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        onPress={onSubmit}
        style={({ pressed }) => ({
          height: 38,
          paddingHorizontal: 14,
          borderRadius: 9,
          backgroundColor: theme.mode === 'dark' ? theme.primary : theme.gold,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            color: theme.mode === 'dark' ? theme.primaryText : '#1a1405',
            fontWeight: '800',
            fontSize: 13,
          }}
        >
          Search
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Brand bar for the main (tab) screens: logo, light/dark switch, the bell, an optional page title and an
 * optional extra row such as a search field. Turns the status bar light while its screen is focused.
 */
export function BrandHeader({
  title,
  bell = true,
  children,
}: {
  title?: string;
  bell?: boolean;
  children?: ReactNode;
}) {
  const { theme, toggle } = useTheme();
  const insets = useSafeAreaInsets();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(theme.mode === 'dark' ? 'light' : 'dark');
    }, [theme.mode]),
  );
  return (
    <View
      style={{
        backgroundColor: theme.header,
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: theme.mode === 'dark' ? theme.primary : theme.gold,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: theme.mode === 'dark' ? theme.primaryText : '#1a1405',
              fontWeight: '900',
              fontSize: 18,
            }}
          >
            P
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.headerText,
              fontWeight: '800',
              fontSize: 18,
              letterSpacing: -0.3,
            }}
          >
            Quick Park
          </Text>
          <Text
            style={{
              color: theme.mode === 'dark' ? theme.headerText : theme.gold,
              opacity: theme.mode === 'dark' ? 0.8 : 1,
              fontSize: 11,
              fontWeight: '700',
              fontStyle: 'italic',
            }}
          >
            Park smart ✦
          </Text>
        </View>
        <BarButton
          icon={theme.mode === 'dark' ? 'sunny' : 'moon'}
          label={theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onPress={toggle}
        />
        {bell && (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <NotificationBell color={theme.headerText} />
          </View>
        )}
      </View>
      {title ? (
        <Text
          style={{ color: theme.headerText, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { refreshSession } from '@/lib/api';
import { DialogProvider } from '@/ui/dialog';
import { ThemeProvider, useTheme } from '@/ui/theme';

function Navigator() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.card },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.background },
          headerBackTitle: 'Back',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
        <Stack.Screen name="(owner)" options={{ headerShown: false }} />
        <Stack.Screen name="choose-role" options={{ title: 'Choose your role' }} />
        <Stack.Screen name="place/[slug]" options={{ title: 'Parking' }} />
        <Stack.Screen name="book/[id]" options={{ title: 'Book a slot' }} />
        <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
        <Stack.Screen name="pay/[id]" options={{ title: 'Payment', presentation: 'modal' }} />
        <Stack.Screen name="gate-charge/[id]" options={{ title: 'Overstay charge' }} />
        <Stack.Screen name="vehicle/[id]" options={{ title: 'Vehicle QR sticker' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  // Restore the session from the refresh token kept in secure storage.
  useEffect(() => {
    void refreshSession();
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <DialogProvider>
            <Navigator />
          </DialogProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

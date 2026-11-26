import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useDialog } from '@/ui/dialog';
import { Loading } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/**
 * Razorpay Checkout in a WebView (works in Expo Go and store builds, no native SDK needed).
 * The booking is confirmed by the server from Razorpay's webhook; the booking screen polls until it is.
 */
export default function PayScreen() {
  const { id, orderId, keyId, amount } = useLocalSearchParams<{
    id: string;
    orderId: string;
    keyId: string;
    amount: string;
  }>();
  const { theme } = useTheme();
  const { showError } = useDialog();
  const qc = useQueryClient();

  const html = useMemo(
    () => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:${theme.background};font-family:system-ui;color:${theme.text};display:flex;align-items:center;justify-content:center;height:100vh}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body><p>Opening secure payment…</p><script>
  const send = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const rz = new Razorpay({
    key: ${JSON.stringify(keyId)}, order_id: ${JSON.stringify(orderId)}, amount: ${Number(amount) || 0}, currency: 'INR',
    name: 'Quick Park', description: 'Parking booking',
    handler: () => send({ type: 'success' }),
    modal: { ondismiss: () => send({ type: 'dismiss' }) },
    theme: { color: '#1f2a5c' }
  });
  rz.on('payment.failed', (r) => send({ type: 'failed', reason: (r && r.error && r.error.description) || 'Payment failed' }));
  rz.open();
</script></body></html>`,
    [keyId, orderId, amount, theme],
  );

  const onMessage = async (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as {
      type: 'success' | 'dismiss' | 'failed';
      reason?: string;
    };
    if (m.type === 'failed')
      await showError(
        new Error(m.reason ?? 'Payment failed. You can try again.'),
        'Payment failed',
      );
    // Used for bookings and for overstay (gate) charges: refresh whichever this was.
    await qc.invalidateQueries({ queryKey: ['booking', id] });
    await qc.invalidateQueries({ queryKey: ['gate-charge', id] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
        onMessage={(e) => void onMessage(e)}
        startInLoadingState
        renderLoading={() => <Loading label="Opening secure payment…" />}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

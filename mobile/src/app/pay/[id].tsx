import Ionicons from '@expo/vector-icons/Ionicons';
import {
  CARD_LOGOS,
  paymentChoiceLabel,
  razorpayMethodOptions,
  UPI_APPS,
  upiIdSchema,
  type PaymentChoice,
} from '@qp/validation';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { api, errorMessage } from '@/lib/api';
import { BrandIcon, BrandTile } from '@/ui/brand-icon';
import { formatRupees } from '@/lib/format';
import { useDialog } from '@/ui/dialog';
import {
  Button,
  Card,
  IconCircle,
  Input,
  ListItem,
  Loading,
  Notice,
  Row,
  Screen,
  SectionHeader,
  shadow,
  Text,
} from '@/ui/kit';
import { useTheme } from '@/ui/theme';

/** Pages the Checkout may load inside the WebView; any other scheme (upi:, phonepe:, intent:, …) is an app. */
const WEB = /^(https?:|about:|data:|blob:|javascript:)/i;

/**
 * Android `intent://pay?…#Intent;scheme=upi;package=…;end` → `upi://pay?…`, which Linking can open.
 * Anything else is returned unchanged.
 */
function intentToUrl(url: string): string {
  if (!url.startsWith('intent://')) return url;
  const [body, frag = ''] = url.slice('intent://'.length).split('#Intent;');
  const scheme = /(?:^|;)scheme=([^;]+)/.exec(frag)?.[1];
  return scheme ? `${scheme}://${body}` : url;
}

type Stage =
  | { name: 'pick' }
  | { name: 'checkout'; choice: PaymentChoice }
  | { name: 'mock'; choice: PaymentChoice }
  | { name: 'done' };

/**
 * Payment for a booking or an overstay (gate) charge. The customer picks how to pay here (a UPI app, a UPI ID
 * that gets a collect request on their phone, a debit / credit card, net banking or a QR code), then Razorpay
 * Checkout opens in a WebView locked to that method. Card details are typed into Razorpay's secure form only.
 * On success the signed result is sent to the API, which checks it with Razorpay and confirms at once (the
 * webhook and the server's reconciliation are the backup). In mock mode the same picker leads to a test step.
 */
export default function PayScreen() {
  const p = useLocalSearchParams<{
    id: string;
    provider?: 'mock' | 'razorpay';
    orderId: string;
    keyId: string;
    amount: string;
    description?: string;
    name?: string;
    email?: string;
    contact?: string;
  }>();
  const amount = Number(p.amount) || 0;
  const { theme } = useTheme();
  const { showError } = useDialog();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ name: 'pick' });
  const [vpa, setVpa] = useState('');
  const [vpaError, setVpaError] = useState<string | null>(null);
  const [showVpa, setShowVpa] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const choose = (choice: PaymentChoice) =>
    setStage(p.provider === 'mock' ? { name: 'mock', choice } : { name: 'checkout', choice });

  const payWithVpa = () => {
    const r = upiIdSchema.safeParse(vpa);
    if (!r.success) return setVpaError(r.error.issues[0]?.message ?? 'Invalid UPI ID');
    setVpaError(null);
    choose({ kind: 'upi_id', vpa: r.data });
  };

  /** Refresh whichever this paid for (booking or gate charge), then show the success screen. */
  const finish = async () => {
    await qc.invalidateQueries({ queryKey: ['booking', p.id] });
    await qc.invalidateQueries({ queryKey: ['gate-charge', p.id] });
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    setStage({ name: 'done' });
  };

  const mockPay = async (outcome: 'success' | 'failure') => {
    setBusy(true);
    try {
      await api('/payments/mock/pay', { body: { orderId: p.orderId, outcome } });
      if (outcome === 'failure') {
        await showError(new Error('The payment failed (simulated). Try again.'), 'Payment failed');
        setStage({ name: 'pick' });
      } else await finish();
    } catch (e) {
      await showError(new Error(errorMessage(e)), 'Payment failed');
    } finally {
      setBusy(false);
    }
  };

  if (stage.name === 'done') return <Success amount={amount} />;

  if (stage.name === 'checkout')
    return (
      <Checkout
        choice={stage.choice}
        params={p}
        onBack={() => setStage({ name: 'pick' })}
        onPaid={async (r) => {
          if (done.current) return;
          done.current = true;
          // A failed verify call is fine: the webhook / reconciliation still confirms, and the screen polls.
          await api('/payments/verify', { body: r }).catch(() => null);
          await finish();
        }}
        onFailed={(reason) => void showError(new Error(reason), 'Payment failed')}
      />
    );

  if (stage.name === 'mock')
    return (
      <Screen>
        <AmountHero amount={amount} description={p.description} />
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 24 }}>
          <MethodBadge choice={stage.choice} size={64} />
          <Text variant="h2" style={{ textAlign: 'center' }}>
            {mockTitle(stage.choice)}
          </Text>
          <Text variant="muted" style={{ textAlign: 'center' }}>
            {mockText(stage.choice)}
          </Text>
          <Notice tone="warning">Test mode: no real money moves. Choose the result.</Notice>
          <Button
            title="Simulate successful payment"
            icon="checkmark-circle"
            size="lg"
            loading={busy}
            onPress={() => void mockPay('success')}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            title="Simulate failure"
            variant="outline"
            disabled={busy}
            onPress={() => void mockPay('failure')}
            style={{ alignSelf: 'stretch' }}
          />
          <Button
            title="Choose another method"
            variant="ghost"
            disabled={busy}
            onPress={() => setStage({ name: 'pick' })}
          />
        </Card>
      </Screen>
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <AmountHero amount={amount} description={p.description} />

        <SectionHeader title="Pay by UPI app" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {UPI_APPS.map((a) => (
            <Pressable
              key={a.code}
              accessibilityRole="button"
              accessibilityLabel={`Pay with ${a.name}`}
              onPress={() => choose({ kind: 'upi_app', app: a.code })}
              style={({ pressed }) => [
                {
                  width: '31.5%',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 18,
                  backgroundColor: theme.card,
                  borderWidth: 1,
                  borderColor: theme.border,
                  ...shadow(theme, 1),
                },
                pressed && { transform: [{ scale: 0.96 }], borderColor: theme.primary },
              ]}
            >
              <AppMonogram code={a.code} size={46} />
              <Text style={{ fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                {a.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text variant="small">
          The app opens on your phone. Approve the payment there and come back here.
        </Text>

        <SectionHeader title="Other ways to pay" />
        <View style={{ gap: 10 }}>
          <ListItem
            icon="at"
            title="Pay with UPI ID"
            subtitle="Get a payment request in your UPI app"
            selected={showVpa}
            onPress={() => setShowVpa((v) => !v)}
            right={
              <Ionicons
                name={showVpa ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.muted}
              />
            }
          />
          {showVpa && (
            <Card style={{ gap: 10 }}>
              <Input
                value={vpa}
                onChangeText={(t) => {
                  setVpa(t);
                  setVpaError(null);
                }}
                placeholder="yourname@okaxis"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="go"
                onSubmitEditing={payWithVpa}
                autoFocus
              />
              {vpaError ? (
                <Text variant="small" color={theme.danger}>
                  {vpaError}
                </Text>
              ) : (
                <Text variant="small">
                  A request for {formatRupees(amount)} is sent to this UPI ID. Approve it in your
                  UPI app within 5 minutes.
                </Text>
              )}
              <Button title="Send payment request" icon="send" onPress={payWithVpa} />
            </Card>
          )}
          <ListItem
            icon="card"
            title="Debit / credit card"
            subtitle="Visa · Mastercard · RuPay · Amex"
            onPress={() => choose({ kind: 'card' })}
            right={
              <Row gap={4}>
                {CARD_LOGOS.map((l) => (
                  <View
                    key={l}
                    style={{
                      width: 34,
                      height: 24,
                      borderRadius: 5,
                      backgroundColor: '#ffffff',
                      borderWidth: 1,
                      borderColor: 'rgba(0,0,0,0.08)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <BrandIcon logo={l} size={18} />
                  </View>
                ))}
              </Row>
            }
          />
          <ListItem
            icon="business"
            title="Net banking"
            subtitle="All major Indian banks"
            onPress={() => choose({ kind: 'netbanking' })}
          />
          <ListItem
            icon="qr-code"
            title="Scan a UPI QR code"
            subtitle="Pay from another phone"
            onPress={() => choose({ kind: 'upi_qr' })}
          />
        </View>

        <Row style={{ justifyContent: 'center', marginTop: 8 }} gap={6}>
          <Ionicons name="lock-closed" size={13} color={theme.success} />
          <Text variant="small">Secured by Razorpay · card details never reach Quick Park</Text>
        </Row>
      </Screen>
    </KeyboardAvoidingView>
  );
}

// ---------- pieces ----------

function AmountHero({ amount, description }: { amount: number; description?: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.mode === 'dark' ? theme.card : theme.primary,
        borderRadius: 24,
        padding: 22,
        gap: 6,
        overflow: 'hidden',
        ...shadow(theme, 2),
      }}
    >
      {/* Decorative rings */}
      <View
        style={{
          position: 'absolute',
          right: -40,
          top: -40,
          width: 160,
          height: 160,
          borderRadius: 80,
          borderWidth: 26,
          borderColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(214,167,63,0.22)',
        }}
      />
      <Text variant="overline" color="rgba(255,255,255,0.75)">
        Amount to pay
      </Text>
      <Text
        style={{ fontSize: 38, fontWeight: '800', letterSpacing: -1 }}
        color={theme.mode === 'dark' ? theme.primary : '#ffffff'}
      >
        {formatRupees(amount)}
      </Text>
      {description ? (
        <Row gap={6}>
          <Ionicons
            name="car-sport"
            size={14}
            color={theme.mode === 'dark' ? theme.primary : theme.gold}
          />
          <Text style={{ fontSize: 13, fontWeight: '600' }} color="rgba(255,255,255,0.88)">
            {description}
          </Text>
        </Row>
      ) : null}
    </View>
  );
}

/** The app's real logo on a white tile, or a coloured letter for apps without a logo here. */
function AppMonogram({ code, size }: { code: string; size: number }) {
  const app = UPI_APPS.find((a) => a.code === code)!;
  if (app.logo) return <BrandTile logo={app.logo} size={size} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 3,
        backgroundColor: app.color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '800' }} color="#fff">
        {app.short}
      </Text>
    </View>
  );
}

function MethodBadge({ choice, size }: { choice: PaymentChoice; size: number }) {
  if (choice.kind === 'upi_app') return <AppMonogram code={choice.app} size={size} />;
  const icon =
    choice.kind === 'card'
      ? 'card'
      : choice.kind === 'netbanking'
        ? 'business'
        : choice.kind === 'upi_qr'
          ? 'qr-code'
          : 'at';
  return <IconCircle name={icon} size={size} />;
}

const mockTitle = (c: PaymentChoice) =>
  c.kind === 'upi_app'
    ? `Opening ${paymentChoiceLabel(c)}…`
    : c.kind === 'upi_id'
      ? `Request sent to ${c.vpa}`
      : `Pay by ${paymentChoiceLabel(c).toLowerCase()}`;

const mockText = (c: PaymentChoice) =>
  c.kind === 'upi_app'
    ? 'With live payments the app opens here and you approve the payment with your UPI PIN.'
    : c.kind === 'upi_id'
      ? 'With live payments a notification arrives in the UPI app linked to this ID. Approve it with your UPI PIN.'
      : c.kind === 'card'
        ? "With live payments Razorpay's secure card form opens (debit or credit, with OTP)."
        : c.kind === 'netbanking'
          ? 'With live payments you pick your bank and sign in on its secure page.'
          : 'With live payments a QR code appears; scan it from any UPI app.';

function Success({ amount }: { amount: number }) {
  const { theme } = useTheme();
  return (
    <Screen style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 18 }}>
      <View
        style={{
          width: 112,
          height: 112,
          borderRadius: 56,
          backgroundColor: theme.successBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="checkmark-circle" size={84} color={theme.success} />
      </View>
      <Text variant="title" style={{ textAlign: 'center' }}>
        Payment successful
      </Text>
      <Text variant="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
        {formatRupees(amount)} received. We&apos;re confirming it now. Your booking updates in a
        moment.
      </Text>
      <Button
        title="Done"
        size="lg"
        icon="arrow-forward"
        onPress={() => router.back()}
        style={{ alignSelf: 'stretch' }}
      />
    </Screen>
  );
}

function Checkout({
  choice,
  params: p,
  onBack,
  onPaid,
  onFailed,
}: {
  choice: PaymentChoice;
  params: {
    orderId: string;
    keyId: string;
    amount: string;
    description?: string;
    name?: string;
    email?: string;
    contact?: string;
  };
  onBack: () => void;
  onPaid: (r: { orderId: string; paymentId: string; signature: string }) => Promise<void>;
  onFailed: (reason: string) => void;
}) {
  const { theme } = useTheme();
  const { showError } = useDialog();

  const html = useMemo(() => {
    const m = razorpayMethodOptions(choice);
    const options = {
      key: p.keyId,
      order_id: p.orderId,
      amount: Number(p.amount) || 0,
      currency: 'INR',
      name: 'Quick Park',
      description: p.description || 'Parking booking',
      prefill: { name: p.name || '', email: p.email || '', contact: p.contact || '', ...m.prefill },
      config: m.config,
      theme: { color: theme.primary },
    };
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:${theme.background};font-family:system-ui;color:${theme.text};display:flex;align-items:center;justify-content:center;height:100vh}</style>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
<body><p>Opening secure payment…</p><script>
  const send = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const rz = new Razorpay(Object.assign(${JSON.stringify(options)}, {
    handler: (r) => send({ type: 'success', paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature }),
    modal: { ondismiss: () => send({ type: 'dismiss' }) },
  }));
  rz.on('payment.failed', (r) => send({ type: 'failed', reason: (r && r.error && r.error.description) || 'Payment failed' }));
  rz.open();
</script></body></html>`;
  }, [choice, p, theme]);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = JSON.parse(e.nativeEvent.data) as {
      type: 'success' | 'dismiss' | 'failed';
      reason?: string;
      paymentId?: string;
      orderId?: string;
      signature?: string;
    };
    // A failure keeps Checkout open for another try; just tell the customer.
    if (m.type === 'failed') return onFailed(m.reason ?? 'Payment failed. You can try again.');
    if (m.type === 'dismiss') return onBack();
    if (m.paymentId && m.orderId && m.signature)
      void onPaid({ orderId: m.orderId, paymentId: m.paymentId, signature: m.signature });
  };

  /** UPI apps (GPay, PhonePe, Paytm…) open outside the WebView; Checkout waits and picks up the result. */
  const openApp = (url: string) => {
    Linking.openURL(intentToUrl(url)).catch(() =>
      showError(
        new Error('That payment app is not installed on this phone. Choose another way to pay.'),
        'App not found',
      ).then(onBack),
    );
    return false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={(req) => (WEB.test(req.url) ? true : openApp(req.url))}
        startInLoadingState
        renderLoading={() => <Loading label={`Opening ${paymentChoiceLabel(choice)} securely…`} />}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

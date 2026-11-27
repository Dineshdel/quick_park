import type { BookingDto, MyQueryDto } from '@qp/types';
import { disputeCreateSchema } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, formatRupees } from '@/lib/format';
import { useDialog } from '@/ui/dialog';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  IconCircle,
  Input,
  Loading,
  Screen,
  SectionHeader,
  Select,
  Text,
} from '@/ui/kit';

const STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'muted' | 'info' }> = {
  OPEN: { label: 'Open', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  REJECTED: { label: 'Closed', tone: 'muted' },
};

/** Help & queries: raise a query about a booking (it goes to the Quick Park team) and follow its answer. */
export default function QueriesScreen() {
  const { showError } = useDialog();
  const qc = useQueryClient();
  const [bookingId, setBookingId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const queries = useQuery({
    queryKey: ['my-queries'],
    queryFn: () => api<MyQueryDto[]>('/bookings/queries'),
  });
  // Bookings a query can be about: anything already paid (upcoming, parked now or past).
  const bookings = useQuery({
    queryKey: ['bookings', 'all-for-queries'],
    queryFn: async () => {
      const tabs = await Promise.all(
        (['active', 'upcoming', 'past'] as const).map((t) =>
          api<BookingDto[]>(`/bookings?tab=${t}`),
        ),
      );
      return tabs.flat().filter((b) => b.status !== 'PENDING_PAYMENT');
    },
  });

  const submit = async () => {
    const r = disputeCreateSchema.safeParse({ reason });
    if (!bookingId) return setError('Choose the booking this is about.');
    if (!r.success) return setError(r.error.issues[0]?.message ?? 'Tell us what went wrong.');
    setError(null);
    setBusy(true);
    try {
      await api(`/bookings/${bookingId}/disputes`, { body: r.data });
      setReason('');
      setBookingId('');
      setSent(true);
      await qc.invalidateQueries({ queryKey: ['my-queries'] });
    } catch (e) {
      await showError(e, "Couldn't send your query");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onRefresh={() => void queries.refetch()} refreshing={queries.isRefetching}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconCircle name="chatbubbles" size={46} />
          <View style={{ flex: 1 }}>
            <Text variant="h2">Raise a query</Text>
            <Text variant="small">
              Wrong charge, gate problem, refund question? Our team replies here.
            </Text>
          </View>
        </View>
        {sent && <Badge label="✓ Query sent. We'll get back to you soon." tone="success" />}
        <Field label="Booking">
          <Select
            icon="ticket-outline"
            title="Which booking?"
            placeholder={bookings.isPending ? 'Loading bookings…' : 'Choose a booking'}
            value={bookingId}
            options={(bookings.data ?? []).map((b) => ({
              value: b.id,
              label: `${b.code} · ${b.location.name}`,
              hint: fmtDate(b.startAt),
            }))}
            onChange={(v) => {
              setBookingId(v);
              setSent(false);
            }}
          />
        </Field>
        <Field label="What happened?" error={error ?? undefined}>
          <Input
            value={reason}
            onChangeText={(t) => {
              setReason(t);
              setSent(false);
            }}
            placeholder="Describe the problem (10+ characters)"
            multiline
            numberOfLines={4}
            maxLength={1000}
            style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }}
          />
        </Field>
        <Button title="Send query" icon="send" loading={busy} onPress={() => void submit()} />
      </Card>

      <SectionHeader title="My queries" />
      {queries.isPending ? (
        <Loading />
      ) : !queries.data?.length ? (
        <Empty
          icon="chatbubble-ellipses-outline"
          title="No queries yet"
          text="Queries you raise show up here with our reply."
        />
      ) : (
        queries.data.map((d) => {
          const st = STATUS[d.status] ?? { label: d.status, tone: 'info' as const };
          return (
            <Card key={d.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700' }} numberOfLines={1}>
                    {d.placeName}
                  </Text>
                  <Text variant="small">
                    {d.bookingCode} · {fmtDateTime(d.createdAt)}
                  </Text>
                </View>
                <Badge label={st.label} tone={st.tone} />
              </View>
              <Text>{d.reason}</Text>
              {d.resolution ? (
                <View style={{ gap: 4, paddingTop: 4 }}>
                  <Text variant="overline">Reply from Quick Park</Text>
                  <Text>{d.resolution}</Text>
                  {d.refundPaise > 0 && (
                    <Badge label={`Refund ${formatRupees(d.refundPaise)}`} tone="info" />
                  )}
                </View>
              ) : (
                <Text variant="small">Waiting for a reply from our team.</Text>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

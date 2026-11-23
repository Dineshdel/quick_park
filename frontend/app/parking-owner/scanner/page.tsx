'use client';

import type { ScanResultDto, SessionDto } from '@qp/types';
import { formatPlate } from '@qp/validation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, LogIn, LogOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageShell } from '@/shared/layout/page-shell';
import { api, ApiError, errorMessage } from '@/shared/lib/api';
import { fmtTime, formatRupees } from '@/shared/lib/format';
import { useLiveAvailability } from '@/shared/realtime/use-live-availability';
import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Tabs } from '@/shared/ui/tabs';
import { useOwnerLocations } from '../_components/use-owner';

type Direction = 'ENTRY' | 'EXIT';
type Outcome = { kind: 'ok'; result: ScanResultDto } | { kind: 'due'; result: ScanResultDto } | { kind: 'error'; message: string; walkIn?: { plateNumber: string; vehicleTypeId: string | null } };

/** Camera QR scanner (html5-qrcode); a USB/Bluetooth scanner or the keyboard types into the text box instead. */
function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scanner = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const cb = useRef(onCode);
  cb.current = onCode;

  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    (async () => {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      const s = new Html5Qrcode('qr-reader');
      scanner.current = s;
      try {
        await s.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            // Ignore the same code for 3 s so one QR isn't processed many times.
            if (text === last.current.code && Date.now() - last.current.at < 3000) return;
            last.current = { code: text, at: Date.now() };
            cb.current(text);
          },
          () => undefined,
        );
      } catch {
        setErr('Camera unavailable. Allow camera access (needs HTTPS or localhost), or use the text box.');
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
      const s = scanner.current;
      scanner.current = null;
      if (s) void s.stop().then(() => s.clear()).catch(() => undefined);
    };
  }, [on]);

  return (
    <div className="grid gap-2">
      <div id="qr-reader" className={on ? 'overflow-hidden rounded-lg border' : 'hidden'} />
      {err && <Alert variant="destructive">{err}</Alert>}
      <Button variant="outline" onClick={() => { setErr(null); setOn((v) => !v); }}>
        {on ? <><CameraOff /> Stop camera</> : <><Camera /> Start camera</>}
      </Button>
    </div>
  );
}

export default function ScannerPage() {
  const qc = useQueryClient();
  const locs = useOwnerLocations();
  const active = useMemo(() => locs.data?.filter((l) => l.status === 'ACTIVE') ?? [], [locs.data]);
  const [locationId, setLocationId] = useState('');
  const [direction, setDirection] = useState<Direction>('ENTRY');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [walkPlate, setWalkPlate] = useState('');
  const [walkType, setWalkType] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { live, connected } = useLiveAvailability(locationId || undefined);
  const loc = active.find((l) => l.id === locationId);

  useEffect(() => {
    if (!locationId && active[0]) setLocationId(active[0].id);
  }, [active, locationId]);
  useEffect(() => {
    if (loc && !walkType) setWalkType(loc.capacities[0]?.vehicleTypeId ?? '');
  }, [loc, walkType]);

  const sessionsKey = ['sessions', locationId];
  const sessions = useQuery({ queryKey: sessionsKey, queryFn: () => api<SessionDto[]>(`/access/sessions?locationId=${locationId}`), enabled: !!locationId, refetchInterval: 15_000 });
  const refresh = () => void qc.invalidateQueries({ queryKey: sessionsKey });

  const scan = useCallback(
    async (token: string, dir: Direction = direction) => {
      if (!locationId || !token.trim()) return;
      setBusy(true);
      setOutcome(null);
      try {
        const r = await api<ScanResultDto>('/access/scan', { body: { token: token.trim(), locationId, direction: dir } });
        setOutcome(r.amountDuePaise > 0 ? { kind: 'due', result: r } : { kind: 'ok', result: r });
        refresh();
      } catch (e) {
        const walkIn = e instanceof ApiError && e.code === 'NO_BOOKING' ? (e.details as unknown as { plateNumber: string; vehicleTypeId: string | null }) : undefined;
        if (walkIn) {
          setWalkPlate(walkIn.plateNumber);
          if (walkIn.vehicleTypeId && loc?.capacities.some((c) => c.vehicleTypeId === walkIn.vehicleTypeId)) setWalkType(walkIn.vehicleTypeId);
        }
        setOutcome({ kind: 'error', message: errorMessage(e), walkIn });
      } finally {
        setBusy(false);
        setText('');
        inputRef.current?.focus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locationId, direction, loc],
  );

  const collect = async (sessionId: string, paymentMethod?: 'CASH' | 'UPI') => {
    setBusy(true);
    try {
      const r = await api<ScanResultDto>(`/access/sessions/${sessionId}/exit`, { body: paymentMethod ? { paymentMethod } : {} });
      setOutcome({ kind: 'ok', result: r });
      refresh();
    } catch (e) {
      setOutcome({ kind: 'error', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const walkIn = async () => {
    setBusy(true);
    try {
      const r = await api<ScanResultDto>('/access/walk-in', { body: { locationId, vehicleTypeId: walkType, plateNumber: walkPlate } });
      setOutcome({ kind: 'ok', result: r });
      setWalkPlate('');
      refresh();
    } catch (e) {
      setOutcome({ kind: 'error', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (locs.isPending) return <PageShell title="Gate scanner"><p className="text-sm text-muted-foreground">Loading…</p></PageShell>;
  if (!active.length) return <PageShell title="Gate scanner"><Alert>You need an approved, active place to use the scanner.</Alert></PageShell>;

  return (
    <PageShell title="Gate scanner" description="Scan the customer's pass or vehicle sticker with the camera or a USB/Bluetooth scanner, or type the booking code or number plate.">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-64" aria-label="Place">
          {active.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Tabs value={direction} onChange={setDirection} items={[{ value: 'ENTRY', label: 'Entry' }, { value: 'EXIT', label: 'Exit' }]} />
        <span className={`text-xs ${connected ? 'text-success' : 'text-muted-foreground'}`}>{connected ? '● Live' : '○ Connecting…'}</span>
      </div>

      {loc && (
        <div className="flex flex-wrap gap-2">
          {loc.capacities.map((c) => {
            const l = live[c.vehicleTypeId];
            const inside = l?.inside ?? sessions.data?.filter((s) => s.vehicleTypeName === c.vehicleTypeName).length ?? 0;
            return (
              <Badge key={c.vehicleTypeId} variant={inside >= c.totalSlots ? 'danger' : 'muted'} className="px-3 py-1 text-sm">
                {c.vehicleTypeName}: {inside}/{c.totalSlots} inside{l ? ` · ${l.free} bookable` : ''}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="grid content-start gap-4">
          <Card>
            <CardContent className="grid gap-3 pt-6">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void scan(text);
                }}
              >
                <Input ref={inputRef} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Scan, or type booking code (QPAB12CD) or plate (TN09AB1234)" aria-label="Pass, sticker, booking code or number plate" autoCapitalize="characters" className="font-mono" />
                <Button type="submit" loading={busy}>
                  {direction === 'ENTRY' ? <LogIn /> : <LogOut />} {direction === 'ENTRY' ? 'Check in' : 'Check out'}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                Accepted: booking pass QR, vehicle sticker QR, booking code shown under the pass, or the number plate (finds the booking for that vehicle).
              </p>
              <CameraScanner onCode={(c) => void scan(c)} />
            </CardContent>
          </Card>

          {outcome && (
            <Card className={outcome.kind === 'error' ? 'border-destructive' : outcome.kind === 'due' ? 'border-amber-500' : 'border-success'}>
              <CardContent className="grid gap-3 pt-6">
                {outcome.kind === 'error' ? (
                  <>
                    <p className="text-lg font-semibold text-destructive">✕ {outcome.message}</p>
                    {outcome.walkIn && <p className="text-sm">Fill the walk-in form with the details below to let the vehicle in and charge at exit.</p>}
                  </>
                ) : (
                  <>
                    <p className={`text-lg font-semibold ${outcome.kind === 'due' ? 'text-amber-600' : 'text-success'}`}>{outcome.kind === 'due' ? '⚠' : '✓'} {outcome.result.message}</p>
                    <p className="text-sm">
                      <span className="font-mono text-base font-semibold">{formatPlate(outcome.result.plateNumber)}</span> · {outcome.result.vehicleTypeName}
                      {outcome.result.customerName ? ` · ${outcome.result.customerName}` : ''}
                      {outcome.result.booking ? ` · ${outcome.result.booking.code} until ${fmtTime(outcome.result.booking.endAt)}` : ''}
                    </p>
                    {outcome.kind === 'due' && (
                      <div className="grid gap-2">
                        <p className="text-2xl font-semibold">Collect {formatRupees(outcome.result.amountDuePaise)}</p>
                        <div className="flex gap-2">
                          <Button loading={busy} onClick={() => collect(outcome.result.sessionId, 'CASH')}>Paid in cash</Button>
                          <Button variant="outline" disabled={busy} onClick={() => collect(outcome.result.sessionId, 'UPI')}>Paid by UPI</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inside now ({sessions.data?.filter((s) => !s.exitAt).length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {sessions.data?.length === 0 && <p className="text-sm text-muted-foreground">No vehicles inside.</p>}
              {sessions.data?.map((s) => {
                const late = s.bookingEndAt && new Date(s.bookingEndAt) < new Date();
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="font-mono font-semibold">{formatPlate(s.plateNumber)}</span>
                    <span className="text-muted-foreground">{s.vehicleTypeName}</span>
                    {s.isWalkIn ? <Badge variant="info">Walk-in</Badge> : <Badge variant="muted">{s.bookingCode}</Badge>}
                    {late && <Badge variant="danger">Overstaying</Badge>}
                    <span className="flex-1 text-right text-muted-foreground">in {fmtTime(s.entryAt)}{s.bookingEndAt ? ` · until ${fmtTime(s.bookingEndAt)}` : ''}</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void scan(s.plateNumber, 'EXIT')}>
                      Check out
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-lg">Walk-in (no booking)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Input value={walkPlate} onChange={(e) => setWalkPlate(e.target.value)} placeholder="Number plate" aria-label="Number plate" className="font-mono uppercase" />
            <Select value={walkType} onChange={(e) => setWalkType(e.target.value)} aria-label="Vehicle type">
              {loc?.capacities.map((c) => (
                <option key={c.vehicleTypeId} value={c.vehicleTypeId}>
                  {c.vehicleTypeName}
                </option>
              ))}
            </Select>
            <Button loading={busy} disabled={walkPlate.trim().length < 4} onClick={walkIn}>
              Let in as walk-in
            </Button>
            <p className="text-xs text-muted-foreground">Charged at the hourly rate per started hour when the vehicle leaves.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

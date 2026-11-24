import type { OwnerLocationDto, ScanResultDto, SessionDto } from '@qp/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage } from './api';
import { useOwnerLocations } from './hooks';

export type Direction = 'ENTRY' | 'EXIT';
export type Outcome =
  | { kind: 'ok' | 'due'; result: ScanResultDto }
  | {
      kind: 'error';
      message: string;
      walkIn?: { plateNumber: string; vehicleTypeId: string | null };
    };

interface Gate {
  places: OwnerLocationDto[];
  placesLoading: boolean;
  place: OwnerLocationDto | undefined;
  setPlaceId: (id: string) => void;
  sessions: SessionDto[];
  sessionsLoading: boolean;
  refreshSessions: () => Promise<unknown>;
  outcome: Outcome | null;
  clearOutcome: () => void;
  busy: boolean;
  scan: (token: string, direction: Direction) => Promise<void>;
  collect: (sessionId: string, method: 'CASH' | 'UPI') => Promise<void>;
  walkIn: (plateNumber: string, vehicleTypeId: string) => Promise<void>;
}

const GateContext = createContext<Gate | null>(null);

/** Gate state shared by the Scanner and Inside-now tabs: chosen place, last scan result, vehicles inside. */
export function GateProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const locs = useOwnerLocations();
  const places = useMemo(() => locs.data?.filter((l) => l.status === 'ACTIVE') ?? [], [locs.data]);
  const [pickedPlace, setPlaceId] = useState('');
  // The first live place until the user picks another.
  const placeId = places.some((p) => p.id === pickedPlace) ? pickedPlace : (places[0]?.id ?? '');
  const place = places.find((p) => p.id === placeId);

  const sessions = useQuery({
    queryKey: ['sessions', placeId],
    queryFn: () => api<SessionDto[]>(`/access/sessions?locationId=${placeId}`),
    enabled: !!placeId,
    refetchInterval: 15_000,
  });
  const refreshSessions = useCallback(
    () => qc.invalidateQueries({ queryKey: ['sessions', placeId] }),
    [qc, placeId],
  );

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const scan = useCallback(
    async (token: string, direction: Direction) => {
      if (!placeId || !token.trim()) return;
      setBusy(true);
      setOutcome(null);
      try {
        const r = await api<ScanResultDto>('/access/scan', {
          body: { token: token.trim(), locationId: placeId, direction },
        });
        setOutcome({ kind: r.amountDuePaise > 0 ? 'due' : 'ok', result: r });
        void refreshSessions();
      } catch (e) {
        const walkIn =
          e instanceof ApiError && e.code === 'NO_BOOKING'
            ? (e.details as { plateNumber: string; vehicleTypeId: string | null })
            : undefined;
        setOutcome({ kind: 'error', message: errorMessage(e), walkIn });
      } finally {
        setBusy(false);
      }
    },
    [placeId, refreshSessions],
  );

  const collect = useCallback(
    async (sessionId: string, method: 'CASH' | 'UPI') => {
      setBusy(true);
      try {
        const r = await api<ScanResultDto>(`/access/sessions/${sessionId}/exit`, {
          body: { paymentMethod: method },
        });
        setOutcome({ kind: 'ok', result: r });
        void refreshSessions();
      } catch (e) {
        setOutcome({ kind: 'error', message: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    },
    [refreshSessions],
  );

  const walkIn = useCallback(
    async (plateNumber: string, vehicleTypeId: string) => {
      setBusy(true);
      try {
        const r = await api<ScanResultDto>('/access/walk-in', {
          body: { locationId: placeId, vehicleTypeId, plateNumber },
        });
        setOutcome({ kind: 'ok', result: r });
        void refreshSessions();
      } catch (e) {
        setOutcome({ kind: 'error', message: errorMessage(e) });
      } finally {
        setBusy(false);
      }
    },
    [placeId, refreshSessions],
  );

  const value: Gate = {
    places,
    placesLoading: locs.isPending,
    place,
    setPlaceId: (id) => {
      setPlaceId(id);
      setOutcome(null);
    },
    sessions: sessions.data ?? [],
    sessionsLoading: sessions.isPending && !!placeId,
    refreshSessions: () => sessions.refetch(),
    outcome,
    clearOutcome: () => setOutcome(null),
    busy,
    scan,
    collect,
    walkIn,
  };
  return <GateContext.Provider value={value}>{children}</GateContext.Provider>;
}

export function useGate() {
  const g = useContext(GateContext);
  if (!g) throw new Error('useGate must be inside GateProvider');
  return g;
}

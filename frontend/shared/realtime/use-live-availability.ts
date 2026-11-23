'use client';

import type { AvailabilityEvent } from '@qp/types';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_API_WS_URL ?? 'http://localhost:4000';

/** Live { free, inside } per vehicle type for one place, pushed by the API's /realtime socket. */
export function useLiveAvailability(locationId: string | undefined) {
  const [live, setLive] = useState<Record<string, AvailabilityEvent>>({});
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!locationId) return;
    const socket = io(`${WS_URL}/realtime`, { transports: ['websocket'], withCredentials: true });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe', locationId);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('availability', (e: AvailabilityEvent) => {
      if (e.locationId === locationId) setLive((prev) => ({ ...prev, [e.vehicleTypeId]: e }));
    });
    return () => {
      socket.emit('unsubscribe', locationId);
      socket.disconnect();
    };
  }, [locationId]);
  return { live, connected };
}

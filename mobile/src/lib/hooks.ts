import type { OwnerLocationDto, VehicleDto, VehicleTypeDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api, session } from './api';

export const useSession = () => useSyncExternalStore(session.subscribe, session.get, session.get);

export const useVehicles = () =>
  useQuery({ queryKey: ['vehicles'], queryFn: () => api<VehicleDto[]>('/vehicles') });
export const useVehicleTypes = () =>
  useQuery({
    queryKey: ['vehicle-types'],
    queryFn: () => api<VehicleTypeDto[]>('/vehicle-types'),
    staleTime: 3_600_000,
  });
export const useOwnerLocations = () =>
  useQuery({
    queryKey: ['owner-locations'],
    queryFn: () => api<OwnerLocationDto[]>('/owner/locations'),
  });

/** A fresh idempotency key per booking attempt (the API dedupes retries with it). */
export const newKey = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

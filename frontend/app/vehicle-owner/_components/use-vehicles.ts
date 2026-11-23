'use client';

import type { VehicleDto, VehicleTypeDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';

export const VEHICLES_KEY = ['vehicles'];

export const useVehicles = () => useQuery({ queryKey: VEHICLES_KEY, queryFn: () => api<VehicleDto[]>('/vehicles') });

/** Active vehicle types (public endpoint); changes rarely, so cache for 10 minutes. */
export const useVehicleTypes = () =>
  useQuery({ queryKey: ['vehicle-types'], queryFn: () => api<VehicleTypeDto[]>('/vehicle-types'), staleTime: 600_000 });

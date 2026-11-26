'use client';

import type { CategoryDto, VehicleTypeDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';

export const useVehicleTypes = () =>
  useQuery({
    queryKey: ['vehicle-types'],
    queryFn: () => api<VehicleTypeDto[]>('/vehicle-types'),
    staleTime: 600_000,
  });
export const useCategories = () =>
  useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryDto[]>('/categories'),
    staleTime: 600_000,
  });

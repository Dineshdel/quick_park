'use client';

import type { OwnerLocationDto, OwnerProfileDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';

/** GET /owner/profile returns null (rendered as {} by JSON) until the owner saves a profile. */
export const useOwnerProfile = () =>
  useQuery({
    queryKey: ['owner-profile'],
    queryFn: async () => {
      const p = await api<OwnerProfileDto | Record<string, never> | null>('/owner/profile');
      return p && 'id' in p ? (p as OwnerProfileDto) : null;
    },
  });

export const useOwnerLocations = () => useQuery({ queryKey: ['owner-locations'], queryFn: () => api<OwnerLocationDto[]>('/owner/locations') });

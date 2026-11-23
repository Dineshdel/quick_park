'use client';

import type { CancellationPolicyDto } from '@qp/types';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/lib/api';

export const usePolicies = () =>
  useQuery({ queryKey: ['policies'], queryFn: () => api<CancellationPolicyDto[]>('/cancellation-policies'), staleTime: 600_000 });

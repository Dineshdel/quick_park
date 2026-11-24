import { type CancellationPolicy, type PlatformSettings } from '@prisma/client';
import { type CancellationPolicyDto, type CancellationRule, type PlatformSettingsDto } from '@qp/types';

export const toPolicyDto = (p: CancellationPolicy): CancellationPolicyDto => ({
  id: p.id,
  name: p.name,
  description: p.description,
  rules: p.rules as unknown as CancellationRule[],
  isDefault: p.isDefault,
  isActive: p.isActive,
});

export const toSettingsDto = (s: PlatformSettings): PlatformSettingsDto => ({
  defaultCommissionPct: s.defaultCommissionPct.toNumber(),
  holdMinutes: s.holdMinutes,
  entryGraceMinutes: s.entryGraceMinutes,
  fewLeftThreshold: s.fewLeftThreshold,
  exitGraceMinutes: s.exitGraceMinutes,
  noShowReleaseMinutes: s.noShowReleaseMinutes,
  updatedAt: s.updatedAt.toISOString(),
});

/** Columns returned for vehicle types and categories (no timestamps). */
export const vehicleTypeSelect = { id: true, code: true, name: true, icon: true, sortOrder: true, isActive: true } as const;
export const categorySelect = { id: true, name: true, icon: true, sortOrder: true, isActive: true } as const;
export const masterOrder = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];

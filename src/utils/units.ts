import type { WeightUnit, LengthUnit } from '../types';

export const KG_TO_LB = 2.2046226218;
export const IN_TO_CM = 2.54;

/**
 * Converts a user-entered weight value in `unit` into canonical kilograms (`weightKg`).
 * Preserves exact metric storage so toggling units never mutates or corrupts stored values.
 */
export function toCanonicalKg(val: number | string | null | undefined, unit: WeightUnit): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (!Number.isFinite(num) || num < 0) return null;
  if (unit === 'kg') return Math.round(num * 1000) / 1000;
  return Math.round((num / KG_TO_LB) * 1000) / 1000;
}

/**
 * Formats canonical kilograms into the user's active display unit (`kg` or `lb`).
 */
export function fromCanonicalKg(weightKg: number | null | undefined, targetUnit: WeightUnit): string {
  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg)) return '';
  if (targetUnit === 'kg') {
    const rounded = Math.round(weightKg * 100) / 100;
    return String(rounded);
  }
  const lb = weightKg * KG_TO_LB;
  const rounded = Math.round(lb * 10) / 10;
  return String(rounded);
}

export function fromCanonicalKgNum(weightKg: number | null | undefined, targetUnit: WeightUnit): number {
  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg)) return 0;
  if (targetUnit === 'kg') return Math.round(weightKg * 100) / 100;
  return Math.round(weightKg * KG_TO_LB * 10) / 10;
}

export function toCanonicalCm(val: number | string | null | undefined, unit: LengthUnit): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : parseFloat(String(val));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (unit === 'cm') return Math.round(num * 100) / 100;
  return Math.round(num * IN_TO_CM * 100) / 100;
}

export function fromCanonicalCm(lengthCm: number | null | undefined, targetUnit: LengthUnit): string {
  if (lengthCm === null || lengthCm === undefined || !Number.isFinite(lengthCm)) return '';
  if (targetUnit === 'cm') return String(Math.round(lengthCm * 10) / 10);
  return String(Math.round((lengthCm / IN_TO_CM) * 10) / 10);
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

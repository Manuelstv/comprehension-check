// Safe reads of untyped values: tool inputs, stored data, parsed JSON.

export type UnknownRecord = Record<string, unknown>

export const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null ? (value as UnknownRecord) : undefined

// The trimmed string, or undefined for anything else or a blank string.
export const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

export const finiteNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

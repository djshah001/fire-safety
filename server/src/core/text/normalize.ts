export function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
}

export function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLocaleLowerCase('en-IN');
  return normalized || null;
}

export function normalizePhone(value?: string | null) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

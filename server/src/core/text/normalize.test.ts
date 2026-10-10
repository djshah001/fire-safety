import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizeName, normalizePhone } from './normalize.js';

describe('CRM normalization', () => {
  it('normalizes names and email without inventing values', () => {
    expect(normalizeName('  Acme   Fire  ')).toBe('acme fire');
    expect(normalizeEmail(' Sales@Example.COM ')).toBe('sales@example.com');
    expect(normalizeEmail('')).toBeNull();
  });

  it('normalizes valid phone punctuation and rejects implausible lengths', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('020 1234 5678')).toBe('02012345678');
    expect(normalizePhone('123')).toBeNull();
  });
});

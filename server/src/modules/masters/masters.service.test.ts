import { describe, expect, it } from 'vitest';
import { normalizeSpecificationValues } from './masters.service.js';

describe('catalogue specification normalization', () => {
  it('preserves numeric-looking values as text for text definitions', () => {
    expect(normalizeSpecificationValues([
      { key: 'capacity', label: 'Capacity', valueType: 'text', isRequired: true },
    ], { capacity: 6 })).toEqual({ capacity: '6' });
  });

  it('normalizes form strings for typed number and boolean definitions', () => {
    expect(normalizeSpecificationValues([
      { key: 'diameter', label: 'Diameter', valueType: 'number', isRequired: true },
      { key: 'certified', label: 'Certified', valueType: 'boolean', isRequired: true },
    ], { diameter: '65', certified: 'true' })).toEqual({ diameter: 65, certified: true });
  });

  it('rejects invalid numeric values and unknown keys', () => {
    expect(() => normalizeSpecificationValues([
      { key: 'diameter', label: 'Diameter', valueType: 'number', isRequired: true },
    ], { diameter: 'wide' })).toThrow('Diameter must be a finite number.');
    expect(() => normalizeSpecificationValues([], { capacity: '6' })).toThrow('Unknown family specification keys: capacity.');
  });
});

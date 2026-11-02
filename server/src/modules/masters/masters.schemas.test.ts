import { describe, expect, it } from 'vitest';
import { itemCreateSchema, masterListQuerySchema, vendorCreateSchema } from './masters.schemas.js';

describe('master request validation', () => {
  it('normalizes codes and bounds server-side pagination', () => {
    expect(itemCreateSchema.parse({
      code: 'sd-001',
      name: 'Smoke detector',
      familyId: '00000000-0000-4000-8000-000000000004',
      categoryId: '00000000-0000-4000-8000-000000000001',
      unitId: '00000000-0000-4000-8000-000000000002',
      brandIds: ['00000000-0000-4000-8000-000000000003'],
    }).code).toBe('SD-001');
    expect(() => masterListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => masterListQuerySchema.parse({ sort: 'taxIdentifier' })).toThrow();
  });

  it('requires an operational vendor contact method', () => {
    expect(() => vendorCreateSchema.parse({
      code: 'VEN-001',
      displayName: 'Detector Supplies',
      primaryContact: { name: 'Nisha Patel' },
    })).toThrow();
  });
});

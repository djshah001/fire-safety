import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateQuotedLine } from '../modules/engineering/boq.calculation.js';
import { referenceProducts, referenceSource } from './demoCatalogue.js';

describe('BOQ reference demo catalogue', () => {
  it('retains every billable variant without importing headings or totals as products', () => {
    expect(referenceProducts).toHaveLength(39);
    expect(new Set(referenceProducts.map((product) => product.code)).size).toBe(39);
    expect(new Set(referenceProducts.map((product) => product.familyCode)).size).toBe(30);
    expect(new Set(referenceProducts.map((product) => product.section))).toEqual(new Set(['PUMP HOUSE EQUIPMENT', 'HYDRANT', 'FIRE APPLIANCES']));
    expect(referenceSource.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reconciles the full reference quantity/pricing example using decimal arithmetic', () => {
    const total = referenceProducts.reduce((sum, product) => sum.plus(calculateQuotedLine({
      quantity: product.quantity, supplyRate: product.supplyRate, labourRate: product.labourRate,
      miscellaneousRate: product.miscellaneousRate, markupPercent: '20',
    }).lineAmount), new Decimal(0));
    expect(total.toFixed(2)).toBe('941097.20');
    const pipe = referenceProducts.find((product) => product.code === 'DEMO-REF-R24')!;
    expect(calculateQuotedLine({ ...pipe, markupPercent: '20' }).lineAmount).toBe('39912.00');
  });

  it('keeps standards and services unbranded and makes missing-rate assumptions explicit', () => {
    expect(referenceProducts.find((product) => product.sourceRow === 22)?.brands).toEqual([]);
    const coreCutting = referenceProducts.filter((product) => product.familyCode === 'DEMO-REF-CORE-CUT');
    expect(coreCutting).toHaveLength(3);
    expect(coreCutting.every((product) => product.brands.length === 0 && product.supplyRate === '0'
      && product.demoAssumptions.some((note) => note.includes('labour-only')))).toBe(true);
    expect(referenceProducts.find((product) => product.sourceRow === 21)?.brands).toEqual(['C&S', 'SCHNEIDER', 'L&T']);
  });
});

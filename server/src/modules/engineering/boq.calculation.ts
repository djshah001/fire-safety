import { Decimal } from 'decimal.js';

export function calculateQuotedLine(input: { quantity: string; supplyRate: string; labourRate: string; miscellaneousRate: string; markupPercent: string }) {
  const supplyRate = new Decimal(input.supplyRate);
  const labourRate = new Decimal(input.labourRate);
  const miscellaneousRate = new Decimal(input.miscellaneousRate);
  const markupAmount = supplyRate.plus(labourRate).mul(input.markupPercent).div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const quotedUnitRate = supplyRate.plus(labourRate).plus(markupAmount).plus(miscellaneousRate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const lineAmount = new Decimal(input.quantity).mul(quotedUnitRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { markupAmount: markupAmount.toFixed(4), quotedUnitRate: quotedUnitRate.toFixed(4), lineAmount: lineAmount.toFixed(2) };
}

import ExcelJS from 'exceljs';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calculateQuotedLine } from './boq.calculation.js';
import { renderQuotationExcel } from './quotation.excel.js';
import type { PdfQuotation } from './quotation.template.js';

function fixture(percent = '20'): PdfQuotation {
  const calculation = calculateQuotedLine({ quantity: '24', supplyRate: '1045', labourRate: '320', miscellaneousRate: '25', markupPercent: percent });
  return {
    quotationNumber: 'TEST-QUO', revisionNumber: 1, customerName: 'Test customer', title: 'Fire system',
    currency: 'INR', validityDays: 7, exclusions: 'Editable exclusions', deliveryTerms: 'Editable delivery', paymentTerms: 'Editable payment',
    subtotal: calculation.lineAmount, lineDiscountTotal: '0', additionalDiscount: '0', taxLabel: null, taxAmount: '0', roundingAdjustment: '0', grandTotal: calculation.lineAmount,
    lines: [{ section: 'Pump house', lineNumber: 1, itemCode: 'ITEM-1', itemName: 'GI pipe', specification: 'Complete pipe scope\nHead: 70 m', brandName: 'Test make', quantity: '24', unitSymbol: 'm',
      unitRate: calculation.quotedUnitRate, supplyRate: '1045', labourRate: '320', miscellaneousRate: '25', markupPercent: percent, markupAmount: calculation.markupAmount,
      quotedUnitRate: calculation.quotedUnitRate, discountAmount: '0', lineTotal: calculation.lineAmount }],
  };
}
async function load(input: PdfQuotation) {
  const bytes = await renderQuotationExcel(input), workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return workbook;
}

describe('reference quotation Excel export', () => {
  it.each([['0', 0, 1390, 33360], ['10', 136.5, 1526.5, 36636], ['20', 273, 1663, 39912]])('retains the 11-column layout and dynamic %s%% markup formulas', async (percentage, markup, rate, amount) => {
    const workbook = await load(fixture(String(percentage))), sheet = workbook.getWorksheet('Quotation')!;
    expect(sheet.actualColumnCount).toBe(11);
    expect(sheet.getCell('F5').value).toBe('Supply');
    expect(sheet.getCell('G5').value).toBe('Installation');
    expect(sheet.getCell('I5').value).toBe('Miscellaneous');
    expect(sheet.getCell('J5').value).toBe('Rate');
    expect(sheet.getCell('K5').value).toBe('Amount');
    expect(sheet.getCell('E7').value).toBe(24);
    expect(sheet.getCell('F7').value).toBe(1045);
    expect(sheet.getCell('H7').formula).toBe("ROUND((F7+G7)*INDEX('Markup inputs'!$C$2:$C$2,MATCH(A7,'Markup inputs'!$A$2:$A$2,0))/100,4)");
    // ExcelJS's value-object getter omits a zero result; its result accessor retains it.
    expect(sheet.getCell('H7').result).toBe(markup);
    expect(sheet.getCell('J7').value).toEqual({ formula: 'ROUND(F7+G7+H7+I7,4)', result: rate });
    expect(sheet.getCell('K7').value).toEqual({ formula: "ROUND(E7*J7,2)-INDEX('Markup inputs'!$D$2:$D$2,MATCH(A7,'Markup inputs'!$A$2:$A$2,0))", result: amount });
    expect(workbook.getWorksheet('Markup inputs')!.getCell('C2').value).toBe(Number(percentage));
    expect(sheet.getCell('H5').result).toBe(`${percentage}%`);
    expect(sheet.pageSetup.orientation).toBe('portrait');
    expect(sheet.pageSetup.fitToHeight).toBe(0);
    expect(sheet.getCell('B8').value).toBe('Head: 70 m');
  });

  it('preserves sections, separate make selections, input percentages and exact totals', async () => {
    const input = fixture(), second = fixture('10').lines[0]!;
    input.lines.push({ ...second, lineNumber: 2, section: 'Hydrant', brandName: 'Alternate make' });
    input.subtotal = input.grandTotal = new Decimal(input.lines[0]!.lineTotal).plus(second.lineTotal).toFixed(2);
    const workbook = await load(input), sheet = workbook.getWorksheet('Quotation')!;
    expect(sheet.getCell('H5').result).toBe('Markup');
    const values: string[] = []; sheet.eachRow((row) => row.eachCell((cell) => values.push(String(cell.text))));
    expect(values).toContain('PUMP HOUSE');
    expect(values).toContain('HYDRANT');
    expect(values).toContain('Alternate make');
    expect(values).toContain('Editable exclusions');
    expect(values).toContain('Editable delivery');
    expect(values).toContain('Editable payment');
    expect(workbook.getWorksheet('Markup inputs')!.getCell('C3').value).toBe(10);
    const grand = sheet.getColumn(1).values.findIndex((value) => value === 'GRAND TOTAL (INR)');
    expect(sheet.getCell(grand, 11).result).toBe(76548);
  });

  it('merges a common scope/make without dropping variant quantities or billing a heading', async () => {
    const input = fixture(), scope = 'Supply, installation and commissioning of GI B-Class pipeline complete with fittings.';
    input.lines = [
      { ...input.lines[0]!, itemName: 'GI pipe 100 mm', specification: scope + '\nNominal diameter: 100 mm' },
      { ...input.lines[0]!, lineNumber: 2, itemName: 'GI pipe 80 mm', specification: scope + '\nNominal diameter: 80 mm' },
    ];
    input.subtotal = input.grandTotal = '79824';
    const workbook = await load(input), sheet = workbook.getWorksheet('Quotation')!;
    expect(sheet.getCell('B7').text).toContain(scope);
    expect(sheet.getCell('E7').value).toBeNull();
    expect(sheet.getCell('B8').value).toBe('Nominal diameter: 100 mm');
    expect(sheet.getCell('B9').value).toBe('Nominal diameter: 80 mm');
    expect(sheet.getCell('C7').isMerged).toBe(true);
    expect(sheet.getCell('E8').value).toBe(24);
    expect(sheet.getCell('E9').value).toBe(24);
    expect(sheet.getCell('K10').result).toBe(79824);
  });

  it('rejects values Excel cannot accurately store and keeps text as literal text', async () => {
    const input = fixture();
    input.lines[0]!.supplyRate = '9999999999999999.99';
    await expect(renderQuotationExcel(input)).rejects.toMatchObject({ code: 'EXCEL_PRECISION_LIMIT' });
    input.lines[0]!.supplyRate = '1045'; input.lines[0]!.itemName = '=HYPERLINK("https://example.test")';
    const sheet = (await load(input)).getWorksheet('Quotation')!;
    expect(sheet.getCell('B7').type).toBe(ExcelJS.ValueType.String);
  });
});

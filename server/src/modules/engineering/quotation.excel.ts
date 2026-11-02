import ExcelJS from 'exceljs';
import { Decimal } from 'decimal.js';
import { AppError } from '../../core/errors/appError.js';
import { describeQuotationLine, groupQuotationLines, quotationTerms } from './quotation.layout.js';
import type { PdfQuotation } from './quotation.template.js';

// Excel stores 15 significant digits. Never silently export an already-rounded price.
function numeric(value: string) {
  const decimal = new Decimal(value);
  const significant = decimal.toString().replace(/[-.]/g, '').replace(/^0+/, '').replace(/0+$/, '').length;
  const number = Number(value);
  if (!Number.isFinite(number) || significant > 15 || !new Decimal(number.toString()).eq(decimal)) {
    throw new AppError('EXCEL_PRECISION_LIMIT', 'A value exceeds Excel numeric precision. Use the PDF export for exact values.', 422);
  }
  return number;
}

const border: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF111111' } }, bottom: { style: 'thin', color: { argb: 'FF111111' } },
  left: { style: 'thin', color: { argb: 'FF111111' } }, right: { style: 'thin', color: { argb: 'FF111111' } },
};
const fill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE87808' } };

export async function renderQuotationExcel(quotation: PdfQuotation) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fire Safety'; workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Quotation', {
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    views: [{ state: 'frozen', ySplit: 5, xSplit: 2, showGridLines: false }],
  });
  const inputs = workbook.addWorksheet('Markup inputs', { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  inputs.columns = [{ header: 'Line', width: 8 }, { header: 'Item / size', width: 48 }, { header: 'Markup (%)', width: 16 }, { header: 'Line discount', width: 18 }];
  inputs.getRow(1).font = { name: 'Arial', size: 10, bold: true };
  inputs.getRow(1).height = 24;
  for (const [index, line] of quotation.lines.entries()) {
    const row = index + 2;
    inputs.getRow(row).values = [line.lineNumber, line.itemName, numeric(line.markupPercent), numeric(line.discountAmount)];
    inputs.getRow(row).font = { name: 'Arial', size: 10 };
    inputs.getRow(row).height = 22;
    inputs.getRow(row).alignment = { vertical: 'middle', wrapText: true };
    inputs.getCell(row, 3).numFmt = 'General';
    inputs.getCell(row, 4).numFmt = '#,##0.00';
    for (const col of [3, 4]) inputs.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0C2' } };
    inputs.getCell(row, 3).dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 1000], allowBlank: false, showErrorMessage: true, errorTitle: 'Invalid markup', error: 'Enter a percentage from 0 to 1000.' };
  }
  if (quotation.lines.length) inputs.autoFilter = { from: 'A1', to: `D${quotation.lines.length + 1}` };
  sheet.columns = [3.5, 50, 10, 5, 5.5, 9, 10, 8, 10, 9, 12].map((width) => ({ width }));
  sheet.mergeCells('A1:K1'); sheet.getCell('A1').value = quotation.preview ? 'PREVIEW - NOT ISSUED' : 'DEMO / NOT FOR PRODUCTION';
  sheet.getCell('A1').font = { name: 'Arial', size: 9, color: { argb: 'FF963B14' }, bold: true }; sheet.getRow(1).height = 18;
  sheet.mergeCells('A2:E2'); sheet.getCell('A2').value = `Quotation ${quotation.quotationNumber} / R${quotation.revisionNumber}`;
  sheet.mergeCells('F2:K2'); sheet.getCell('F2').value = `Customer: ${quotation.customerName}`;
  sheet.getRow(2).font = { name: 'Arial', size: 9, bold: true }; sheet.getRow(2).height = 24;
  sheet.mergeCells('A3:K3'); sheet.getCell('A3').value = quotation.title;
  sheet.getRow(3).height = 30; sheet.getRow(3).font = { name: 'Arial', size: 9, bold: true };
  sheet.mergeCells('A4:K4'); sheet.getCell('A4').value = `Currency: ${quotation.currency}. All component rates and markup amounts are per unit. Percentages and line discounts are editable on Markup inputs.`;
  sheet.getRow(4).height = 25; sheet.getRow(4).font = { name: 'Arial', size: 8 };
  for (const row of [2, 3, 4]) sheet.getRow(row).alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(5).values = ['Sr. No.', 'DESCRIPTION', 'MAKE / MODEL', 'UNIT', 'Qty.', 'Supply', 'Installation', 'Markup', 'Miscellaneous', 'Rate', 'Amount'];
  if (quotation.lines.length) {
    const last = quotation.lines.length + 1;
    const values = quotation.lines.map((line) => new Decimal(line.markupPercent));
    const uniform = values.every((value) => value.eq(values[0]!));
    sheet.getCell('H5').value = { formula: `IF(MIN('Markup inputs'!C2:C${last})=MAX('Markup inputs'!C2:C${last}),MIN('Markup inputs'!C2:C${last})&"%","Markup")`, result: uniform ? `${values[0]!.toString()}%` : 'Markup' };
    sheet.getCell('H5').numFmt = 'General';
  }
  sheet.getRow(5).height = 27;
  sheet.getRow(5).font = { name: 'Arial', size: 8, bold: true };
  sheet.getRow(5).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  for (let col = 1; col <= 11; col++) sheet.getCell(5, col).border = border;

  function styleRow(row: number, height: number) {
    sheet.getRow(row).height = height;
    for (let col = 1; col <= 11; col++) {
      const cell = sheet.getCell(row, col);
      cell.font = { name: 'Arial', size: 8 };
      cell.border = border; cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'left' : col >= 5 ? 'right' : 'center', wrapText: true };
      if (col >= 6 && col <= 10) cell.numFmt = 'General';
      if (col === 11) cell.numFmt = '#,##0.00';
      if (col === 5) cell.numFmt = 'General';
    }
  }
  function textHeight(text: string, chars: number, minimum = 16) {
    return Math.max(minimum, text.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil(paragraph.length / chars)), 0) * 10 + 5);
  }
  let rowNumber = 6, section = '', sectionIndex = 0, sectionStart = 0, sectionTotal = new Decimal(0);
  const inputEnd = quotation.lines.length + 1;
  const inputValue = (column: 'C' | 'D', row: number) => `INDEX('Markup inputs'!$${column}$2:$${column}$${inputEnd},MATCH(A${row},'Markup inputs'!$A$2:$A$${inputEnd},0))`;
  const sectionTotals: string[] = [];
  function finishSection() {
    if (!section) return;
    styleRow(rowNumber, 20); sheet.mergeCells(rowNumber, 1, rowNumber, 10);
    sheet.getCell(rowNumber, 1).value = `TOTAL OF ${section}`;
    sheet.getCell(rowNumber, 1).alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.getCell(rowNumber, 11).value = { formula: `SUMIFS(K${sectionStart}:K${rowNumber - 1},A${sectionStart}:A${rowNumber - 1},">0")`, result: numeric(sectionTotal.toString()) };
    sheet.getRow(rowNumber).font = { name: 'Arial', size: 8, bold: true };
    sectionTotals.push(`K${rowNumber}`); rowNumber++;
  }
  for (const group of groupQuotationLines(quotation.lines)) {
    if (group.section !== section) {
      finishSection(); section = group.section; sectionTotal = new Decimal(0);
      styleRow(rowNumber, 18); sheet.getCell(rowNumber, 1).value = String.fromCharCode(65 + sectionIndex++ % 26);
      sheet.mergeCells(rowNumber, 2, rowNumber, 11); sheet.getCell(rowNumber, 2).value = section.toUpperCase();
      sheet.getRow(rowNumber).fill = fill; sheet.getRow(rowNumber).font = { name: 'Arial', size: 9, bold: true };
      sheet.getCell(rowNumber, 2).alignment = { horizontal: 'center', vertical: 'middle' };
      rowNumber++; sectionStart = rowNumber;
    }
    const shared = group.lines.length > 1;
    const groupHeader = rowNumber;
    const mergedMake = shared && group.lines.every((line) => line.brandName === group.lines[0]!.brandName);
    if (shared) {
      const text = [group.family, group.scope, ...group.commonFields].join('\n');
      styleRow(rowNumber, textHeight(text, 65)); sheet.getCell(rowNumber, 2).value = text; rowNumber++;
    }
    for (const line of group.lines) {
      const description = describeQuotationLine(line);
      const fields = description.fields.filter((field) => !group.commonFields.includes(field));
      const body = shared ? fields.join('\n') || line.itemName : [line.itemName, description.scope].filter(Boolean).join('\n');
      const start = rowNumber;
      const make = (line.brandName ?? 'Unbranded').replaceAll(' · ', '\n');
      styleRow(rowNumber, Math.max(textHeight(body, 65), mergedMake ? 16 : textHeight(make, 14)));
      sheet.getCell(rowNumber, 2).value = body;
      if (!shared) for (const field of fields) {
        rowNumber++; styleRow(rowNumber, textHeight(field, 65));
        sheet.getCell(rowNumber, 2).value = field;
        sheet.getCell(rowNumber, 2).font = { name: 'Arial', size: 8, bold: true };
      }
      for (const col of [1, ...(!mergedMake ? [3] : []), 4, 5, 6, 7, 8, 9, 10, 11]) {
        if (start !== rowNumber) sheet.mergeCells(start, col, rowNumber, col);
      }
      sheet.getCell(start, 1).value = line.lineNumber;
      if (!mergedMake) sheet.getCell(start, 3).value = make;
      sheet.getCell(start, 4).value = line.unitSymbol;
      sheet.getCell(start, 5).value = numeric(line.quantity);
      sheet.getCell(start, 6).value = numeric(line.supplyRate);
      sheet.getCell(start, 7).value = numeric(line.labourRate);
      sheet.getCell(start, 8).value = { formula: `ROUND((F${start}+G${start})*${inputValue('C', start)}/100,4)`, result: numeric(line.markupAmount) };
      sheet.getCell(start, 9).value = numeric(line.miscellaneousRate);
      sheet.getCell(start, 10).value = { formula: `ROUND(F${start}+G${start}+H${start}+I${start},4)`, result: numeric(line.quotedUnitRate) };
      sheet.getCell(start, 11).value = { formula: `ROUND(E${start}*J${start},2)-${inputValue('D', start)}`, result: numeric(line.lineTotal) };
      sectionTotal = sectionTotal.plus(line.lineTotal); rowNumber++;
    }
    if (mergedMake) {
      sheet.mergeCells(groupHeader, 3, rowNumber - 1, 3);
      sheet.getCell(groupHeader, 3).value = (group.lines[0]!.brandName ?? 'Unbranded').replaceAll(' · ', '\n');
    }
  }
  finishSection();
  const summaryStart = rowNumber;
  const lastInput = quotation.lines.length + 1;
  const discountFormula = quotation.lines.length ? `SUM('Markup inputs'!D2:D${lastInput})` : '0';
  const netFormula = sectionTotals.length ? `SUM(${sectionTotals.join(',')})` : '0';
  const summaries: Array<[string, string, ExcelJS.CellValue]> = [
    ['Subtotal', quotation.subtotal, { formula: `${netFormula}+${discountFormula}`, result: numeric(quotation.subtotal) }],
    ['Line discounts', quotation.lineDiscountTotal, { formula: discountFormula, result: numeric(quotation.lineDiscountTotal) }],
    ['Additional discount', quotation.additionalDiscount, numeric(quotation.additionalDiscount)],
    [quotation.taxLabel ?? 'Tax', quotation.taxAmount, numeric(quotation.taxAmount)],
    ['Rounding adjustment', quotation.roundingAdjustment, numeric(quotation.roundingAdjustment)],
    [`GRAND TOTAL (${quotation.currency})`, quotation.grandTotal, { formula: `K${summaryStart}-K${summaryStart + 1}-K${summaryStart + 2}+K${summaryStart + 3}+K${summaryStart + 4}`, result: numeric(quotation.grandTotal) }],
  ];
  for (const [label, , value] of summaries) {
    styleRow(rowNumber, 21); sheet.mergeCells(rowNumber, 1, rowNumber, 10); sheet.getCell(rowNumber, 1).value = label;
    sheet.getCell(rowNumber, 1).alignment = { horizontal: 'right', vertical: 'middle' }; sheet.getCell(rowNumber, 11).value = value;
    if (label.startsWith('GRAND TOTAL')) { sheet.getRow(rowNumber).font = { name: 'Arial', size: 9, bold: true }; sheet.getRow(rowNumber).fill = fill; }
    rowNumber++;
  }
  const { terms, inlinePayment } = quotationTerms(quotation.exclusions, quotation.paymentTerms);
  for (const [label, text] of [
    ['Terms and conditions / exclusions', terms], ['Delivery terms', quotation.deliveryTerms], ...(!inlinePayment ? [['Payment terms', quotation.paymentTerms]] : []),
    ['Bank details', quotation.details?.bankDetails ?? ''], ['Authorized signatory', quotation.details?.signatory ?? ''],
  ]) {
    if (!text) continue;
    rowNumber++; sheet.mergeCells(rowNumber, 1, rowNumber, 11); sheet.getCell(rowNumber, 1).value = label!;
    sheet.getRow(rowNumber).font = { name: 'Arial', size: 9, bold: true }; sheet.getRow(rowNumber).height = 22; rowNumber++;
    for (const paragraph of text.split('\n').filter(Boolean)) {
      sheet.mergeCells(rowNumber, 1, rowNumber, 11); sheet.getCell(rowNumber, 1).value = paragraph;
      sheet.getRow(rowNumber).font = { name: 'Arial', size: 8 }; sheet.getRow(rowNumber).height = textHeight(paragraph, 150);
      sheet.getRow(rowNumber).alignment = { vertical: 'middle', wrapText: true }; rowNumber++;
    }
  }
  sheet.pageSetup.printArea = `A1:K${rowNumber - 1}`; sheet.pageSetup.printTitlesRow = '5:5';
  sheet.pageSetup.margins = { left: 0.2, right: 0.2, top: 0.3, bottom: 0.4, header: 0.1, footer: 0.2 };
  sheet.headerFooter.oddFooter = '&CPage &P of &N';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

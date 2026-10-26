type PdfQuotation = {
  quotationNumber: string;
  revisionNumber: number;
  customerName: string;
  title: string;
  currency: string;
  validityDays: number;
  exclusions: string;
  deliveryTerms: string;
  paymentTerms: string;
  subtotal: string;
  lineDiscountTotal: string;
  additionalDiscount: string;
  taxLabel: string | null;
  taxAmount: string;
  roundingAdjustment: string;
  grandTotal: string;
  lines: Array<{
    lineNumber: number;
    itemCode: string;
    itemName: string;
    specification: string;
    brandName: string;
    quantity: string;
    unitSymbol: string;
    unitRate: string;
    discountAmount: string;
    lineTotal: string;
  }>;
};

function ascii(value: string) {
  return value.replace(/[^\x20-\x7e]/g, '?');
}

function wrap(value: string, width = 94) {
  const words = ascii(value).replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function escapePdf(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function renderDemoQuotationPdf(quotation: PdfQuotation) {
  const content: string[] = [
    'DEMO / NOT FOR PRODUCTION',
    'Tax, rounding, numbering and company template settings require confirmation.',
    '',
    `Quotation: ${quotation.quotationNumber} / Revision ${quotation.revisionNumber}`,
    `Customer: ${quotation.customerName}`,
    `Title: ${quotation.title}`,
    `Currency: ${quotation.currency} | Validity: ${quotation.validityDays} days from recorded issue`,
    '',
    'SCOPE AND PRICING',
  ];
  for (const line of quotation.lines) {
    content.push(...wrap(`${line.lineNumber}. ${line.itemCode} - ${line.itemName} | Make: ${line.brandName} | ${line.quantity} ${line.unitSymbol} x ${quotation.currency} ${line.unitRate} | discount ${line.discountAmount} | total ${line.lineTotal}`));
    content.push(...wrap(`   ${line.specification}`));
  }
  content.push(
    '',
    `Subtotal: ${quotation.currency} ${quotation.subtotal}`,
    `Line discounts: ${quotation.currency} ${quotation.lineDiscountTotal}`,
    `Additional discount: ${quotation.currency} ${quotation.additionalDiscount}`,
    `${quotation.taxLabel ?? 'Tax (not configured)'}: ${quotation.currency} ${quotation.taxAmount}`,
    `Rounding adjustment: ${quotation.currency} ${quotation.roundingAdjustment}`,
    `GRAND TOTAL: ${quotation.currency} ${quotation.grandTotal}`,
    '',
    'EXCLUSIONS',
    ...wrap(quotation.exclusions),
    '',
    'DELIVERY TERMS',
    ...wrap(quotation.deliveryTerms),
    '',
    'PAYMENT TERMS',
    ...wrap(quotation.paymentTerms),
    '',
    'This generated PDF is a preserved demo snapshot and is not an official commercial document.',
  );

  const pages: string[][] = [];
  for (let index = 0; index < content.length; index += 50) pages.push(content.slice(index, index + 50));
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index]!;
    const contentId = pageId + 1;
    const streamLines = pageLines.map((line) => `(${escapePdf(line)}) Tj 0 -14 Td`).join('\n');
    const stream = `BT /F1 9 Tf 40 800 Td\n${streamLines}\nET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`;
  });

  let output = '%PDF-1.4\n%FSDEMO\n';
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, 'ascii');
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'ascii');
}

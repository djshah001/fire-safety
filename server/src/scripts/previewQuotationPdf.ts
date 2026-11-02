import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Decimal } from 'decimal.js';
import { referenceProducts, referenceSpecification } from './demoCatalogue.js';
import { calculateQuotedLine } from '../modules/engineering/boq.calculation.js';
import { renderDemoQuotationPdf } from '../modules/engineering/quotation.pdf.js';
import { renderQuotationExcel } from '../modules/engineering/quotation.excel.js';
import type { PdfQuotation } from '../modules/engineering/quotation.template.js';
import { quotationDefaults } from '../modules/engineering/quotation.defaults.js';
import { closePdfBrowser } from '../infrastructure/documents/pdfBrowser.js';

const technical = process.argv.includes('--technical'), stress = process.argv.includes('--stress'), excel = process.argv.includes('--excel');
const outputIndex = process.argv.indexOf('--output');
const outputPath = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1]! : excel ? '../output/xlsx/quotation-reference-preview.xlsx' : '../output/pdf/quotation-reference-preview.pdf');
const lines = referenceProducts.map((product, index) => {
  const calculation = calculateQuotedLine({ ...product, markupPercent: '20' });
  return { section: product.section, lineNumber: index + 1, itemCode: product.code, itemName: product.name,
    specification: referenceSpecification(product),
    brandName: product.brands[0] ?? null, quantity: product.quantity,
    unitSymbol: product.unitCode === 'DEMO-MTR' ? 'Mtrs' : product.unitCode === 'DEMO-KG' ? 'kg' : product.unitCode === 'DEMO-LOT' ? 'Lot' : 'Nos',
    unitRate: calculation.quotedUnitRate, supplyRate: product.supplyRate, labourRate: product.labourRate,
    miscellaneousRate: product.miscellaneousRate, markupPercent: '20', markupAmount: calculation.markupAmount,
    quotedUnitRate: calculation.quotedUnitRate, discountAmount: '0', lineTotal: calculation.lineAmount };
});
if (stress) lines[0]!.specification += '\n' + 'VeryLongUnbrokenSpecification'.repeat(130);
const total = lines.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0)).toFixed(2);
try {
  const document: PdfQuotation = {
    quotationNumber: 'DEMO-QUO-2026-000001', revisionNumber: 1, customerName: 'Demo Courtyard Enclave',
    title: 'Supply and installation of fire hydrant line, fire alarm system, sprinklers, fire extinguishers and accessories',
    currency: 'INR', preview: true, showPrices: !technical,
    ...quotationDefaults, subtotal: total, lineDiscountTotal: '0', additionalDiscount: '0', taxLabel: null,
    taxAmount: '0', roundingAdjustment: '0', grandTotal: total,
    details: { senderName: 'FIRE RELIEF SERVICES', senderTagline: 'All Types of Industrial Fire Safety Service',
      senderAddress: 'Demonstration letterhead - replace with your verified company address', senderContact: 'Demo contact information',
      recipientAddress: 'Vadodara, Gujarat - demonstration site', recipientContact: 'Demo site contact', recipientPhone: 'Demo phone',
      documentDate: '2026-10-31', bankDetails: 'Demo only. Use verified bank details in the quotation document settings.',
      signatory: 'Demo authorized signatory' }, lines };
  const bytes = excel ? await renderQuotationExcel(document) : await renderDemoQuotationPdf(document);
  await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, bytes);
  process.stdout.write(`Quotation preview saved: ${outputPath}\n`);
} finally { await closePdfBrowser(); }

import { describe, expect, it } from 'vitest';
import { buildQuotationHtml, quotationFooter, type PdfQuotation } from './quotation.template.js';

const fixture = (): PdfQuotation => ({
  quotationNumber: 'TEST-QUO', revisionNumber: 1, customerName: 'Test customer', title: 'Fire system',
  currency: 'INR', validityDays: 7, exclusions: 'Editable exclusions', deliveryTerms: 'Editable delivery', paymentTerms: 'Editable payment',
  subtotal: '123456.78', lineDiscountTotal: '0', additionalDiscount: '0', taxLabel: null, taxAmount: '0', roundingAdjustment: '0', grandTotal: '123456.78',
  lines: [{ section: 'Pump house', lineNumber: 1, itemCode: 'ITEM-1', itemName: 'Detector', specification: 'Addressable detector\nHead: 70 m', brandName: 'Test make', quantity: '24', unitSymbol: 'Nos', unitRate: '1663', supplyRate: '1045', labourRate: '320', miscellaneousRate: '25', markupPercent: '20', markupAmount: '273', quotedUnitRate: '1663', discountAmount: '0', lineTotal: '39912' }],
});

describe('quotation print template', () => {
  it('renders the reference letterhead, editable details and preview label', () => {
    const output = buildQuotationHtml({ ...fixture(), preview: true, details: { senderName: 'Test Fire Services', senderTagline: 'Industrial fire safety', senderAddress: 'Test office', recipientAddress: 'Customer site', recipientContact: 'Customer contact', recipientPhone: '1234567890', bankDetails: 'Test bank details', signatory: 'Test signatory', documentDate: '2026-10-31' } });
    for (const value of ['PREVIEW - NOT ISSUED', 'Test Fire Services', 'Industrial fire safety', 'Customer site', 'Customer contact', '1234567890', 'Test bank details', 'Test signatory', '<th>Supply</th>', '<th>Installation</th>', '<th>20%</th>', '<th>Miscellaneous</th>', 'Head: 70 m', 'TOTAL OF Pump house', '39,912.00', '>1663<', '>1045<', '>273<']) expect(output).toContain(value);
    expect(output).not.toContain('class="breakdown"');
    expect(quotationFooter(fixture())).toContain('class="pageNumber"');
    expect(quotationFooter(fixture())).toContain('class="totalPages"');
  });

  it('redacts all commercial content from technical exports', () => {
    const output = buildQuotationHtml({ ...fixture(), showPrices: false, details: { bankDetails: 'PRIVATE BANK', signatory: 'PRIVATE SIGNATORY' } });
    for (const value of ['1045', '1,045', '1663', '1,663', '39,912', '123,456', 'PRIVATE BANK', 'PRIVATE SIGNATORY', 'Editable payment', 'Editable delivery', 'Editable exclusions', 'SITC RATE', 'Markup 20']) expect(output).not.toContain(value);
    expect(output).toContain('Addressable detector');
    expect(output).toContain('commercial values restricted');
    for (const header of ['<th>Supply</th>', '<th>Installation</th>', '<th>Miscellaneous</th>', '<th>Amount</th>']) expect(output).not.toContain(header);
  });

  it('escapes every supplied value and refuses remote or active logos', () => {
    const input = fixture();
    input.details = { senderName: '<script>alert(1)</script>', recipientContact: '<img src="http://127.0.0.1/private">' };
    input.lines[0]!.specification = '<iframe src="file:///private"></iframe>';
    const output = buildQuotationHtml(input, 'https://example.test/logo.png');
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('<iframe');
    expect(output).not.toContain('<img');
    expect(output).toContain('&lt;script&gt;');
    expect(output).toContain("default-src 'none'");
  });

  it('splits oversized descriptions without duplicating quantity, rate or amount', () => {
    const input = fixture();
    const longText = 'LongSpecification'.repeat(220);
    input.lines[0]!.specification = longText + '\nHead: 70 m';
    const output = buildQuotationHtml(input);
    expect(output.match(/class="item-row"/g)!.length).toBeGreaterThan(3);
    expect(output.match(/39,912.00/g)).toHaveLength(2); // one billable line plus section total
    expect(output.match(/>1045</g)).toHaveLength(1);
    expect(output).toContain('cont.');
    expect(output).toContain('<div class="specification">Head: 70 m</div>');
    const joined = [...output.matchAll(/<td class="description">([\s\S]*?)<\/td>/g)].map((match) => match[1]!
      .replace(/<strong>[\s\S]*?<\/strong>/, '').replace(/<div class="breakdown">[\s\S]*?<\/div>/, '')
      .replace(/<[^>]+>/g, '').trim()).join('');
    expect(joined).toBe(longText + 'Head: 70 m');
  });

  it('groups common scope without losing the selected make per size', () => {
    const input = fixture();
    const scope = 'Supply, installation and commissioning of GI B-Class pipeline complete with fittings.';
    input.lines = [
      { ...input.lines[0]!, itemName: 'GI B-Class pipe 100 mm', specification: scope + '\nNominal diameter: 100 mm', brandName: 'Apollo model A' },
      { ...input.lines[0]!, lineNumber: 2, itemName: 'GI B-Class pipe 80 mm', specification: scope + '\nNominal diameter: 80 mm', brandName: 'Asian model B' },
    ];
    const output = buildQuotationHtml(input);
    expect(output.match(/class="family-scope"/g)).toHaveLength(1);
    expect(output).toContain('Nominal diameter: 100 mm');
    expect(output).toContain('Nominal diameter: 80 mm');
    expect(output).toContain('Apollo model A');
    expect(output).toContain('Asian model B');
    expect(output.match(/Supply, installation and commissioning/g)).toHaveLength(1);
  });

  it('labels mixed markup percentages individually instead of claiming one uniform percentage', () => {
    const input = fixture();
    input.lines.push({ ...input.lines[0]!, lineNumber: 2, markupPercent: '10', markupAmount: '136.5', quotedUnitRate: '1526.5', lineTotal: '36636' });
    const output = buildQuotationHtml(input);
    expect(output).toContain('<th>Markup</th>');
    expect(output).toContain('<small>20%</small>');
    expect(output).toContain('<small>10%</small>');
    expect(output).toContain('136.5');
  });

  it('preserves exact large monetary strings and editable numbered payment wording', () => {
    const input = fixture();
    input.grandTotal = '9999999999999999.99';
    input.exclusions = '1. GST extra\n8. NOC Charges: Separate';
    input.paymentTerms = '7. Payment Terms: Agreed milestones';
    const output = buildQuotationHtml(input);
    expect(output).toContain('9,99,99,99,99,99,99,999.99');
    expect(output.indexOf('7. Payment Terms:')).toBeLessThan(output.indexOf('8. NOC Charges:'));
    expect(output.match(/7. Payment Terms:/g)).toHaveLength(1);
  });
});

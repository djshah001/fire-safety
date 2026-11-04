import { Decimal } from "decimal.js";
import type { CommercialDocumentDetails } from "../../core/documents/commercialDocument.js";
import {
  describeQuotationLine,
  groupQuotationLines,
  markupHeading,
  quotationTerms,
} from "./quotation.layout.js";

export type PdfQuotation = {
  details?: CommercialDocumentDetails;
  preview?: boolean;
  documentTitle?: string;
  showPrices?: boolean;
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
    section?: string;
    lineNumber: number;
    itemCode: string;
    itemName: string;
    specification: string;
    brandName: string | null;
    quantity: string;
    unitSymbol: string;
    unitRate: string;
    supplyRate: string;
    labourRate: string;
    miscellaneousRate: string;
    markupPercent: string;
    markupAmount: string;
    quotedUnitRate: string;
    discountAmount: string;
    lineTotal: string;
  }>;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function money(value: string, precision = 2) {
  const [whole, fraction] = new Decimal(value)
    .toFixed(precision, Decimal.ROUND_HALF_UP)
    .split(".");
  const sign = whole!.startsWith("-") ? "-" : "";
  const digits = whole!.replace("-", "");
  const prefix =
    digits.length > 3
      ? `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},`
      : "";
  let decimals = fraction ?? "";
  while (decimals.length > 2 && decimals.endsWith("0"))
    decimals = decimals.slice(0, -1);
  return `${sign}${prefix}${digits.slice(-3)}${decimals ? `.${decimals}` : ""}`;
}

// Bound rows so a single huge paragraph/unbroken specification cannot exceed a page.
function chunks(text: string, maximum = 1_000) {
  const output: string[] = [];
  let current = "";
  for (const paragraph of text.trim().split("\n")) {
    const fragments: string[] = [];
    let remaining = paragraph;
    while (remaining.length > maximum) {
      const space = remaining.lastIndexOf(" ", maximum);
      const end = space > maximum / 2 ? space : maximum;
      fragments.push(remaining.slice(0, end));
      remaining = remaining.slice(end).trimStart();
    }
    fragments.push(remaining);
    for (const fragment of fragments) {
      if (current && current.length + fragment.length + 1 > maximum) {
        output.push(current);
        current = "";
      }
      current = current ? `${current}\n${fragment}` : fragment;
    }
  }
  if (current || !output.length) output.push(current);
  return output;
}

function component(value: string) {
  return new Decimal(value).toDecimalPlaces(4).toString();
}

function itemRows(
  line: PdfQuotation["lines"][number],
  priced: boolean,
  options: {
    sharedScope?: boolean;
    commonFields?: string[];
    omitMake?: boolean;
    mixedMarkup?: boolean;
  } = {},
) {
  const parsed = describeQuotationLine(line);
  const text = [
    ...(!options.sharedScope ? [parsed.scope] : []),
    ...parsed.fields.filter((field) => !options.commonFields?.includes(field)),
  ]
    .filter(Boolean)
    .join("\n");
  return chunks(text)
    .map((fragment, index) => {
      const content = fragment
        .split("\n")
        .filter(Boolean)
        .map((part) =>
          parsed.fields.includes(part)
            ? `<div class="specification">${escapeHtml(part)}</div>`
            : `<p>${escapeHtml(part)}</p>`,
        )
        .join("");
      return `<tr class="item-row"><td class="serial">${line.lineNumber}${index ? "<br><small>cont.</small>" : ""}</td>
      <td class="description">${index ? "<strong>Continued description</strong>" : !options.sharedScope ? `<strong>${escapeHtml(line.itemName)}</strong>` : ""}${content}</td>
      ${options.omitMake ? "" : `<td class="make">${!index ? escapeHtml(line.brandName ?? "Unbranded").replaceAll(" · ", "<br>") : ""}</td>`}
      <td class="unit">${!index ? escapeHtml(line.unitSymbol) : ""}</td>
      <td class="number">${!index ? escapeHtml(new Decimal(line.quantity).toString()) : ""}</td>
      ${
        priced
          ? `<td class="number component">${!index ? component(line.supplyRate) : ""}</td><td class="number component">${!index ? component(line.labourRate) : ""}</td>
        <td class="number component">${!index ? `${options.mixedMarkup ? `<small>${escapeHtml(component(line.markupPercent))}%</small><br>` : ""}${component(line.markupAmount)}` : ""}</td>
        <td class="number component">${!index ? component(line.miscellaneousRate) : ""}</td><td class="number component">${!index ? component(line.quotedUnitRate) : ""}</td><td class="number amount">${!index ? money(line.lineTotal) : ""}</td>`
          : ""
      }</tr>`;
    })
    .join("");
}

function sectionRows(lines: PdfQuotation["lines"], priced: boolean) {
  let html = "",
    section = "",
    sectionIndex = 0,
    total = new Decimal(0);
  const mixedMarkup = priced && markupHeading(lines) === "Markup";
  const subtotal = () =>
    priced && section
      ? `<tbody><tr class="section-total"><td colspan="10">TOTAL OF ${escapeHtml(section)}</td><td class="number">${money(total.toString())}</td></tr></tbody>`
      : "";
  for (const group of groupQuotationLines(lines)) {
    const name = group.section;
    if (name !== section) {
      html += subtotal();
      section = name;
      total = new Decimal(0);
      html += `<tbody class="section-start"><tr class="section-heading"><td>${String.fromCharCode(65 + (sectionIndex++ % 26))}</td><td colspan="${priced ? 10 : 4}">${escapeHtml(section.toUpperCase())}</td></tr></tbody>`;
    }
    const compactGroup =
      group.lines.length > 1 &&
      group.lines.length <= 8 &&
      group.scope.length <= 800 &&
      group.lines.every(
        (line) => describeQuotationLine(line).fields.join("\n").length < 300,
      );
    const mergedMake =
      compactGroup &&
      group.lines.every((line) => line.brandName === group.lines[0]!.brandName);
    html += `<tbody${compactGroup ? ' class="variant-group"' : ""}>`;
    if (group.lines.length > 1) {
      for (const part of chunks(group.scope))
        html += `<tr class="family-scope"><td></td><td class="description"><strong>${escapeHtml(group.family)}</strong><p>${escapeHtml(part)}</p>${group.commonFields.map((field) => `<div class="specification">${escapeHtml(field)}</div>`).join("")}</td>
        <td class="make"${mergedMake ? ` rowspan="${group.lines.length + 1}"` : ""}>${mergedMake ? escapeHtml(group.lines[0]!.brandName ?? "Unbranded").replaceAll(" · ", "<br>") : ""}</td>${"<td></td>".repeat(priced ? 8 : 2)}</tr>`;
    }
    for (const entry of group.lines) {
      html += itemRows(entry, priced, {
        sharedScope: group.lines.length > 1,
        commonFields: group.commonFields,
        omitMake: mergedMake,
        mixedMarkup,
      });
      if (priced) total = total.plus(entry.lineTotal);
    }
    html += "</tbody>";
  }
  return html + subtotal();
}

function termBlocks(title: string, text: string) {
  if (!text.trim()) return "";
  return `<section class="terms"><h3>${escapeHtml(title)}</h3>${text
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((part) => chunks(part))
    .map((part) => `<p>${escapeHtml(part)}</p>`)
    .join("")}</section>`;
}

export function buildQuotationHtml(
  quotation: PdfQuotation,
  logoDataUrl?: string,
) {
  const priced = quotation.showPrices !== false,
    details = quotation.details ?? {};
  const { terms, inlinePayment } = quotationTerms(
    quotation.exclusions,
    quotation.paymentTerms,
  );
  const safeLogo =
    logoDataUrl &&
    /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logoDataUrl)
      ? logoDataUrl
      : undefined;
  const rows = (label: string, value: string, strong = false) =>
    `<tr${strong ? ' class="grand-total"' : ""}><th>${escapeHtml(label)}</th><td>${money(value)}</td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'">
    <title>${escapeHtml(quotation.quotationNumber)}</title><style>
      @page { size: A4 portrait; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; padding: 0 1px; color: #111; font: 8.2pt Arial, Helvetica, sans-serif; line-height: 1.3; }
      p { margin: 3px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
      .letterhead { border-bottom: 2px solid #171717; padding: 0 5px 7px; margin-bottom: 12px; text-align: center; }
      .brand { display: flex; align-items: center; justify-content: center; gap: 13px; min-height: 65px; border-bottom: 1px solid #c92728; padding: 1px 6px 8px; }
      .brand img { width: 73px; height: 65px; object-fit: contain; flex-shrink: 0; }
      .brand h1 { color: #b66a18; text-shadow: 1px 1px 0 #e6ca99; font: bold 27pt Georgia, 'Times New Roman', serif; margin: 0; line-height: 1.1; overflow-wrap: anywhere; }
      .brand .tagline { font-size: 8pt; font-weight: bold; font-style: italic; text-align: right; margin-top: 3px; }
      .company-contact { font: 9pt 'Times New Roman', serif; margin-top: 8px; }
      .document-title { border: 1px solid #111; margin: 0; text-align: center; font: bold 11pt 'Times New Roman', serif; padding: 2px; }
      .metadata { display: flex; justify-content: space-between; gap: 12px; font: bold 8pt 'Times New Roman', serif; padding: 3px 1px 5px; }
      .recipient { width: 100%; border-collapse: collapse; margin-bottom: 3px; }
      .recipient td { border: 1px solid #111; padding: 7px; vertical-align: top; }
      .recipient .customer { font: bold 10pt 'Times New Roman', serif; width: 70%; }
      .recipient .contact { font-size: 8pt; vertical-align: middle; }
      .subject { text-align: center; font-weight: bold; margin: 4px 0 8px; }
      .status { color: #963b14; font-size: 7pt; text-align: center; letter-spacing: .2px; margin: 3px 0; }
      table.scope { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7pt; line-height: 1.18; }
      .scope th, .scope td { border: 1px solid #151515; padding: 2px; overflow-wrap: anywhere; }
      .scope thead { display: table-header-group; }
      .scope th { text-align: center; line-height: 1.1; font-size: 5.8pt; }
      .scope tr { break-inside: avoid; page-break-inside: avoid; }
      .section-heading { background: #e87808; font-weight: bold; text-align: center; break-after: avoid; }
      .section-heading td { padding: 2px; font-size: 8pt; }
      .description { vertical-align: top; padding: 3px !important; }
      .description > strong { display: block; margin-bottom: 2px; }
      .specification { font-weight: bold; border-top: 1px solid #222; padding: 1px 0; margin-top: 2px; }
      .make, .unit, .serial { text-align: center; vertical-align: middle; font-size: 6.2pt; }
      .number { text-align: right; vertical-align: middle; font-variant-numeric: tabular-nums; }
      .component, .amount { font-size: 6.1pt; }
      .amount { font-weight: bold; }
      .family-scope { break-after: avoid; }
      .variant-group { break-inside: avoid; }
      .section-start { break-after: avoid; }
      .section-total { font-weight: bold; background: #f3f3f3; }
      .section-total td:first-child { text-align: right; }
      .rates-note { margin: 5px 0 10px; font-size: 7pt; }
      .totals { width: 49%; margin: 10px 0 12px auto; border-collapse: collapse; break-inside: avoid; }
      .totals th, .totals td { border: 1px solid #222; padding: 5px 7px; }
      .totals th { text-align: left; font-weight: normal; }
      .totals td { text-align: right; font-variant-numeric: tabular-nums; }
      .totals .grand-total { background: #f8e0bf; font-size: 10pt; font-weight: bold; }
      .grand-total th { font-weight: bold; }
      .terms h3 { margin: 12px 0 5px; border-bottom: 1px solid #222; padding-bottom: 3px; font-size: 9pt; break-after: avoid; }
      .terms p { margin: 0 0 5px; break-inside: avoid; }
      .signatory { text-align: right; margin: 18px 0 6px; break-inside: avoid; }
      .signatory strong { display: block; margin-top: 25px; }
    </style></head><body>
    <header class="letterhead"><div class="brand">${safeLogo ? `<img alt="Company logo" src="${safeLogo}">` : ""}<div>
      <h1>${escapeHtml(details.senderName || "Fire Safety")}</h1>${details.senderTagline ? `<div class="tagline">${escapeHtml(details.senderTagline)}</div>` : ""}</div></div>
      <div class="company-contact">${[
        details.senderAddress,
        details.senderContact,
        details.senderGstin ? `GSTIN: ${details.senderGstin}` : "",
      ]
        .filter(Boolean)
        .map((entry) => `<p>${escapeHtml(entry!)}</p>`)
        .join("")}</div></header>
    <h2 class="document-title">${escapeHtml(quotation.documentTitle ?? "QUOTATION")}</h2>
    <div class="metadata"><span>Quotation No: ${escapeHtml(quotation.quotationNumber)} / R${quotation.revisionNumber}</span><span>${details.documentDate ? `Date: ${escapeHtml(details.documentDate.split("-").reverse().join("."))}` : ""}</span></div>
    <table class="recipient"><tr><td class="customer">To: ${escapeHtml(quotation.customerName)}${details.recipientAddress ? `<p>${escapeHtml(details.recipientAddress)}</p>` : ""}${details.recipientGstin ? `<p>GSTIN: ${escapeHtml(details.recipientGstin)}</p>` : ""}</td>
      ${details.recipientContact || details.recipientPhone ? `<td class="contact">${details.recipientContact ? `<strong>${escapeHtml(details.recipientContact)}</strong>` : ""}${details.recipientPhone ? `<p>Phone: ${escapeHtml(details.recipientPhone)}</p>` : ""}</td>` : ""}</tr></table>
    <p class="subject">Sub: ${escapeHtml(quotation.title)}</p>
    <p class="status">${quotation.preview ? "PREVIEW - NOT ISSUED" : "DEMO / NOT FOR PRODUCTION"}</p>
    <table class="scope"><colgroup>${(priced ? [3, 40, 8, 4, 4, 6, 6.5, 5.5, 8, 7, 8] : [5, 60, 18, 8, 9]).map((width) => `<col style="width:${width}%">`).join("")}</colgroup>
      <thead><tr><th>Sr.<br>No.</th><th>DESCRIPTION</th><th>MAKE / MODEL</th><th>UNIT</th><th>Qty.</th>${priced ? `<th>Supply</th><th>Installation</th><th>${escapeHtml(markupHeading(quotation.lines))}</th><th>Miscellaneous</th><th>Rate</th><th>Amount</th>` : ""}</tr></thead>
      ${sectionRows(quotation.lines, priced)}</table>
    ${
      priced
        ? `<p class="rates-note">Currency: ${escapeHtml(quotation.currency)}. Supply, installation, markup amount, miscellaneous and rate are per unit. Markup percentages appear in the header or beside mixed-line amounts. Validity: ${quotation.validityDays} days.</p>
      <table class="totals">${rows("Subtotal", quotation.subtotal)}${rows("Line discounts", quotation.lineDiscountTotal)}${rows("Additional discount", quotation.additionalDiscount)}${rows(quotation.taxLabel ?? "Tax", quotation.taxAmount)}${rows("Rounding adjustment", quotation.roundingAdjustment)}${rows(`GRAND TOTAL (${quotation.currency})`, quotation.grandTotal, true)}</table>
      ${termBlocks("Terms and conditions / exclusions", terms)}${termBlocks("Delivery terms", quotation.deliveryTerms)}${!inlinePayment ? termBlocks("Payment terms", quotation.paymentTerms) : ""}${termBlocks("Bank details", details.bankDetails ?? "")}
      ${details.signatory ? `<div class="signatory">For ${escapeHtml(details.senderName ?? "")}<strong>${escapeHtml(details.signatory)}</strong>Authorized signatory</div>` : ""}`
        : '<p class="rates-note">Technical quantities - commercial values restricted.</p>'
    }
    </body></html>`;
}

export function quotationFooter(quotation: PdfQuotation) {
  return `<div style="width:100%;margin:0 8mm;padding-top:4px;border-top:1px solid #222;font:8px Arial;color:#333;display:flex;justify-content:space-between"><span>${escapeHtml(quotation.quotationNumber)} / R${quotation.revisionNumber}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span><span>${quotation.preview ? "PREVIEW" : "DEMO"}</span></div>`;
}

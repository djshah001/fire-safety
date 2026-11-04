export type PdfPurchaseOrder = {
  poNumber: string;
  revisionNumber: number;
  date: string;
  title: string;
  currency: string;
  status: string;
  companyName: string;
  vendor: {
    name: string;
    code: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    gstin?: string | null;
  };
  project: {
    number: string;
    title: string;
  };
  deliveryTerms: string;
  paymentTerms: string;
  deliveryLocation: string;
  deliveryDueDate?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  notes?: string | null;
  subtotal: string;
  taxAmount: string;
  grandTotal: string;
  lines: Array<{
    lineNumber: number;
    itemCode: string;
    itemName: string;
    specification: string;
    brandOffered: string;
    model?: string | null;
    unitSymbol: string;
    quantity: string;
    unitRate: string;
    taxPercent: string;
    taxAmount: string;
    lineTotal: string;
  }>;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function formatInr(val: string) {
  const n = Number(val);
  return Number.isNaN(n)
    ? val
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function purchaseOrderFooter(po: PdfPurchaseOrder) {
  return `<div style="width: 100%; font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; padding: 0 14mm;">
    <span>PO: ${escapeHtml(po.poNumber)} (Rev R${po.revisionNumber})</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

export function buildPurchaseOrderHtml(po: PdfPurchaseOrder, logoDataUrl?: string) {
  const rows = po.lines
    .map(
      (line) => `
    <tr>
      <td class="text-center">${line.lineNumber}</td>
      <td>
        <div class="font-semibold text-slate-900">${escapeHtml(line.itemName)}</div>
        <div class="text-xs text-slate-500">${escapeHtml(line.specification)}</div>
        <div class="mt-1 text-xs">
          <span class="inline-block rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
            Make: ${escapeHtml(line.brandOffered)}${line.model ? ` · ${escapeHtml(line.model)}` : ''}
          </span>
        </div>
      </td>
      <td class="text-center font-mono text-xs">${escapeHtml(line.itemCode)}</td>
      <td class="text-right font-medium">${formatInr(line.quantity)}</td>
      <td class="text-center text-xs uppercase">${escapeHtml(line.unitSymbol)}</td>
      <td class="text-right font-mono">${formatInr(line.unitRate)}</td>
      <td class="text-right font-mono">${line.taxPercent}%</td>
      <td class="text-right font-mono font-semibold">${formatInr(line.lineTotal)}</td>
    </tr>
  `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(po.poNumber)} - Purchase Order</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 14mm 18mm 14mm;
      @bottom-right {
        content: counter(page) " of " counter(pages);
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 8pt;
        color: #64748b;
      }
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 9pt;
      line-height: 1.4;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }
    .header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .header-table td { vertical-align: top; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-issued { background: #dcfce7; color: #15803d; }
    .badge-draft { background: #fef3c7; color: #b45309; }
    .info-grid {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .info-grid td {
      width: 50%;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
      font-size: 8.5pt;
    }
    .info-label { font-size: 7.5pt; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 2px; }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .items-table th {
      background: #f1f5f9;
      color: #334155;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 7px 6px;
      border-bottom: 2px solid #cbd5e1;
      font-weight: 700;
    }
    .items-table td {
      padding: 7px 6px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
      font-size: 8.5pt;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-semibold { font-weight: 600; }
    .totals-table {
      width: 280px;
      margin-left: auto;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .totals-table td {
      padding: 5px 8px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 9pt;
    }
    .terms-box {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      border-radius: 6px;
      padding: 10px 12px;
      margin-top: 14px;
      font-size: 8pt;
    }
    .terms-title { font-weight: 700; color: #1e293b; margin-bottom: 4px; font-size: 8.5pt; text-transform: uppercase; }
    .signature-row {
      margin-top: 24px;
      width: 100%;
      display: flex;
      justify-content: space-between;
      page-break-inside: avoid;
    }
    .signature-box {
      width: 200px;
      border-top: 1px solid #94a3b8;
      padding-top: 6px;
      text-align: center;
      font-size: 8pt;
      color: #475569;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <table class="header-table">
    <tr>
      <td>
        ${logoDataUrl ? `<img src="${logoDataUrl}" style="max-height: 48px; margin-bottom: 6px;" alt="Logo" />` : ''}
        <h1 style="margin: 0; font-size: 16pt; font-weight: 800; color: #0f172a;">${escapeHtml(po.companyName)}</h1>
        <div style="font-size: 8pt; color: #64748b; margin-top: 2px;">Fire Protection Engineers & Contractors</div>
      </td>
      <td style="text-align: right;">
        <h2 style="margin: 0; font-size: 16pt; font-weight: 800; color: #e11d48; letter-spacing: -0.02em;">PURCHASE ORDER</h2>
        <div style="margin-top: 4px; font-family: monospace; font-size: 11pt; font-weight: 700; color: #0f172a;">${escapeHtml(po.poNumber)}</div>
        <div style="margin-top: 2px;">
          <span class="badge ${po.status === 'issued' ? 'badge-issued' : 'badge-draft'}">
            Revision R${po.revisionNumber} · ${po.status.toUpperCase()}
          </span>
        </div>
        <div style="font-size: 8.5pt; color: #475569; margin-top: 4px;">Date: <strong>${escapeHtml(po.date)}</strong></div>
      </td>
    </tr>
  </table>

  <!-- Vendor & Delivery Details -->
  <table class="info-grid">
    <tr>
      <td>
        <div class="info-label">Vendor / Supplier</div>
        <div style="font-size: 10pt; font-weight: 700; color: #0f172a;">${escapeHtml(po.vendor.name)}</div>
        <div style="color: #475569;">Vendor Code: ${escapeHtml(po.vendor.code)}</div>
        ${po.vendor.contactName ? `<div>Attn: ${escapeHtml(po.vendor.contactName)}</div>` : ''}
        ${po.vendor.address ? `<div style="margin-top: 3px;">${escapeHtml(po.vendor.address)}</div>` : ''}
        ${po.vendor.gstin ? `<div style="margin-top: 2px; font-family: monospace;">GSTIN: ${escapeHtml(po.vendor.gstin)}</div>` : ''}
      </td>
      <td>
        <div class="info-label">Project & Delivery Site</div>
        <div style="font-weight: 700; color: #0f172a;">${escapeHtml(po.project.number)} - ${escapeHtml(po.project.title)}</div>
        <div style="margin-top: 4px;"><span style="color: #64748b;">Delivery Site:</span> ${escapeHtml(po.deliveryLocation)}</div>
        ${po.deliveryDueDate ? `<div style="margin-top: 2px;"><span style="color: #64748b;">Required By:</span> <strong>${escapeHtml(po.deliveryDueDate)}</strong></div>` : ''}
        <div style="margin-top: 2px;"><span style="color: #64748b;">Subject:</span> ${escapeHtml(po.title)}</div>
      </td>
    </tr>
  </table>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 32px;" class="text-center">#</th>
        <th>Item Description & Specification</th>
        <th style="width: 90px;" class="text-center">Item Code</th>
        <th style="width: 60px;" class="text-right">Qty</th>
        <th style="width: 44px;" class="text-center">Unit</th>
        <th style="width: 80px;" class="text-right">Rate (${escapeHtml(po.currency)})</th>
        <th style="width: 50px;" class="text-right">GST</th>
        <th style="width: 90px;" class="text-right">Amount (${escapeHtml(po.currency)})</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <!-- Totals Table -->
  <table class="totals-table">
    <tr>
      <td style="color: #475569;">Subtotal:</td>
      <td class="text-right font-mono">${escapeHtml(po.currency)} ${formatInr(po.subtotal)}</td>
    </tr>
    <tr>
      <td style="color: #475569;">Taxes (GST):</td>
      <td class="text-right font-mono">${escapeHtml(po.currency)} ${formatInr(po.taxAmount)}</td>
    </tr>
    <tr style="font-weight: 800; font-size: 10.5pt; background: #f8fafc;">
      <td>Grand Total:</td>
      <td class="text-right font-mono" style="color: #e11d48;">${escapeHtml(po.currency)} ${formatInr(po.grandTotal)}</td>
    </tr>
  </table>

  <!-- Terms & Conditions -->
  <div class="terms-box">
    <div class="terms-title">Commercial Terms & Conditions</div>
    <div style="margin-bottom: 3px;"><strong>1. Payment Terms:</strong> ${escapeHtml(po.paymentTerms)}</div>
    <div style="margin-bottom: 3px;"><strong>2. Delivery Terms:</strong> ${escapeHtml(po.deliveryTerms)}</div>
    <div style="margin-bottom: 3px;"><strong>3. Inspection:</strong> Goods are subject to site inspection and quality clearance upon delivery. Rejected items will be returned at vendor's cost.</div>
    ${po.notes ? `<div><strong>4. Special Notes:</strong> ${escapeHtml(po.notes)}</div>` : ''}
  </div>

  <!-- Signatures -->
  <table style="width: 100%; margin-top: 36px; page-break-inside: avoid;">
    <tr>
      <td style="width: 50%; text-align: left;">
        <div style="width: 180px; border-top: 1px dashed #94a3b8; padding-top: 6px; font-size: 8pt; color: #475569; text-align: center;">
          Vendor Acceptance & Stamp
        </div>
      </td>
      <td style="width: 50%; text-align: right;">
        <div style="width: 180px; margin-left: auto; border-top: 1px dashed #94a3b8; padding-top: 6px; font-size: 8pt; color: #475569; text-align: center;">
          Authorized Signatory<br /><strong>${escapeHtml(po.companyName)}</strong>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

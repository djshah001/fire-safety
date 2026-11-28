export type PdfSupplierReturn = {
  rtvNumber: string;
  poNumber: string;
  grnNumber: string;
  resolutionType: 'replacement' | 'credit_note' | 'deduction';
  dispatchDate: string;
  companyName: string;
  vendor: {
    name: string;
    code: string;
  };
  project: {
    number: string;
    title: string;
  } | null;
  transporterName: string | null;
  vehicleNumber: string | null;
  reason: string;
  lines: Array<{
    lineNumber: number;
    itemCode: string;
    itemName: string;
    brandOffered: string | null;
    unitSymbol: string;
    returnQuantity: string;
    remarks: string | null;
  }>;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}

function formatQty(val: string) {
  const n = Number(val);
  return Number.isNaN(n)
    ? val
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function resolutionLabel(type: PdfSupplierReturn['resolutionType']) {
  if (type === 'replacement') return 'Vendor Replacement Required';
  if (type === 'credit_note') return 'Credit Note Settlement';
  return 'Invoice Deduction';
}

export function supplierReturnFooter(rtv: PdfSupplierReturn) {
  return `<div style="width: 100%; font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; padding: 0 14mm;">
    <span>RTV Challan: ${escapeHtml(rtv.rtvNumber)} (Ref PO: ${escapeHtml(rtv.poNumber)})</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

export function buildSupplierReturnHtml(rtv: PdfSupplierReturn) {
  const rows = rtv.lines
    .map(
      (line) => `
    <tr>
      <td class="text-center">${line.lineNumber}</td>
      <td class="font-mono text-xs">${escapeHtml(line.itemCode)}</td>
      <td>
        <div class="font-semibold text-slate-900">${escapeHtml(line.itemName)}</div>
        ${
          line.brandOffered
            ? `<div class="brand-meta text-xs text-slate-600">Make: ${escapeHtml(line.brandOffered)}</div>`
            : ''
        }
        ${
          line.remarks
            ? `<div class="brand-meta text-xs text-slate-500">Remarks: ${escapeHtml(line.remarks)}</div>`
            : ''
        }
      </td>
      <td class="text-center text-xs uppercase">${escapeHtml(line.unitSymbol)}</td>
      <td class="text-right font-mono font-semibold">${formatQty(line.returnQuantity)}</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(rtv.rtvNumber)} - Return to Vendor Challan</title>
  <style>
    @page { margin: 14mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      font-size: 9.5pt;
      line-height: 1.4;
      background: #fff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #b91c1c;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .company-name {
      font-size: 16pt;
      font-weight: 700;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .doc-badge {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-align: right;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }
    .box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .box-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .box-val {
      font-size: 9.5pt;
      color: #0f172a;
      font-weight: 600;
    }
    .box-sub {
      font-size: 8.5pt;
      color: #475569;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    th {
      background: #0f172a;
      color: #f8fafc;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 8px;
      text-align: left;
      border: 1px solid #0f172a;
    }
    td {
      padding: 8px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
      font-size: 9pt;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .font-semibold { font-weight: 600; }
    .text-xs { font-size: 8pt; }
    .text-slate-900 { color: #0f172a; }
    .text-slate-600 { color: #475569; }
    .text-slate-500 { color: #64748b; }
    .brand-meta { margin-top: 2px; }
    .reason-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 18px;
      background: #fffbeb;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 32px;
      page-break-inside: avoid;
    }
    .sig-box {
      border-top: 1px solid #94a3b8;
      padding-top: 8px;
    }
    .sig-title {
      font-weight: 700;
      font-size: 9pt;
    }
    .sig-sub {
      font-size: 8pt;
      color: #64748b;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(rtv.companyName)}</div>
      <div style="font-size: 8.5pt; color: #475569; margin-top: 3px;">
        Purchase Order: <span class="font-mono font-semibold">${escapeHtml(rtv.poNumber)}</span> · Source GRN: <span class="font-mono font-semibold">${escapeHtml(rtv.grnNumber)}</span>
      </div>
    </div>
    <div>
      <div class="doc-badge">Return to Vendor (RTV)</div>
      <div class="font-mono font-semibold" style="margin-top: 6px; text-align: right;">${escapeHtml(rtv.rtvNumber)}</div>
      <div style="font-size: 8pt; color: #64748b; text-align: right;">Dispatched: ${escapeHtml(rtv.dispatchDate)}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="box">
      <div class="box-label">Return To Supplier</div>
      <div class="box-val">${escapeHtml(rtv.vendor.name)}</div>
      <div class="box-sub">Vendor Code: ${escapeHtml(rtv.vendor.code)}</div>
      ${
        rtv.project
          ? `<div class="box-sub">Project: ${escapeHtml(rtv.project.number)} — ${escapeHtml(rtv.project.title)}</div>`
          : ''
      }
    </div>
    <div class="box">
      <div class="box-label">Logistics & Resolution Basis</div>
      <div class="box-val">${escapeHtml(resolutionLabel(rtv.resolutionType))}</div>
      <div class="box-sub">Transporter: ${escapeHtml(rtv.transporterName || 'Vendor Pickup / Self')}</div>
      <div class="box-sub">Vehicle No.: ${escapeHtml(rtv.vehicleNumber || '—')}</div>
    </div>
  </div>

  <div class="reason-box">
    <div class="box-label">Rejection & Return Reason</div>
    <div style="font-size: 9pt; color: #0f172a;">${escapeHtml(rtv.reason)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 6%;" class="text-center">#</th>
        <th style="width: 18%;">Item Code</th>
        <th style="width: 50%;">Description / Make / Inspection Notes</th>
        <th style="width: 10%;" class="text-center">Unit</th>
        <th style="width: 16%;" class="text-right">Return Qty</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Issued By (Store / Procurement)</div>
      <div class="sig-sub">Authorized Signatory &amp; Stamp</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Carrier / Vendor Acknowledgment</div>
      <div class="sig-sub">Name, Signature &amp; Collection Date</div>
    </div>
  </div>
</body>
</html>`;
}

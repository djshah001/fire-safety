export type PdfDeliveryChallan = {
  dcNumber: string;
  mirNumber: string;
  dispatchedAt: string;
  companyName: string;
  project: {
    number: string;
    title: string;
    siteName: string;
    siteAddress: string;
  };
  warehouse: {
    code: string;
    name: string;
    address: string;
  };
  dispatchedByName: string;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  receiverName?: string | null;
  notes?: string | null;
  lines: Array<{
    lineNumber: number;
    itemCode: string;
    itemName: string;
    brandName?: string | null;
    manufacturerModel?: string | null;
    unitSymbol: string;
    dispatchedQty: string;
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

export function deliveryChallanFooter(dc: PdfDeliveryChallan) {
  return `<div style="width: 100%; font-size: 8pt; color: #64748b; display: flex; justify-content: space-between; padding: 0 14mm;">
    <span>Delivery Challan: ${escapeHtml(dc.dcNumber)} (MIR: ${escapeHtml(dc.mirNumber)})</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

export function buildDeliveryChallanHtml(dc: PdfDeliveryChallan) {
  const rows = dc.lines
    .map(
      (line) => `
    <tr>
      <td class="text-center">${line.lineNumber}</td>
      <td class="font-mono text-xs">${escapeHtml(line.itemCode)}</td>
      <td>
        <div class="font-semibold text-slate-900">${escapeHtml(line.itemName)}</div>
        ${
          line.brandName
            ? `<div class="brand-meta text-xs text-slate-600">Make: ${escapeHtml(line.brandName)}${
                line.manufacturerModel ? ` (${escapeHtml(line.manufacturerModel)})` : ''
              }</div>`
            : `<div class="brand-meta text-xs text-slate-500">Generic / Standard</div>`
        }
      </td>
      <td class="text-center text-xs uppercase">${escapeHtml(line.unitSymbol)}</td>
      <td class="text-right font-mono font-semibold">${formatQty(line.dispatchedQty)}</td>
      <td class="text-right text-xs text-slate-400">____________</td>
    </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(dc.dcNumber)} - Delivery Challan</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 14mm 18mm 14mm;
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
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .title-block h1 {
      margin: 0;
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .title-block p {
      margin: 2px 0 0 0;
      font-size: 9pt;
      color: #475569;
    }
    .meta-box {
      text-align: right;
    }
    .meta-box .dc-no {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12pt;
      font-weight: 700;
    }
    .meta-box .sub {
      font-size: 8.5pt;
      color: #475569;
      margin-top: 2px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .panel {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .panel h3 {
      margin: 0 0 6px 0;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748b;
    }
    .panel p {
      margin: 2px 0;
      font-size: 9pt;
    }
    .logistics {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
    }
    .logistics .label {
      font-size: 7.5pt;
      text-transform: uppercase;
      color: #64748b;
    }
    .logistics .value {
      font-size: 8.5pt;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 8px 8px;
      text-align: left;
    }
    td {
      padding: 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .font-semibold { font-weight: 600; }
    .text-xs { font-size: 8pt; }
    .text-slate-900 { color: #0f172a; }
    .text-slate-600 { color: #475569; }
    .text-slate-500 { color: #64748b; }
    .text-slate-400 { color: #94a3b8; }
    .brand-meta { margin-top: 2px; }
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
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title-block">
      <h1>DELIVERY CHALLAN</h1>
      <p>${escapeHtml(dc.companyName)} · Material Dispatch & Site Transfer</p>
    </div>
    <div class="meta-box">
      <div class="dc-no">${escapeHtml(dc.dcNumber)}</div>
      <div class="sub">MIR Ref: <strong>${escapeHtml(dc.mirNumber)}</strong></div>
      <div class="sub">Dispatched: ${escapeHtml(dc.dispatchedAt)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <h3>Dispatching Warehouse</h3>
      <p class="font-semibold">${escapeHtml(dc.warehouse.code)} — ${escapeHtml(dc.warehouse.name)}</p>
      <p class="text-slate-600">${escapeHtml(dc.warehouse.address)}</p>
    </div>
    <div class="panel">
      <h3>Project & Destination Site</h3>
      <p class="font-semibold">${escapeHtml(dc.project.number)} — ${escapeHtml(dc.project.title)}</p>
      <p>${escapeHtml(dc.project.siteName)}</p>
      <p class="text-slate-600">${escapeHtml(dc.project.siteAddress)}</p>
    </div>
  </div>

  <div class="logistics">
    <div>
      <div class="label">Dispatched By</div>
      <div class="value">${escapeHtml(dc.dispatchedByName)}</div>
    </div>
    <div>
      <div class="label">Transporter</div>
      <div class="value">${escapeHtml(dc.transporterName || 'Company / Direct')}</div>
    </div>
    <div>
      <div class="label">Vehicle No.</div>
      <div class="value">${escapeHtml(dc.vehicleNumber || '—')}</div>
    </div>
    <div>
      <div class="label">Site Receiver</div>
      <div class="value">${escapeHtml(dc.receiverName || 'Assigned Site Engineer')}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="text-center" style="width: 36px;">#</th>
        <th style="width: 110px;">Item Code</th>
        <th>Item & Approved Make / Brand</th>
        <th class="text-center" style="width: 60px;">Unit</th>
        <th class="text-right" style="width: 95px;">Dispatched Qty</th>
        <th class="text-right" style="width: 110px;">Site Verified Qty</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>

  ${
    dc.notes
      ? `<div class="panel" style="margin-bottom: 16px;">
          <h3>Dispatch Remarks</h3>
          <p>${escapeHtml(dc.notes)}</p>
        </div>`
      : ''
  }

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-title">Issued By (Storekeeper)</div>
      <div class="sig-sub">Name: ${escapeHtml(dc.dispatchedByName)}</div>
      <div class="sig-sub">Signature & Date: ________________________</div>
    </div>
    <div class="sig-box">
      <div class="sig-title">Received & Verified At Site (POD)</div>
      <div class="sig-sub">Site Engineer / PM Name: ______________________</div>
      <div class="sig-sub">Signature, Stamp & Date: _____________________</div>
    </div>
  </div>
</body>
</html>`;
}

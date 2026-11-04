import { printPdf } from './pdfBrowser.js';
import {
  buildPurchaseOrderHtml,
  purchaseOrderFooter,
  type PdfPurchaseOrder,
} from './purchaseOrder.template.js';

export const poPdfTemplateVersion = 'po-commercial-v1';

export async function renderPurchaseOrderPdf(po: PdfPurchaseOrder, logoDataUrl?: string) {
  const html = buildPurchaseOrderHtml(po, logoDataUrl);
  return printPdf(html, purchaseOrderFooter(po));
}

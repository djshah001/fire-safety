import { printPdf } from './pdfBrowser.js';
import {
  buildDeliveryChallanHtml,
  deliveryChallanFooter,
  type PdfDeliveryChallan,
} from './deliveryChallan.template.js';

export const dcPdfTemplateVersion = 'dc-dispatch-v1';

export async function renderDeliveryChallanPdf(dc: PdfDeliveryChallan) {
  const html = buildDeliveryChallanHtml(dc);
  return printPdf(html, deliveryChallanFooter(dc));
}

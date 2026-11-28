import { printPdf } from './pdfBrowser.js';
import {
  buildSupplierReturnHtml,
  supplierReturnFooter,
  type PdfSupplierReturn,
} from './supplierReturn.template.js';

export const rtvPdfTemplateVersion = 'rtv-challan-v1';

export async function renderSupplierReturnPdf(rtv: PdfSupplierReturn) {
  const html = buildSupplierReturnHtml(rtv);
  return printPdf(html, supplierReturnFooter(rtv));
}

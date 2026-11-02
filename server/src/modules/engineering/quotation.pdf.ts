import { readFile, stat } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/appError.js';
import { printPdf } from '../../infrastructure/documents/pdfBrowser.js';
import { buildQuotationHtml, quotationFooter, type PdfQuotation } from './quotation.template.js';

export const quotationPdfTemplateVersion = 'boq-reference-v5-columns';

async function logoDataUrl() {
  if (!env.PDF_LOGO_PATH) return undefined;
  try {
    const info = await stat(env.PDF_LOGO_PATH);
    if (!info.isFile() || info.size > 256 * 1_024) throw new Error('Invalid logo size.');
    const bytes = await readFile(env.PDF_LOGO_PATH);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) throw new Error('Invalid logo format.');
    return `data:image/${png ? 'png' : 'jpeg'};base64,${bytes.toString('base64')}`;
  } catch {
    throw new AppError('PDF_LOGO_CONFIGURATION', 'The quotation logo must be a readable PNG/JPEG file of at most 256 KiB. Ask an administrator to check the server configuration.', 503);
  }
}

export async function renderDemoQuotationPdf(quotation: PdfQuotation) {
  return printPdf(buildQuotationHtml(quotation, await logoDataUrl()), quotationFooter(quotation));
}

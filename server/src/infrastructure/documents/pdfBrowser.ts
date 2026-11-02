import puppeteer, { type Browser } from 'puppeteer';
import { AppError } from '../../core/errors/appError.js';
import { env } from '../../config/env.js';

let browserPromise: Promise<Browser> | undefined;
let active = 0;
let idleTimer: NodeJS.Timeout | undefined;
const waiting: Array<{ ready: () => void; timer: NodeJS.Timeout }> = [];

async function acquire() {
  if (active < env.PDF_RENDER_CONCURRENCY) { active++; return; }
  if (waiting.length >= 8) throw new AppError('PDF_RENDER_BUSY', 'PDF generation is busy. Try again shortly.', 503);
  await new Promise<void>((resolve, reject) => {
    const entry = { ready: resolve, timer: setTimeout(() => {
      const index = waiting.indexOf(entry);
      if (index >= 0) waiting.splice(index, 1);
      reject(new AppError('PDF_RENDER_BUSY', 'PDF generation is busy. Try again shortly.', 503));
    }, env.PDF_RENDER_TIMEOUT_MS) };
    waiting.push(entry);
  });
}

function release() {
  const next = waiting.shift();
  if (next) { clearTimeout(next.timer); next.ready(); }
  else active--;
  if (active === 0) {
    // Do not keep CLI seeds/tests alive or leave idle Chrome processes behind.
    idleTimer = setTimeout(() => { void closePdfBrowser(); }, 5_000);
    idleTimer.unref();
  }
}

async function browser() {
  if (!browserPromise) {
    const launched = puppeteer.launch({ headless: true, timeout: env.PDF_RENDER_TIMEOUT_MS,
      ...(env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH } : {}),
      handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    browserPromise = launched;
    try {
      const instance = await launched;
      instance.once('disconnected', () => { if (browserPromise === launched) browserPromise = undefined; });
    } catch {
      if (browserPromise === launched) browserPromise = undefined;
      throw new AppError('PDF_BROWSER_UNAVAILABLE', 'PDF generation is unavailable. Configure the server Chrome installation and retry.', 503);
    }
  }
  return browserPromise;
}

export async function closePdfBrowser() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; }
  const pending = browserPromise;
  browserPromise = undefined;
  await pending?.then((instance) => instance.close()).catch(() => undefined);
}

export async function printPdf(html: string, footer: string) {
  await acquire();
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = undefined; }
  try {
    const instance = await browser();
    // Each request gets a fresh isolated context; never reuse authentication/cookies.
    const context = await instance.createBrowserContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(env.PDF_RENDER_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(env.PDF_RENDER_TIMEOUT_MS);
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const allowed = request.url().startsWith('data:image/png;base64,') || request.url().startsWith('data:image/jpeg;base64,');
        void (allowed ? request.continue() : request.abort()).catch(() => undefined);
      });
      await page.setContent(html, { waitUntil: 'load', timeout: env.PDF_RENDER_TIMEOUT_MS });
      return Buffer.from(await page.pdf({
        format: 'A4', printBackground: true, preferCSSPageSize: true,
        margin: { top: '8mm', right: '8mm', bottom: '13mm', left: '8mm' },
        displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer,
        timeout: env.PDF_RENDER_TIMEOUT_MS,
      }));
    } finally { await context.close(); }
  } finally { release(); }
}

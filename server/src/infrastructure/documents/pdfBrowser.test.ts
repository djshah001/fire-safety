import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const page = { setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(), setJavaScriptEnabled: vi.fn(),
    setRequestInterception: vi.fn(), on: vi.fn(), setContent: vi.fn(), pdf: vi.fn() };
  const context = { newPage: vi.fn(async () => page), close: vi.fn() };
  const browser = { createBrowserContext: vi.fn(async () => context), once: vi.fn(), close: vi.fn() };
  return { page, context, browser, launch: vi.fn(async () => browser) };
});
vi.mock('puppeteer', () => ({ default: { launch: fake.launch } }));
import { closePdfBrowser, printPdf } from './pdfBrowser.js';
afterEach(async () => { await closePdfBrowser(); vi.clearAllMocks(); });

describe('isolated PDF browser', () => {
  it('reuses Chrome but closes a separate context for every document', async () => {
    fake.page.pdf.mockResolvedValue(Buffer.from('%PDF-test'));
    await printPdf('<html>First</html>', 'footer'); await printPdf('<html>Second</html>', 'footer');
    expect(fake.launch).toHaveBeenCalledTimes(1);
    expect(fake.browser.createBrowserContext).toHaveBeenCalledTimes(2);
    expect(fake.context.close).toHaveBeenCalledTimes(2);
    expect(fake.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(fake.page.pdf).toHaveBeenCalledWith(expect.objectContaining({ format: 'A4', printBackground: true, displayHeaderFooter: true }));
  });
  it('blocks network and local-file requests', async () => {
    fake.page.pdf.mockResolvedValue(Buffer.from('%PDF-test')); await printPdf('<html></html>', 'footer');
    const handler = fake.page.on.mock.calls.find(([event]) => event === 'request')![1] as (request: unknown) => void;
    for (const url of ['https://example.test/image.png', 'http://127.0.0.1/admin', 'file:///private', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      const abort = vi.fn(async () => undefined), proceed = vi.fn(async () => undefined);
      handler({ url: () => url, abort, continue: proceed });
      expect(abort).toHaveBeenCalledOnce(); expect(proceed).not.toHaveBeenCalled();
    }
  });
  it('releases its context and permit after render failure', async () => {
    fake.page.pdf.mockRejectedValueOnce(new Error('Render failed'));
    await expect(printPdf('<html></html>', 'footer')).rejects.toThrow('Render failed');
    expect(fake.context.close).toHaveBeenCalledOnce();
    fake.page.pdf.mockResolvedValue(Buffer.from('%PDF-next'));
    expect((await printPdf('<html></html>', 'footer')).toString()).toBe('%PDF-next');
  });
  it('bounds concurrent pages and passes a released permit to the next request', async () => {
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    fake.page.pdf.mockImplementation(async () => { await gate; return Buffer.from('%PDF-test'); });
    const requests = [printPdf('1', ''), printPdf('2', ''), printPdf('3', '')];
    await vi.waitFor(() => expect(fake.page.pdf).toHaveBeenCalledTimes(2));
    unblock(); await Promise.all(requests);
    expect(fake.page.pdf).toHaveBeenCalledTimes(3); expect(fake.context.close).toHaveBeenCalledTimes(3);
  });
});

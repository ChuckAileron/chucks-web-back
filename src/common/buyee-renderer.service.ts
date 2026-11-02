import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { launch, type Browser, type Page, type HTTPResponse } from 'puppeteer';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePublicUrl } from './http-page.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const RENDER_TIMEOUT = 45_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class BuyeeRendererService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  private browser() {
    this.browserPromise ??= launch({
      headless: true,
      userDataDir: process.env['SHOP_CHROME_PROFILE'] || join(tmpdir(), 'chucks-web-buyee-profile'),
      args: process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [],
    }).catch((error: unknown) => {
      this.browserPromise = null;
      throw error;
    });
    return this.browserPromise;
  }

  private async validateRequest(requestUrl: string) {
    const protocol = new URL(requestUrl).protocol;
    if (protocol === 'http:' || protocol === 'https:') await validatePublicUrl(requestUrl);
  }

  async renderProductHtml(value: string, timeoutMs = RENDER_TIMEOUT) {
    const safeUrl = await validatePublicUrl(value);
    const browser = await this.browser();
    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      void this.validateRequest(request.url())
        .then(() => request.continue())
        .catch(() => request.abort('blockedbyclient'));
    });

    try {
      const started = Date.now();
      const deadline = started + timeoutMs;
      try {
        await page.goto(safeUrl.href, { waitUntil: 'domcontentloaded', timeout: Math.min(15_000, timeoutMs) });
      } catch {
        // El reto WAF puede recargar la página y cancelar la navegación inicial.
      }
      while (Date.now() < deadline) {
        await delay(1500);
        try {
          const probe = await page.evaluate(() => {
            const node = document.querySelector('h1.m-goodsName');
            const title = node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            return {
              ready: title !== '' && !/[\u3040-\u30ff\u4e00-\u9fff]/.test(title),
              hasHeading: Boolean(node),
            };
          });
          if (probe?.ready) break;
          if (probe && !probe.hasHeading && Date.now() - started > 15_000) break;
        } catch {
          // La navegación del challenge destruye temporalmente el contexto.
        }
      }
      let html = '';
      for (let attempt = 0; attempt < 3 && !html; attempt += 1) {
        try {
          html = await page.content();
        } catch {
          await delay(500);
        }
      }
      return { html, finalUrl: page.url() };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async renderAliExpressProductHtml(value: string, timeoutMs = RENDER_TIMEOUT) {
    const safeUrl = await validatePublicUrl(value);
    const browser = await this.browser();
    const page: Page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({ 'accept-language': 'es-ES,es;q=0.9,en-US,en;q=0.8' });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      void this.validateRequest(request.url())
        .then(() => request.continue())
        .catch(() => request.abort('blockedbyclient'));
    });

    const apiResponses: string[] = [];
    const responseHandler = (response: HTTPResponse) => {
      if (!response.url().includes('mtop.aliexpress.pdp.pc.query')) return;
      const contentType = response.headers()['content-type'] || '';
      if (!/json|text/i.test(contentType)) return;
      void response
        .text()
        .then((text) => {
          if (text && text.length > 50) apiResponses.push(text);
        })
        .catch(() => undefined);
    };
    page.on('response', responseHandler);

    try {
      const started = Date.now();
      const deadline = started + timeoutMs;
      try {
        await page.goto(safeUrl.href, { waitUntil: 'domcontentloaded', timeout: Math.min(25_000, timeoutMs) });
      } catch {
        // El challenge puede cancelar la navegación inicial.
      }
      while (
        Date.now() < deadline &&
        !apiResponses.some((text) => /SUCCESS|FAIL_SYS_USER_VALIDATE|RGV587_ERROR/.test(text))
      ) {
        await delay(500);
      }
      let html = '';
      for (let attempt = 0; attempt < 3 && !html; attempt += 1) {
        try {
          html = await page.content();
        } catch {
          await delay(500);
        }
      }
      return { html, finalUrl: page.url(), apiResponses };
    } finally {
      page.off('response', responseHandler);
      await page.close().catch(() => undefined);
    }
  }

  async captureScreenshot(value: string) {
    const safeUrl = await validatePublicUrl(value);
    const browser = await this.browser();
    const context = await browser.createBrowserContext();
    const page: Page = await context.newPage();
    page.setDefaultNavigationTimeout(25_000);
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.setUserAgent(USER_AGENT);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const protocol = (() => { try { return new URL(request.url()).protocol } catch { return '' } })();
      if (['data:', 'blob:', 'about:'].includes(protocol)) {
        void request.continue();
        return;
      }
      if (protocol !== 'http:' && protocol !== 'https:') {
        void request.abort('blockedbyclient');
        return;
      }
      void this.validateRequest(request.url())
        .then(() => request.continue())
        .catch(() => request.abort('blockedbyclient'));
    });

    try {
      await page.goto(safeUrl.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 4_000 }).catch(() => undefined);
      const title = await page.title().catch(() => '');
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 68, encoding: 'base64' });
      return { title: title.trim().slice(0, 300), finalUrl: page.url(), screenshot: `data:image/jpeg;base64,${screenshot}` };
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    const browser = this.browserPromise ? await this.browserPromise.catch(() => null) : null;
    await browser?.close().catch(() => undefined);
    this.browserPromise = null;
  }
}

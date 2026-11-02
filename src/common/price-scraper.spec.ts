import { describe, expect, it } from 'vitest';
import {
  extractAliExpressProductId,
  isAliExpressUrl,
  parseAliExpressApiResponse,
  parseProductHtml,
} from './price-scraper.js';

const productUrl = 'https://es.aliexpress.com/item/1005009801028580.html';

describe('AliExpress price scraper', () => {
  it('recognizes product URLs and extracts the item id', () => {
    expect(isAliExpressUrl(productUrl)).toBe(true);
    expect(isAliExpressUrl('https://notaliexpress.com/item/123.html')).toBe(false);
    expect(extractAliExpressProductId(productUrl)).toBe('1005009801028580');
  });

  it('parses the lowest SKU price, title, image and store from MTOP JSONP', () => {
    const response = `mtopjsonp1(${JSON.stringify({
      ret: ['SUCCESS::调用成功'],
      data: {
        result: {
          PRODUCT_TITLE: { text: 'Consola AYN Thor - AliExpress 44' },
          PRICE: {
            skuIdStrPriceInfoMap: {
              first: { salePriceString: 'CLP 479.990' },
              second: { salePriceString: 'CLP 529.990' },
            },
          },
          HEADER_IMAGE_PC: { imagePathList: ['//images.example.com/item.png'] },
          SHOP_CARD_PC: { storeName: 'AYN Official Store' },
        },
      },
    })});`;

    expect(parseAliExpressApiResponse(response, productUrl)).toMatchObject({
      price: 479990,
      currency: 'CLP',
      imageUrl: 'https://images.example.com/item.png',
      title: 'Consola AYN Thor',
      store: 'AYN Official Store',
      error: null,
    });
  });

  it('keeps title and image metadata when AliExpress returns a verification response', () => {
    const result = parseAliExpressApiResponse(
      'mtopjsonp1({"ret":["FAIL_SYS_USER_VALIDATE"],"data":{}})',
      productUrl,
    );
    const fallback = parseProductHtml(
      '<meta property="og:title" content="Consola - AliExpress 44"><meta property="og:image" content="//images.example.com/item.png">',
      productUrl,
    );

    expect(result.price).toBeNull();
    expect(result.error).toContain('rechazó');
    expect(fallback.title).toBe('Consola');
    expect(fallback.imageUrl).toBe('https://images.example.com/item.png');
  });

  it('reads a localized visible sale price and currency from the rendered PDP HTML', () => {
    const title = 'Consola de Juegos Portátil AYN Thor con Pantalla OLED Dual';
    const html = `<html><body>
      <button aria-label="País y moneda">CLP</button>
      <h1>${title}</h1>
      <span class="price-default--current--example">$519.900</span>
      <span class="price-default--discount--example">-29% dto.</span>
      <span class="price-default--original--example">$742.714</span>
    </body></html>`;

    expect(parseProductHtml(html, productUrl)).toMatchObject({
      price: 519900,
      currency: 'CLP',
      title,
      store: 'AliExpress',
      error: null,
    });
  });

  it('falls back to the price text near the product heading if classes change', () => {
    const title = 'Consola de Juegos Portátil AYN Thor con Pantalla OLED Dual';
    const html = `<html><body>
      <button class="ship-to--text">CLP</button><h1>${title}</h1>
      <div>4.5 · 53 valoraciones · 292 vendido(s) · $519.900 -29% dto. $742.714</div>
    </body></html>`;

    expect(parseProductHtml(html, productUrl)).toMatchObject({
      price: 519900,
      currency: 'CLP',
      title,
      error: null,
    });
  });
});

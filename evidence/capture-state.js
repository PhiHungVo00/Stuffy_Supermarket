// 8.6.2 - Cross-MFE state change: clicking "add to cart" in product-app (remote)
// increments the cart badge rendered by header-app (another remote) in the Host.
// NOTE: the default landing grid uses GraphQL (gateway :4000, not running), so we
// click a category filter first -> ProductList switches to the REST path (:5000)
// and renders product cards with add-to-cart buttons.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:3000';

const readBadge = async (page) =>
  page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Shopping Cart"]');
    if (!btn) return 'NO_CART_BTN';
    const t = (btn.innerText || '').trim();
    return t === '' ? '0' : t;
  });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  // Trigger the REST product path by selecting a category that has stock.
  for (const cat of ['Gaming', 'Audio', 'Laptops', 'Phones']) {
    const c = page.locator(`button:has-text("${cat}")`).first();
    if (await c.count() > 0) { await c.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(6000);

  const addBtn = page.locator(
    'button:has-text("Thêm vào giỏ"), button:has-text("Add to Cart"), button:has-text("Add to cart"), button:has-text("Thêm ngay"), button:has-text("Add now")'
  ).first();
  const found = await addBtn.count();

  const before = await readBadge(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '8.6.2-state-BEFORE-header.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } }).catch(() => {});

  let clicks = 0;
  if (found > 0) {
    for (let k = 0; k < 3; k++) {
      await addBtn.scrollIntoViewIfNeeded().catch(() => {});
      await addBtn.click({ timeout: 5000 }).catch(() => {});
      clicks++;
      await page.waitForTimeout(1200);
    }
  }
  await page.waitForTimeout(1500);
  const after = await readBadge(page);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '8.6.2-state-AFTER-header.png'), clip: { x: 0, y: 0, width: 1440, height: 110 } }).catch(() => {});
  await page.screenshot({ path: path.join(OUT, '8.6.2-state-AFTER-full.png'), fullPage: true });

  fs.writeFileSync(path.join(OUT, 'state-result.json'), JSON.stringify({ found, clicks, badgeBefore: before, badgeAfter: after }, null, 2));
  console.log('[state] found=' + found + ' clicks=' + clicks + ' before=' + before + ' after=' + after);
  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });

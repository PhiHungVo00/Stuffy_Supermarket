// 8.6.2 - State change demo (robust): add a product to cart in product-app,
// then open /cart (cart-app remote) to show the item persisted across MFEs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:3000';

const readBadge = async (page) =>
  page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Shopping Cart"]');
    return btn ? ((btn.innerText || '').trim() || '0') : 'NO_BTN';
  });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(11000);

  const before = await readBadge(page);

  // Click an add-to-cart button on the (GraphQL-loaded) product grid.
  const addBtn = page.locator(
    'button:has-text("Thêm vào giỏ"), button:has-text("Add to Cart"), button:has-text("Add to cart"), button:has-text("Thêm ngay")'
  ).first();
  const found = await addBtn.count();
  if (found > 0) {
    await addBtn.scrollIntoViewIfNeeded().catch(() => {});
    await addBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  const afterAdd = await readBadge(page);

  // Screenshot header (badge) + product area right after adding.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '8.6.2-after-add-full.png'), fullPage: true });

  // Open the cart (cart-app remote) to show the item is there.
  await page.goto(BASE + '/cart', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(7000);
  await page.screenshot({ path: path.join(OUT, '8.6.2-cart-page.png'), fullPage: true });

  const cartText = await page.evaluate(() => (document.body.innerText || '').slice(0, 400));
  fs.writeFileSync(path.join(OUT, 'state2-result.json'), JSON.stringify({ found, badgeBefore: before, badgeAfterAdd: afterAdd, cartTextPreview: cartText }, null, 2));
  console.log('[state2] found=' + found + ' before=' + before + ' afterAdd=' + afterAdd);
  await browser.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });

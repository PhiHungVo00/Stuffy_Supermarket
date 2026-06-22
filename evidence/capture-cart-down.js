// 8.5.3 - Resilience demo: cart-app (port 3003) is DOWN.
// The host shell stays alive; the cart region shows a fallback ("Giỏ hàng đang bảo trì").
const { chromium } = require('playwright');
const path = require('path');
const OUT = __dirname;
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(10000);

  // Home still works even though cart-app is down.
  await page.screenshot({ path: path.join(OUT, '8.5.3-home-still-alive.png'), fullPage: true });
  console.log('[cart-down] saved 8.5.3-home-still-alive.png');

  // Try to reach the cart view: click a cart link/icon, else navigate to /cart.
  let reached = false;
  try {
    const cartLink = page.locator('a[href*="cart" i], a:has-text("Giỏ"), button:has-text("Giỏ"), [aria-label*="cart" i]').first();
    if (await cartLink.count() > 0) {
      await cartLink.click({ timeout: 5000 }).catch(() => {});
      reached = true;
    }
  } catch (e) {}
  if (!reached) {
    await page.goto(BASE + '/cart', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(6000);

  await page.screenshot({ path: path.join(OUT, '8.5.3-cart-fallback.png'), fullPage: true });
  console.log('[cart-down] saved 8.5.3-cart-fallback.png');

  // Capture visible text to confirm fallback message.
  const bodyText = await page.evaluate(() => document.body.innerText || '');
  const hint = bodyText.split('\n').filter(l => /bảo trì|maintenance|lỗi|error|không tải|unavailable/i.test(l));
  console.log('[cart-down] fallback hints:', JSON.stringify(hint.slice(0, 6)));

  await browser.close();
  console.log('[cart-down] DONE');
})().catch((e) => { console.error('ERR', e); process.exit(1); });

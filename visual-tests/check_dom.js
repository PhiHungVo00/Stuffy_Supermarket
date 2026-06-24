const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/');
  
  // Đợi cho các MFE load xong
  console.log('Waiting for Header to load...');
  await page.waitForSelector('header', { timeout: 15000 });
  
  console.log('Getting Header HTML...');
  const headerHtml = await page.$eval('header', el => el.outerHTML);
  console.log('=== HEADER HTML ===');
  console.log(headerHtml);
  console.log('===================');
  
  console.log('Getting ProductList item warning (if any)...');
  const warningCount = await page.$$eval('div', els => {
    return els.map(el => el.outerHTML).filter(html => html.includes('fef2f2') || html.includes('only_left'));
  });
  console.log('=== WARNING BADGES ===');
  console.log(warningCount.slice(0, 3));
  console.log('======================');

  await browser.close();
})();

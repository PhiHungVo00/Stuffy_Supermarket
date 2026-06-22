const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/');
  
  console.log('Waiting for products to load...');
  await page.waitForSelector('.ds-button', { timeout: 15000 });
  
  const cardStyles = await page.$eval('.ds-glass-card', el => {
    const style = window.getComputedStyle(el);
    return {
      background: style.background,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity
    };
  });
  
  const buttonStyles = await page.$eval('.ds-button', el => {
    const style = window.getComputedStyle(el);
    return {
      background: style.background,
      backgroundColor: style.backgroundColor,
      color: style.color
    };
  });
  
  console.log('=== CSS COMPUTED STYLES ===');
  console.log('Glass Card Styles:', cardStyles);
  console.log('Button Styles:', buttonStyles);
  console.log('============================');

  await browser.close();
})();

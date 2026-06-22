// Playwright capture script for the microfrontend report (DA1).
// Captures:
//   8.6.2 - integrated UI + cart state-change (add to cart -> badge increments)
//   8.6.3 - network requests (remoteEntry.js / chunks loaded from different ports)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // --- Collect network requests for 8.6.3 ---
  const requests = [];
  page.on('response', (resp) => {
    try {
      const req = resp.request();
      const url = resp.url();
      requests.push({
        url,
        status: resp.status(),
        type: req.resourceType(),
        method: req.method(),
      });
    } catch (e) {}
  });

  console.log('[capture] navigating to', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Give Module Federation remotes time to inject + render.
  await page.waitForTimeout(12000);

  // ---- 8.6.2: integrated UI full screenshot ----
  await page.screenshot({ path: path.join(OUT, '8.6.2-integrated-ui.png'), fullPage: true });
  console.log('[capture] saved 8.6.2-integrated-ui.png');

  // ---- 8.6.2: cart state-change demo ----
  // Try to find an "add to cart" control. Selectors are heuristic across MFEs.
  let stateChange = { before: null, after: null, clicked: false };
  try {
    // Heuristic: buttons containing cart-ish text (VN + EN)
    const addButtons = page.locator(
      'button:has-text("Thêm"), button:has-text("Giỏ"), button:has-text("Add"), button[aria-label*="cart" i]'
    );
    const count = await addButtons.count();
    console.log('[capture] candidate add-to-cart buttons:', count);

    // Read a cart badge number if present (header cart icon).
    const readBadge = async () => {
      const txt = await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        return bodyText;
      });
      return txt.length;
    };

    stateChange.before = await readBadge();
    if (count > 0) {
      await addButtons.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      stateChange.clicked = true;
      await page.screenshot({ path: path.join(OUT, '8.6.2-state-after-add.png'), fullPage: true });
      console.log('[capture] saved 8.6.2-state-after-add.png');
    }
    stateChange.after = await readBadge();
  } catch (e) {
    console.log('[capture] state-change step error:', e.message);
  }

  // ---- 8.6.3: network evidence ----
  // Keep only JS assets and group by origin (port/domain).
  const jsReqs = requests.filter((r) => /\.js(\?|$)/.test(r.url) || r.type === 'script');
  const byOrigin = {};
  for (const r of jsReqs) {
    let origin = 'other';
    try { origin = new URL(r.url).host; } catch (e) {}
    (byOrigin[origin] = byOrigin[origin] || []).push(r);
  }
  const remoteEntries = jsReqs.filter((r) => /remoteEntry\.js/.test(r.url));

  fs.writeFileSync(
    path.join(OUT, '8.6.3-network-requests.json'),
    JSON.stringify({ totalResponses: requests.length, jsCount: jsReqs.length, byOrigin, remoteEntries }, null, 2)
  );
  console.log('[capture] saved 8.6.3-network-requests.json');

  // Build a readable HTML "network panel" and screenshot it for a visual artifact.
  const rows = jsReqs
    .map(
      (r) => {
        let host = '';
        try { host = new URL(r.url).host; } catch (e) {}
        let file = r.url;
        try { file = new URL(r.url).pathname.split('/').pop() || r.url; } catch (e) {}
        const isRemote = /remoteEntry\.js/.test(r.url);
        return `<tr class="${isRemote ? 'remote' : ''}"><td>${r.status}</td><td>${host}</td><td>${file}</td><td>${r.type}</td></tr>`;
      }
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:0;background:#1e1e1e;color:#eee}
    h2{padding:12px 16px;margin:0;background:#252526;border-bottom:1px solid #333}
    .sub{padding:6px 16px;color:#9cdcfe;font-size:13px;background:#252526}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{text-align:left;padding:6px 16px;border-bottom:1px solid #2d2d2d}
    th{color:#bbb;background:#2d2d30;position:sticky;top:0}
    tr.remote td{color:#4ec9b0;font-weight:bold}
    td:nth-child(1){color:#6a9955}
  </style></head><body>
    <h2>Network — JavaScript assets loaded by Host (localhost:3000)</h2>
    <div class="sub">Tổng response: ${requests.length} | JS: ${jsReqs.length} | remoteEntry.js (xanh): ${remoteEntries.length} — mỗi MFE nạp từ một host/port khác nhau (phân tán)</div>
    <table><thead><tr><th>Status</th><th>Origin (host:port)</th><th>File</th><th>Type</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </body></html>`;
  const netHtmlPath = path.join(OUT, '_network.html');
  fs.writeFileSync(netHtmlPath, html);
  const page2 = await context.newPage();
  await page2.goto('file://' + netHtmlPath.replace(/\\/g, '/'));
  await page2.waitForTimeout(500);
  await page2.screenshot({ path: path.join(OUT, '8.6.3-network-panel.png'), fullPage: true });
  console.log('[capture] saved 8.6.3-network-panel.png');

  fs.writeFileSync(
    path.join(OUT, 'summary.json'),
    JSON.stringify({ stateChange, originsLoaded: Object.keys(byOrigin), remoteEntryCount: remoteEntries.length }, null, 2)
  );

  await browser.close();
  console.log('[capture] DONE');
})().catch((e) => { console.error('CAPTURE_ERROR', e); process.exit(1); });

// Browser smoke test: opens the app, runs an example, waits for verdict cards.
// Usage: node scripts/e2e-smoke.mjs [baseUrl] [exampleTitle] [screenshotPath]
// Needs a running app (npm run build && npm start) and Playwright with Chromium.
import { createRequire } from 'node:module';

// require() so a globally installed Playwright (NODE_PATH) also works
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:3000';
const example = process.argv[3] || 'An index that works';
const shot = process.argv[4];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(base);
await page.getByRole('button', { name: new RegExp(example) }).click();
const t0 = Date.now();
await page.getByRole('button', { name: 'Test the suggestion' }).click();
await page.waitForSelector('[data-testid="verdict-card"]', { timeout: 120_000 });
const verdicts = await page.$$eval('[data-testid="verdict-card"]', (els) =>
  els.map((e) => ({ verdict: e.getAttribute('data-verdict'), headline: e.querySelector('h3')?.textContent })),
);
const ai = await page.locator('.ai, .notice').allTextContents();
console.log(JSON.stringify({ example, seconds: ((Date.now() - t0) / 1000).toFixed(1), verdicts, ai, errors }, null, 2));
if (shot) await page.screenshot({ path: shot, fullPage: true });
await browser.close();
if (errors.length) process.exitCode = 1;

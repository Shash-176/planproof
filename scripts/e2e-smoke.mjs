// Browser smoke test for a running PlanProof build.
//
//   node scripts/e2e-smoke.mjs [baseUrl] [exampleTitle|--demo|--runaway] [screenshot.png] [--mobile]
//
// Clicks an example (or the hero "Run the demo" button), waits for verdict
// cards, and prints verdicts plus any console errors (including CSP
// violations) as JSON. --runaway pastes a deliberately slow query with a 3 s
// watchdog limit and expects PlanProof to stop it.
// Needs Playwright with Chromium (a global install works via NODE_PATH).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const pos = args.filter((a) => a !== '--mobile');
const base = pos[0] || 'http://127.0.0.1:3000';
const target = pos[1] || '--demo';
const shot = pos[2];

const browser = await chromium.launch();
const context = mobile ? await browser.newContext({ ...devices['iPhone 13'] }) : await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: shot ? 2 : 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const t0 = Date.now();
let out;
if (target === '--runaway') {
  await page.goto(`${base}/?dbStepLimitMs=3000`);
  await page.getByLabel('The slow query').fill('SELECT count(*) FROM orders a CROSS JOIN orders b');
  await page.getByLabel('What your AI suggested').fill('CREATE INDEX ON orders (status);');
  await page.getByRole('button', { name: 'Test the suggestion' }).click();
  const alert = page.locator('.callout-bad[role="alert"]');
  await alert.waitFor({ timeout: 90_000 });
  out = { target, seconds: ((Date.now() - t0) / 1000).toFixed(1), alert: (await alert.textContent())?.slice(0, 200), errors };
} else {
  await page.goto(base);
  if (target === '--demo') await page.getByRole('button', { name: 'Run the demo' }).click();
  else await page.getByRole('button', { name: `Run example: ${target}` }).click();
  await page.waitForSelector('[data-testid="verdict-card"]', { timeout: 120_000 });
  const verdicts = await page.$$eval('[data-testid="verdict-card"]', (els) => els.map((e) => ({ verdict: e.getAttribute('data-verdict'), headline: e.querySelector('h3')?.textContent })));
  const ai = await page.locator('.ai, .callout').allTextContents();
  out = { target, seconds: ((Date.now() - t0) / 1000).toFixed(1), verdicts, ai: ai.map((t) => t.slice(0, 160)), errors };
}
if (shot) {
  await page.evaluate(() => document.querySelector('#results-h')?.scrollIntoView());
  await page.screenshot({ path: shot, fullPage: true });
}
console.log(JSON.stringify(out, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;

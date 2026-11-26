const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4102';
const output = path.resolve(process.env.EVIDENCE_DIR || path.join(__dirname, 'assets'));
const action = (surface, name) => surface.getByRole('button', { name, exact: true })
  .or(surface.getByRole('link', { name, exact: true }));

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const evidence = { id: '06', status: 'PASS', baseURL, startedAt: new Date().toISOString(),
    browser: browser.version(), revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: __dirname, encoding: 'utf8' }).trim(),
    inputs: { product: 'Hummingbird cart t-shirt', size: 'M', color: 'White', quantityPerClick: 1 } };
  const capture = filename => page.screenshot({ path: path.join(output, filename), fullPage: true });
  const success = page.getByRole('dialog', { name: 'Product successfully added to your shopping cart', exact: true });
  try {
    await page.goto(baseURL);
    const navigation = page.getByRole('navigation', { name: 'Global navigation', exact: true });
    evidence.initialCart = await action(navigation, 'Cart').innerText();
    assert.match(evidence.initialCart, /\b0\b/);
    await action(navigation, 'CLOTHES').hover();
    await action(navigation, 'Men').click();
    const product = page.getByRole('region', { name: `Product ${evidence.inputs.product}`, exact: true });
    await action(product, evidence.inputs.product).click();
    assert.equal(await page.getByLabel('Quantity', { exact: true }).inputValue(), '1');
    await action(page, 'Add to cart').click();
    await success.waitFor();
    evidence.firstCart = await action(navigation, 'Cart').innerText();
    assert.match(evidence.firstCart, /\b1\b/);
    await capture('06-first-add.png');
    await action(success, 'Continue shopping').click();
    await action(page, 'Add to cart').click();
    await success.waitFor();
    evidence.secondCart = await action(navigation, 'Cart').innerText();
    await capture('06-second-add.png');
    await action(success, 'Proceed to checkout').click();
    await page.getByRole('heading', { name: 'Shopping cart', exact: true }).waitFor();
    await page.reload();
    const row = page.getByRole('row', { name: evidence.inputs.product, exact: true });
    await row.waitFor();
    evidence.quantity = await row.getByRole('spinbutton').inputValue();
    evidence.row = await row.innerText();
    evidence.summary = await page.getByRole('region', { name: 'Cart summary', exact: true }).innerText();
    await capture('06-cart-reloaded.png');
    const expectedControl = String(Number(evidence.quantity) + 1);
    const updated = page.waitForResponse(response => response.request().method() === 'PATCH'
      && response.url().includes('/api/cart/items/'));
    await action(row, 'Increase quantity').click();
    await updated;
    await page.waitForFunction(expected => document.querySelector('input[aria-label="Quantity"]')?.value === expected,
      expectedControl);
    evidence.controlQuantity = await row.getByRole('spinbutton').inputValue();
    evidence.controlSummary = await page.getByRole('region', { name: 'Cart summary', exact: true }).innerText();
    await capture('06-increase-control.png');
    assert.equal(evidence.controlQuantity, expectedControl);
    evidence.expected = 'Two successful Add to cart actions of one unit each leave quantity 2, subtotal 50, total 55.';
    assert.equal(evidence.quantity, '2', 'Adding one more identical variant kept the quantity at 1.');
  } catch (error) {
    evidence.status = error instanceof assert.AssertionError && evidence.expected ? 'FAIL' : 'ERROR';
    evidence.message = error.message;
    if (evidence.status === 'ERROR') await capture('06-error.png').catch(() => {});
  } finally {
    await context.close();
    await browser.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n');
  }
  console.log(`${evidence.status} 06 ${evidence.message || ''}`);
  process.exitCode = evidence.status === 'PASS' ? 0 : 1;
}

main().catch(error => { console.error(error); process.exitCode = 2; });

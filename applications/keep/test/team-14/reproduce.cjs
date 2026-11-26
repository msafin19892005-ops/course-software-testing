const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4101';
const output = path.resolve(process.env.EVIDENCE_DIR || path.join(__dirname, 'assets'));
const button = (surface, name) => surface.getByRole('button', { name, exact: true });
const note = (page, title) => page.getByRole('region', { name: title, exact: true });

async function create(page, title, content) {
  await button(page, 'Take a note').click();
  const editor = page.getByRole('dialog', { name: 'Note editor', exact: true });
  await editor.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await editor.getByRole('textbox', { name: 'Content', exact: true }).fill(content);
  await button(editor, 'Close').click();
  await note(page, title).waitFor();
}

async function capture(page, filename) {
  await page.screenshot({ path: path.join(output, filename), fullPage: true });
}

async function highlight(page, evidence, context, suffix) {
  const title = `Study schedule Team14-${suffix}`;
  const content = 'SQL Review\nFinish SQL exercises';
  evidence.inputs = { title, content, query: 'sql' };
  await create(page, title, content);
  evidence.before = await note(page, title).locator('.note-content').innerText();
  assert.equal(evidence.before, content);
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('sql');
  const target = note(page, title);
  await target.waitFor();
  evidence.fragments = await target.getByRole('region', { name: 'Highlight sql', exact: true }).allTextContents();
  evidence.during = await target.locator('.note-content').innerText();
  await capture(page, '04-search.png');
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('');
  evidence.after = await target.locator('.note-content').innerText();
  await capture(page, '04-original.png');
  assert.equal(evidence.after, content);
  evidence.expected = 'Case-insensitive search highlights the original SQL fragments and preserves displayed note content.';
  assert.equal(evidence.during, content, 'Searching rewrote the displayed uppercase SQL fragments to the lowercase query.');
}

async function staleWorkspace(page, evidence, context, suffix) {
  const firstTitle = `Persistent note Team14-${suffix}-B`;
  const secondTitle = `New note Team14-${suffix}-A`;
  evidence.inputs = { firstTitle, secondTitle };
  // Both pages load the same workspace before either note is created.
  const other = await context.newPage();
  await other.goto(baseURL);
  await button(other, 'Take a note').waitFor();
  await create(other, firstTitle, 'B saved first');
  await other.reload();
  await note(other, firstTitle).waitFor();
  evidence.firstPersistedBefore = await note(other, firstTitle).count();
  await capture(other, '05-b-persisted.png');
  await create(page, secondTitle, 'A saved second');
  await page.reload();
  await button(page, 'Take a note').waitFor();
  evidence.firstAfter = await note(page, firstTitle).count();
  evidence.secondAfter = await note(page, secondTitle).count();
  await capture(page, '05-after-second-save.png');
  // Reopen B's existing page to distinguish a stale display from lost storage.
  await other.reload();
  await button(other, 'Take a note').waitFor();
  evidence.firstAfterOtherReload = await note(other, firstTitle).count();
  await capture(other, '05-b-reloaded.png');
  await other.close();
  evidence.expected = 'Both separately created and saved notes survive reload in the same application instance.';
  assert.equal(evidence.firstAfter, 1, 'Creating another note in an older tab erased the already-persisted note.');
  assert.equal(evidence.firstAfterOtherReload, 1);
  assert.equal(evidence.secondAfter, 1);
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const report = { baseURL, startedAt: new Date().toISOString(), browser: browser.version(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim(), cases: [] };
  try {
    for (const [id, run] of [['04', highlight], ['05', staleWorkspace]]) {
      if (process.argv[2] && process.argv[2] !== id) continue;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const evidence = { id, status: 'PASS' };
      try {
        await page.goto(baseURL);
        await button(page, 'Take a note').waitFor();
        await run(page, evidence, context, `${Date.now()}-${id}`);
      } catch (error) {
        evidence.status = error instanceof assert.AssertionError && evidence.expected ? 'FAIL' : 'ERROR';
        evidence.message = error.message;
        if (evidence.status === 'ERROR') await capture(page, `${id}-error.png`).catch(() => {});
      } finally {
        report.cases.push(evidence);
        console.log(`${evidence.status} ${id} ${evidence.message || ''}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  }
  assert.ok(report.cases.length, 'Select case 04 or 05.');
  process.exitCode = report.cases.some(result => result.status !== 'PASS') ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });

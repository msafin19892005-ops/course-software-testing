const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const output = path.resolve(process.env.EVIDENCE_DIR || path.join(__dirname, 'assets'));
const selectedCase = process.argv[2];
const password = 'Password123!';
const button = (surface, name) => surface.getByRole('button', { name, exact: true });
const link = (surface, name) => surface.getByRole('link', { name, exact: true });
const field = (surface, name) => surface.getByLabel(name, { exact: true });
const passengerTable = page => page.getByRole('table', { name: 'My passengers', exact: true });
const confirmDialog = page => page.getByRole('dialog', {
  name: 'Please confirm the following information.', exact: true,
});

// Observe the application's own requests while every state change uses its UI.
async function submit(page, action, control) {
  const responsePromise = page.waitForResponse(response => {
    if (!response.url().endsWith('/api') || response.request().method() !== 'POST') return false;
    return response.request().postDataJSON().action === action;
  });
  await control.click();
  const response = await responsePromise;
  return { status: response.status(), body: await response.json() };
}

function passport() {
  return 'P14' + crypto.randomInt(100000, 1000000);
}

async function freshAccount(page, caseId) {
  const username = `team14_${caseId}_${crypto.randomBytes(5).toString('hex')}`;
  const identity = { username, passport: passport(), password };
  await page.goto(baseURL);
  await link(page, 'Register').click();
  await field(page, 'Nationality').selectOption({ label: 'China' });
  const values = {
    Name: 'Team14 Account', 'Passport number': identity.passport,
    'Passport expiration date': '2030-12-31', 'Date of birth': '1995-01-01',
    Username: username, 'Email address': `${username}@example.com`,
    Password: password, 'Confirm Password': password,
  };
  for (const [name, value] of Object.entries(values)) await field(page, name).fill(value);
  await page.getByRole('radio', { name: 'Male', exact: true }).check();
  await page.getByRole('checkbox').check();
  const registration = await submit(page, 'register', button(page, 'Register'));
  assert.equal(registration.status, 200, JSON.stringify(registration.body));
  await page.getByText('Registration successful.', { exact: true }).waitFor();
  await link(page, 'Login').click();
  await page.getByPlaceholder('Email/Username/Mobile number', { exact: true }).fill(username);
  await page.getByPlaceholder('Password', { exact: true }).fill(password);
  await submit(page, 'login', button(page, 'LOGIN'));
  await link(page, 'Sign Out').waitFor();
  return identity;
}

async function passengers(page) {
  await link(page, 'My 12306').click();
  const menu = page.getByRole('navigation', { name: 'Personal center menu', exact: true });
  await link(menu, 'Information management').click();
  await passengerTable(page).waitFor();
}

async function addPassenger(page, name, id, mobile = '13800000043') {
  await button(page, 'Add new passengers').click();
  const dialog = page.getByRole('dialog', { name: 'Add new passengers', exact: true });
  await field(dialog, 'Nationality').selectOption({ label: 'China' });
  const values = {
    Name: name, 'Passport number': id, 'Passport expiration date': '2028-12-31',
    'Date of birth': '1999-02-20', 'Email address': 'team14.passenger@example.com',
    'Mobile number': mobile,
  };
  for (const [label, value] of Object.entries(values)) await field(dialog, label).fill(value);
  await dialog.getByRole('radio', { name: 'Male', exact: true }).check();
  await field(dialog, 'Passenger type').selectOption({ label: 'Adult' });
  const result = await submit(page, 'passenger_add', button(dialog, 'Determine'));
  if (result.status === 200) {
    await dialog.waitFor({ state: 'hidden' });
    await passengerTable(page).waitFor();
  } else {
    await dialog.getByText(result.body.error, { exact: true }).waitFor();
  }
  return result;
}

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(output, name), fullPage: true });
}

async function passengerRows(page) {
  return passengerTable(page).getByRole('row').filter({
    has: page.getByRole('button', { name: 'Delete', exact: true }),
  }).allTextContents();
}

async function sameName(page, evidence) {
  evidence.account = await freshAccount(page, '01');
  await passengers(page);
  const first = passport();
  let second = passport();
  while (second === first) second = passport();
  evidence.inputs = { name: 'Team14 Same Name', first, second };
  const initial = await addPassenger(page, evidence.inputs.name, first);
  assert.equal(initial.status, 200);
  evidence.before = await passengerRows(page);
  assert.equal(evidence.before.filter(row => row.includes(first)).length, 1);
  await screenshot(page, '01-before.png');
  const added = await addPassenger(page, evidence.inputs.name, second);
  assert.equal(added.status, 200, JSON.stringify(added.body));
  await page.reload();
  await passengerTable(page).waitFor();
  evidence.after = await passengerRows(page);
  await screenshot(page, '01-after.png');
  evidence.expected = 'Both distinct passports remain as separate persistent passenger rows.';
  assert.equal(evidence.after.filter(row => row.includes(first)).length, 1,
    'The first passenger disappeared after adding another passenger with the same name.');
  assert.equal(evidence.after.filter(row => row.includes(second)).length, 1);
}

async function duplicatePassport(page, evidence) {
  evidence.account = await freshAccount(page, '02');
  await passengers(page);
  const id = passport();
  evidence.inputs = { name: 'Team14 Duplicate', passport: id,
    originalMobile: '13800000043', attemptedMobile: '13800000044' };
  const initial = await addPassenger(page, evidence.inputs.name, id);
  assert.equal(initial.status, 200);
  evidence.before = await passengerRows(page);
  await screenshot(page, '02-before.png');
  // Change only the name first to exercise the existing duplicate-rejection path.
  evidence.control = await addPassenger(page, 'Team14 Different Name', id, '13800000044');
  assert.equal(evidence.control.body.error, 'Passport number already exists.');
  await button(page.getByRole('dialog', { name: 'Add new passengers', exact: true }), 'Cancel').click();
  evidence.duplicate = await addPassenger(page, evidence.inputs.name, id, '13800000044');
  evidence.dialogVisible = await page.getByRole('dialog', { name: 'Add new passengers', exact: true }).isVisible();
  await screenshot(page, '02-submit.png');
  await page.reload();
  await passengerTable(page).waitFor();
  evidence.after = await passengerRows(page);
  await screenshot(page, '02-after.png');
  evidence.expected = 'Duplicate passport is rejected, form remains, original mobile remains unchanged.';
  assert.equal(evidence.duplicate.body.error, 'Passport number already exists.',
    'An identical name bypassed the duplicate-passport error and updated the existing passenger.');
  assert.equal(evidence.dialogVisible, true);
  assert.ok(evidence.after.some(row => row.includes('13800000043')));
}

async function openBooking(page) {
  const nav = page.getByRole('navigation').filter({ has: link(page, 'Home') });
  await link(nav, 'Home').click();
  for (const [name, query, option] of [
    ['From', 'shang', 'Shanghai (上海)'], ['To', 'bei', 'Beijing (北京)'],
  ]) {
    await page.getByPlaceholder(name, { exact: true }).fill(query);
    await button(page, option).click();
  }
  await field(page, 'Date').click();
  await button(page, '2026-07-22').click();
  await button(page, 'Search').click();
  const row = page.getByRole('row').filter({ has: page.getByText('G1001', { exact: true }) });
  await button(row, 'Book').click();
  await page.getByRole('heading', { name: 'Train Information:', exact: true }).waitFor();
}

async function staleInventory(page, evidence, context) {
  evidence.account = await freshAccount(page, '03');
  await passengers(page);
  const id = passport();
  let lockingPassport = passport();
  while (lockingPassport === id) lockingPassport = passport();
  evidence.inputs = { name: 'Team14 Waiting', passport: id,
    lockingName: 'Team14 Locking', lockingPassport,
    train: 'G1001', date: '2026-07-22', ticketClass: 'Business-class seat' };
  assert.equal((await addPassenger(page, evidence.inputs.name, id)).status, 200);
  assert.equal((await addPassenger(page, evidence.inputs.lockingName, lockingPassport)).status, 200);
  await openBooking(page);
  await page.getByRole('checkbox', { name: evidence.inputs.name, exact: true }).check();
  evidence.initialFare = await page.getByRole('region', { name: 'Train Information', exact: true }).innerText();
  assert.match(evidence.initialFare, /business-class seat .*1 left/);
  await screenshot(page, '03-tab-a-before.png');
  const other = await context.newPage();
  await other.goto(baseURL);
  await link(other, 'Sign Out').waitFor();
  await openBooking(other);
  await other.getByRole('checkbox', { name: evidence.inputs.lockingName, exact: true }).check();
  await button(other, 'Place order').click();
  const created = await submit(other, 'create_order', button(confirmDialog(other), 'Confirm'));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  await other.getByRole('region', { name: 'Payment information', exact: true }).waitFor();
  evidence.lockingOrder = created.body.order;
  await screenshot(other, '03-tab-b-locked.png');
  try {
    // Reload only tab B to observe current inventory without refreshing tab A.
    await openBooking(other);
    evidence.currentFare = await other.getByRole('region', { name: 'Train Information', exact: true }).innerText();
    assert.match(evidence.currentFare, /business-class seat .*None left/);
    await screenshot(other, '03-tab-b-no-seats.png');
    await button(page, 'Place order').click();
    // Either valid rejection feedback or the faulty confirmation must appear.
    await confirmDialog(page).or(page.getByText(
      'Sorry, there are no tickets available for the selected ticket class.', { exact: true },
    )).waitFor();
    evidence.confirmationOpened = await confirmDialog(page).isVisible();
    evidence.oldTabText = await page.locator('body').innerText();
    await screenshot(page, '03-tab-a-stale-confirmation.png');
    if (evidence.confirmationOpened) {
      // The server's later validation is recorded separately from Place order.
      evidence.confirmAttempt = await submit(page, 'create_order', button(confirmDialog(page), 'Confirm'));
      await page.getByText('Sorry, there are no tickets available for the selected ticket class.', { exact: true }).waitFor();
      await screenshot(page, '03-confirm-rejected-late.png');
    }
  } finally {
    // Return to the created payment through the normal order-center UI and cancel.
    await link(other, 'My 12306').click();
    await link(other.getByRole('navigation', { name: 'Personal center menu', exact: true }), 'Ticket orders').click();
    const order = other.getByRole('row').filter({ hasText: evidence.lockingOrder.order_no });
    await button(order, 'Pay').click();
    evidence.cleanup = await submit(other, 'cancel_order', button(other, 'Cancel'));
    assert.equal(evidence.cleanup.body.order.status, 'cancelled');
    await other.close();
  }
  evidence.expected = 'Place order rejects the now sold-out class without opening confirmation.';
  assert.equal(evidence.confirmationOpened, false,
    'The old tab opened confirmation for a class whose only seat was already locked.');
}

async function impossibleDate(page, evidence) {
  const dates = ['2026-07-31', '2026-08-01', '2026-07-32'];
  evidence.searches = [];
  for (const date of dates) {
    await page.goto(baseURL);
    await field(page, 'From').fill('Shanghai');
    await field(page, 'To').fill('Beijing');
    await field(page, 'Date').fill(date);
    await button(page, 'Search').click();
    const results = page.getByRole('region', { name: 'Travel dates', exact: true });
    const error = page.getByRole('alert');
    await results.or(error).waitFor();
    const observation = { date, resultsOpened: await results.isVisible(),
      displayedDate: await field(page, 'Date').inputValue(),
      message: await error.isVisible() ? await error.innerText() : null };
    evidence.searches.push(observation);
    if (date !== dates[2]) {
      assert.ok(observation.resultsOpened && observation.displayedDate === date, 'Valid date control failed.');
    }
  }
  await screenshot(page, '04-july-32.png');
  evidence.expected = 'Search rejects a nonexistent date before displaying train results.';
  assert.equal(evidence.searches[2].resultsOpened, false, 'Search opened results for July 32.');
}

async function popularStations(page, evidence) {
  await page.goto(baseURL);
  const from = field(page, 'From');
  await from.fill('');
  const selector = page.getByRole('dialog', { name: 'From station selector' });
  const tab = name => selector.getByRole('tab', { name, exact: true });
  const beijing = button(selector, 'Beijing (北京)');
  await tab('ABCDE').click();
  await beijing.click();
  assert.equal(await from.inputValue(), 'Beijing');
  await from.fill('');
  await tab('Popular').click();
  assert.equal(await tab('Popular').getAttribute('aria-selected'), 'true');
  evidence.popular = await selector.innerText();
  evidence.beijingButtons = await beijing.count();
  await screenshot(page, '05-popular.png');
  evidence.expected = 'Beijing can be selected from Popular and fills From with Beijing.';
  assert.equal(evidence.beijingButtons, 1, 'The Popular tab has no selectable Beijing.');
  await beijing.click();
  assert.equal(await from.inputValue(), 'Beijing');
}

async function registrationCalendars(page, evidence) {
  await page.goto(baseURL);
  await link(page, 'Register').click();
  await field(page, 'Nationality').waitFor();
  const body = page.locator('body');
  const snapshot = async () => (await body.ariaSnapshot()).replaceAll(' [active]', '');
  evidence.fields = [];
  for (const [label, file] of [['Passport expiration date', 'expiry'], ['Date of birth', 'birth']]) {
    await field(page, 'Name').click();
    const before = await snapshot();
    const input = field(page, label);
    await input.click();
    const container = input.locator('..');
    const observation = { label, inputType: await input.getAttribute('type'),
      fieldMarkup: await container.innerHTML(), newAccessibleContent: (await snapshot()) !== before };
    evidence.fields.push(observation);
    await screenshot(page, '06-' + file + '.png');
    if (observation.inputType === 'date') {
      await input.press('Alt+ArrowDown');
      await input.press('Enter');
      observation.selectedDate = await input.inputValue();
    } else if (observation.newAccessibleContent) {
      const day = page.getByRole('button', { name: /^(?:15|\d{4}-\d{2}-15)$/ }).first();
      if (await day.isVisible() && await day.isEnabled()) {
        await day.click();
        observation.selectedDate = await input.inputValue();
      }
    }
  }
  // Diagnose the observed plain-text implementation. A changed widget needs a
  // fresh interaction check before this test can classify its selection behavior.
  const plainFields = evidence.fields.filter(f => f.inputType === 'text' && !f.newAccessibleContent &&
    !/<(?:button|select|svg|img)\b|role=["'](?:button|dialog|grid)|aria-haspopup/i.test(f.fieldMarkup));
  if (!plainFields.length && evidence.fields.some(f => !f.selectedDate)) {
    throw new Error('Calendar controls changed. Verify both date selections using the manual procedure.');
  }
  evidence.expected = 'Both registration dates can be chosen using a date picker.';
  assert.deepEqual(plainFields.map(f => f.label), [], 'Clicking the plain date inputs exposed no date choice.');
}

async function main() {
  const cases = [['01', sameName], ['02', duplicatePassport], ['03', staleInventory],
    ['04', impossibleDate], ['05', popularStations], ['06', registrationCalendars]];
  if (selectedCase && !cases.some(([id]) => id === selectedCase)) {
    throw new Error('Select a case from 01 through 06, or omit the argument to run all cases.');
  }
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const report = { baseURL, startedAt: new Date().toISOString(), browser: browser.version(), cases: [] };
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
  try {
    for (const [id, run] of cases) {
      if (selectedCase && id !== selectedCase) continue;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const evidence = { id, status: 'PASS' };
      try {
        await run(page, evidence, context);
      } catch (error) {
        evidence.status = error instanceof assert.AssertionError && evidence.expected ? 'FAIL' : 'ERROR';
        evidence.message = error.message;
        if (evidence.status === 'ERROR') await screenshot(page, `${id}-error.png`).catch(() => {});
      } finally {
        report.cases.push(evidence);
        console.log(`${evidence.status} ${id}${evidence.message ? ' ' + evidence.message : ''}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`Evidence saved to ${output}`);
  process.exitCode = report.cases.some(result => result.status !== 'PASS') ? 1 : 0;
}

main().catch(error => { console.error(error); process.exitCode = 2; });

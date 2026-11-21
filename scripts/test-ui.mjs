// Headless UI smoke test (run `npm run build` first). Usage: node scripts/test-ui.mjs [outDir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? '/tmp/shots';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 850, height: 390 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const txt = async (sel) => (await page.locator(sel).first().innerText().catch(() => ''));
try {
  await page.goto('http://localhost:4173/');
  await page.getByText('New Career').first().click();
  await page.waitForSelector('text=Select your club');
  await shot('01-select');
  await page.getByRole('button', { name: 'Champ.' }).click();
  await page.getByRole('button', { name: 'Premier' }).click();
  await page.getByText('Begin Career').click();
  await page.waitForSelector('nav');
  // Inbox is the first menu item and the landing screen
  const first = await txt('nav button');
  ok(/Inbox/.test(first), 'Inbox is first in the menu');
  await shot('02-inbox');
  const unread0 = parseInt((await txt('header button.btn-primary')).match(/\((\d+)\)/)?.[1] ?? '0', 10);
  ok(unread0 >= 3, `primary button reads NEXT MESSAGE (${unread0}) on the Inbox`);
  await page.locator('header button.btn-primary').first().click();
  await page.waitForTimeout(300);
  const unread1 = parseInt((await txt('header button.btn-primary')).match(/\((\d+)\)/)?.[1] ?? '0', 10);
  ok(unread1 === unread0 - 1, `advance button read a message (${unread0} -> ${unread1})`);
  ok(/Welcome to/.test(await page.locator('.font-bold.text-sm').first().innerText()), 'oldest message opened');
  const dateBefore = await txt('header .font-bold');
  await shot('03-inbox-read');
  // read all remaining: date must not change while messages are unread
  for (let i = 0; i < unread1; i++) await page.locator('header button.btn-primary').first().click();
  await page.waitForTimeout(300);
  ok((await txt('header .font-bold')) === dateBefore, 'date did not advance while reading messages');
  ok(/CONTINUE/.test(await txt('header button.btn-primary')), 'button becomes CONTINUE once inbox is read');
  // Home is simplified
  await page.getByRole('button', { name: 'Home' }).first().click();
  await page.waitForTimeout(200); await shot('04-home');
  // Calendar
  await page.getByRole('button', { name: 'Calendar' }).first().click();
  await page.waitForTimeout(200); await shot('05-calendar-month');
  await page.getByRole('button', { name: 'week', exact: true }).click(); await shot('06-calendar-week');
  await page.getByRole('button', { name: 'day', exact: true }).click(); await shot('07-calendar-day');
  // Advance time
  await page.locator('header button.btn-primary').first().click();
  await page.waitForTimeout(1500);
  const d1 = await txt('header .font-bold');
  ok(d1 !== dateBefore, `CONTINUE advanced the date (${dateBefore} -> ${d1})`);
  // Walk through screens
  for (const [grp, tabs] of [['Squad', ['Players', 'Tactics', 'Training', 'Medical', 'Academy']], ['Leagues', ['League', 'Fixtures', 'Cup', 'Stats']], ['World', ['International', 'News', 'Records']], ['Transfers', ['Market', 'Scouting']], ['Club', ['Overview', 'Board', 'Finances', 'Stadium', 'Facilities', 'Staff', 'History']], ['Manager', ['Career', 'Media']]]) {
    await page.locator('nav').getByText(grp, { exact: true }).click();
    for (const t of tabs) { await page.getByRole('button', { name: t, exact: true }).first().click(); await page.waitForTimeout(150); await shot(`10-${grp}-${t}`); }
  }
  await page.locator('nav').getByText('Squad', { exact: true }).click();
  await page.getByRole('button', { name: 'Tactics', exact: true }).first().click();
  for (const t of ['Instructions', 'Roles', 'Lineup']) { await page.getByRole('button', { name: t, exact: true }).first().click(); await page.waitForTimeout(150); await shot(`12-tactics-${t}`); }
  // Play until first match day and simulate
  await page.locator('nav').getByText('Home', { exact: true }).click();
  let sim = false;
  for (let i = 0; i < 40 && !sim; i++) {
    const label = await txt('header button.btn-primary');
    if (/SIMULATE MATCH/.test(label)) { sim = true; break; }
    await page.locator('header button.btn-primary').first().click();
    await page.waitForTimeout(700);
    const dlg = page.getByRole('button', { name: 'Auto-fix and play' });
    if (await dlg.count()) await dlg.click();
  }
  ok(sim, 'reached match day with SIMULATE MATCH button');
  await shot('20-matchday');
  await page.locator('header button.btn-primary').first().click();
  await page.waitForSelector('text=Full time', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500); await shot('21-report');
  ok(await page.getByText(/Full time/).count() > 0, 'match report opens after SIMULATE MATCH');
  await page.getByRole('button', { name: 'Close' }).first().click();
  ok(/CONTINUE/.test(await txt('header button.btn-primary')), 'after the match the button returns to CONTINUE');
  // Persistence: reload and continue the career
  await page.reload();
  await page.getByText('Continue Career').first().click();
  await page.waitForSelector('nav');
  ok(/Aug|Sep/.test(await txt('header .font-bold')), 'career restored after reload with a date');
  const mid = await txt('header .font-bold');
  console.log('date after reload:', mid);
} catch (e) { fails++; console.log('EXCEPTION', e); await shot('99-error'); }
const real = errors.filter((e) => !/favicon|net::ERR/.test(e));
ok(real.length === 0, `no console errors ${real.slice(0, 3).join(' | ')}`);
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

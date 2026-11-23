// Headless UI test for settings, menu, quick-sim, club editor and age field. Run `npm run build` first.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const out = process.argv[2] ?? '/tmp/shots2';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  :', m); };
const srv = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 850, height: 390 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
const txt = async (sel) => (await page.locator(sel).first().innerText().catch(() => ''));
try {
  await page.goto('http://localhost:4174/');
  // settings from the title screen
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await page.getByRole('button', { name: 'Large', exact: true }).click();
  ok(await page.evaluate(() => document.documentElement.dataset.theme === 'light' && getComputedStyle(document.documentElement).getPropertyValue('--z').trim() === '1.15'), 'light theme + large text applied');
  await shot('u1-settings-light');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByText('New Career').first().click();
  // age field: typing a 2-digit number works
  const age = page.locator('input[inputmode="numeric"]');
  await age.click(); await age.fill('');
  await age.pressSequentially('58');
  ok((await age.inputValue()) === '58', 'age can be typed (58)');
  await age.fill('9'); await page.locator('input').first().click();
  ok((await age.inputValue()) === '30', 'age below 30 clamps to 30 on leaving the box');
  await page.getByRole('button', { name: 'Choose a club' }).click();
  await page.getByRole('button', { name: 'Champ.' }).click();
  await page.getByRole('button', { name: 'Premier' }).click();
  await page.getByText('Begin Career').click();
  await page.waitForSelector('nav');
  await shot('u2-ingame-light-large');
  // back to dark/normal + colour-blind for the rest
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: 'Extra large' }).click();
  await shot('u3-xl');
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await page.getByRole('button', { name: 'On', exact: true }).first().click();
  ok(await page.evaluate(() => document.documentElement.dataset.cb === '1'), 'colour-blind palette applied');
  await page.getByRole('button', { name: 'Close' }).click();
  await shot('u4-menu');
  // quick-sim a month
  await page.getByRole('button', { name: 'Quick-sim' }).count();
  await page.locator('header button:has-text("▾")').click();
  await page.getByText('Quick-sim...').click();
  await shot('u5-quick');
  await page.getByRole('button', { name: '1 month' }).click();
  await page.waitForSelector('text=/Simulated \\d+ days/', { timeout: 60000 });
  const date1 = await txt('header .font-bold');
  ok(/Aug|Sep/.test(date1) && !/Sat 1 Aug/.test(date1), `quick-sim 1 month advanced the date (${date1})`);
  // quick-sim to end of season
  await page.locator('header button:has-text("▾")').click();
  await page.getByText('Quick-sim...').click();
  await page.getByRole('button', { name: 'Simulate to end of season' }).click();
  await page.waitForFunction(() => { const t = document.querySelector('.fixed.top-2')?.textContent ?? ''; return /Simulated \d+ days/.test(t) && !/Simulated 30 days/.test(t); }, null, { timeout: 240000 });
  const t = await txt('.fixed.top-2');
  console.log('toast:', t);
  ok(/Simulated \d+ days, (3[0-9]|[1-9]\d) of your matches/.test(t), 'season quick-sim played the user matches');
  await page.getByText('Leagues').click();
  await shot('u6-league-after');
  ok(/38/.test(await page.locator('body').innerText()), 'league table shows 38 played');
  // club editor
  await page.getByText('Club', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Editor' }).click();
  const nameBox = page.locator('input[maxlength="32"]').first();
  await nameBox.fill('Test Rovers FC');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(300);
  ok((await page.locator('body').innerText()).includes('Test Rovers FC'), 'club renamed in the editor list');
  await shot('u7-editor');
  // export slot file
  await page.getByRole('button', { name: 'Menu' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up to file' }).click()]);
  const path = await dl.path();
  ok(dl.suggestedFilename().endsWith('.tlsave'), `backup downloaded (${dl.suggestedFilename()})`);
  await ctx.storageState().catch(() => 0);
  await dl.saveAs(`${out}/backup.tlsave`);
  // save and quit to menu
  await page.getByRole('button', { name: 'Save and quit to menu' }).click();
  await page.waitForSelector('text=Football management simulation');
  ok(true, 'save and quit returns to the title screen');
  // import the backup into slot 4 and load it
  await page.getByText('Load / Manage Saves').click();
  await page.getByRole('button', { name: 'Import from file' }).click();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('button:has-text("Empty")').first().click()]);
  await fc.setFiles(`${out}/backup.tlsave`);
  await page.waitForSelector('text=Imported into slot');
  await shot('u8-slots');
  const loads = await page.getByRole('button', { name: 'Load' }).count();
  ok(loads >= 2, `imported save appears as a second used slot (${loads} loadable)`);
  await page.getByRole('button', { name: 'Load' }).nth(1).click();
  await page.waitForSelector('nav');
  await page.getByText('Club', { exact: true }).first().click();
  ok((await page.locator('body').innerText()).includes('Test Rovers'), 'imported career loads with the edited club name');
} catch (e) { fails++; console.log('EXCEPTION', e); await shot('99-error'); }
const real = errors.filter((e) => !/favicon|net::ERR/.test(e));
ok(real.length === 0, `no console errors ${real.slice(0, 3).join(' | ')}`);
await browser.close(); srv.kill();
console.log(fails ? `${fails} FAILURES` : 'ALL PASSED');
process.exit(fails ? 1 : 0);

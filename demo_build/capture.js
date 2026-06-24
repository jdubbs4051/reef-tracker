// Captures crisp 1920x1080 @2x frames of the Reef Tracker SPA for the demo video.
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5173';
const OUT = path.join(__dirname, 'frames');
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickNav(page, label) {
  await page.evaluate((lbl) => {
    const btns = [...document.querySelectorAll('button.nav-item')];
    const b = btns.find((x) => x.textContent.trim().startsWith(lbl));
    if (b) b.click();
  }, label);
  await sleep(900);
}

async function clickText(page, text) {
  await page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, a')];
    const b = els.find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes(t));
    if (b) b.click();
  }, text);
  await sleep(700);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('captured', name);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(1500);

  // 1. Dashboard
  await shot(page, '01_dashboard');

  // 2. Log Reading modal (Add Test Results)
  await clickText(page, 'Add Test Results');
  await sleep(600);
  await shot(page, '02_log_modal');
  // close modal
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const b=[...document.querySelectorAll('.icon-btn')].find(x=>x.textContent.includes('×')); if(b) b.click(); });
  await sleep(500);

  // 3. Historic Trends (charts)
  await clickNav(page, 'Historic Trends');
  await sleep(1200);
  await shot(page, '03_trends');

  // 4. Parameter Tracking (history grid)
  await clickNav(page, 'Parameter Tracking');
  await sleep(1000);
  await shot(page, '04_param_tracking');

  // 5. Tasks
  await clickNav(page, 'Tasks');
  await sleep(900);
  await shot(page, '05_tasks');

  // 6. Livestock gallery
  await clickNav(page, 'Livestock');
  await sleep(1000);
  await shot(page, '06_livestock');

  // 7. Advisor showpiece — add a tang to the nano
  await clickText(page, 'Add');
  await sleep(700);
  await page.evaluate(() => {
    const inp = document.querySelector('.modal .text-input');
    if (inp) { inp.focus(); }
  });
  await page.type('.modal .text-input', 'Yellow Tang', { delay: 60 });
  await sleep(1600); // wait for debounced advice fetch
  await shot(page, '07_advisor_tang');

  // 8. Equipment
  await page.keyboard.press('Escape');
  await sleep(400);
  await clickNav(page, 'Equipment');
  await sleep(900);
  await shot(page, '08_equipment');

  // 9. Journal
  await clickNav(page, 'Journal');
  await sleep(900);
  await shot(page, '09_journal');

  // 10. Settings (notifications)
  await clickNav(page, 'Settings');
  await sleep(900);
  await shot(page, '10_settings');

  await browser.close();
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });

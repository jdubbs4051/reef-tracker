// Captures crisp screenshots of Reef Tracker for the r/selfhosted post.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:5173';
const OUT = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setTheme(page, label) {
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === lbl);
    if (b) b.click();
  }, label);
  await sleep(500);
}

async function nav(page, label) {
  await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === lbl);
    if (b) b.click();
  }, label);
  await sleep(900);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('captured', name);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 1440, height: 1024, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await sleep(1200);

  // 1. Dashboard, light
  await nav(page, 'Dashboard');
  await setTheme(page, 'Light');
  await shot(page, '1-dashboard-light');

  // 2. Historic Trends, dark
  await nav(page, 'Historic Trends');
  await setTheme(page, 'Dark');
  await shot(page, '2-historic-trends-dark');

  // 3. Parameter Tracking grid, dark
  await nav(page, 'Parameter Tracking');
  await shot(page, '3-parameter-grid-dark');

  // 4. Livestock, dark
  await nav(page, 'Livestock');
  await shot(page, '4-livestock-dark');

  await browser.close();
  console.log('Saved to', OUT);
})();

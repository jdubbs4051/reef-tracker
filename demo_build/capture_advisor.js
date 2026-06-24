// Re-capture the advisor showpiece: add a tang to the nano, grab the warning.
const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'frames');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
    args: ['--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // nav -> Livestock
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button.nav-item')].find(x => x.textContent.trim().startsWith('Livestock'));
    if (b) b.click();
  });
  await sleep(1200);

  // click the EXACT "Add" button (not "Add Test Results")
  const opened = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.replace(/\s+/g, ' ').trim() === 'Add');
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('Add livestock clicked:', opened);
  await sleep(800);

  // type a tang into the common-name field
  await page.waitForSelector('.modal .text-input', { timeout: 4000 });
  await page.type('.modal .text-input', 'Yellow Tang', { delay: 60 });
  await sleep(1800); // debounced advice fetch

  const adviceText = await page.evaluate(() => {
    const a = document.querySelector('.modal .advice');
    return a ? a.textContent.trim() : null;
  });
  console.log('advice shown:', adviceText);

  await page.screenshot({ path: path.join(OUT, '07_advisor_tang.png') });
  console.log('captured 07_advisor_tang');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

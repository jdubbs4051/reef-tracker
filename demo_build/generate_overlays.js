// Renders title cards (opaque) and caption bars (transparent) as PNGs via Chrome,
// since this ffmpeg build lacks drawtext. Output: overlays/*.png at 1920x1080.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.join(__dirname, 'overlays');
fs.mkdirSync(OUT, { recursive: true });
const ASSETS = '/Users/jonathan/Documents/Claude/coding/aquarium tracker/frontend/src/assets';
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const logoLight = b64(path.join(ASSETS, 'logo-light.png'));
const logoDark = b64(path.join(ASSETS, 'logo-dark.png'));

const INK = '#0d2733', TEAL = '#0f9a8b';

const FONT = `-apple-system, 'Helvetica Neue', Arial, sans-serif`;

// caption pill, bottom-left
function captionHTML(text) {
  return `<!doctype html><meta charset=utf8><style>
    html,body{margin:0;width:1920px;height:1080px;background:transparent;font-family:${FONT}}
    .wrap{position:absolute;left:64px;bottom:72px}
    .pill{display:inline-flex;align-items:center;gap:18px;
      background:rgba(13,39,51,.86);backdrop-filter:blur(6px);
      padding:22px 34px;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.28)}
    .dot{width:16px;height:16px;border-radius:50%;background:${TEAL};box-shadow:0 0 0 6px rgba(15,154,139,.22)}
    .txt{color:#fff;font-size:40px;font-weight:650;letter-spacing:.2px;white-space:nowrap}
  </style><div class=wrap><div class=pill><span class=dot></span><span class=txt>${text}</span></div></div>`;
}

function titleHTML(big, sub, logo) {
  return `<!doctype html><meta charset=utf8><style>
    html,body{margin:0;width:1920px;height:1080px;font-family:${FONT};
      background:radial-gradient(120% 120% at 30% 20%, #134a52 0%, ${INK} 60%, #08191f 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
    img{width:230px;height:230px;object-fit:contain;margin-bottom:26px;
      filter:drop-shadow(0 12px 30px rgba(0,0,0,.45))}
    h1{font-size:108px;margin:0;font-weight:760;letter-spacing:-1px}
    p{font-size:40px;margin:22px 0 0;color:#9fd8cf;font-weight:520;max-width:1200px;text-align:center;line-height:1.35}
    .rule{width:120px;height:5px;border-radius:3px;background:${TEAL};margin-top:30px}
  </style><img src="${logo}"><h1>Reef Tracker</h1><p>${sub}</p><div class=rule></div>`;
}

const CAPTIONS = [
  'Your whole reef — self-hosted, no cloud',
  'Live tank status · due tasks · recent activity',
  'Log once — every parameter charts vs. its target',
  'Recurring tasks · phone, email & calendar reminders',
  'Honest stocking advice — it never blocks you',
  'Your tank. Your data. Your hardware.',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();

  // title + end cards (opaque)
  await page.setContent(titleHTML('Reef Tracker', 'A self-hosted companion for your reef tank', logoLight), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'title.png') });
  console.log('title.png');

  await page.setContent(titleHTML('Reef Tracker', 'Runs on your own network · open it on any device', logoLight), { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'end.png') });
  console.log('end.png');

  // captions (transparent)
  for (let i = 0; i < CAPTIONS.length; i++) {
    await page.setContent(captionHTML(CAPTIONS[i]), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, `cap${i + 1}.png`), omitBackground: true });
    console.log(`cap${i + 1}.png`);
  }
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error(e); process.exit(1); });

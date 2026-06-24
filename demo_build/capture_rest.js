const puppeteer = require('puppeteer-core');
const path = require('path');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT=path.join(__dirname,'frames');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function nav(p,l){await p.evaluate(x=>{const b=[...document.querySelectorAll('button.nav-item')].find(z=>z.textContent.trim().startsWith(x));if(b)b.click();},l);await sleep(1100);}
(async()=>{
const br=await puppeteer.launch({executablePath:CHROME,headless:'new',defaultViewport:{width:1920,height:1080,deviceScaleFactor:2},args:['--hide-scrollbars','--force-color-profile=srgb']});
const p=await br.newPage();await p.goto('http://localhost:5173',{waitUntil:'networkidle2'});await sleep(1500);
await nav(p,'Equipment');await p.screenshot({path:path.join(OUT,'08_equipment.png')});console.log('08 equipment');
await nav(p,'Journal');await p.screenshot({path:path.join(OUT,'09_journal.png')});console.log('09 journal');
await nav(p,'Settings');await p.screenshot({path:path.join(OUT,'10_settings.png')});console.log('10 settings');
await br.close();console.log('DONE');
})().catch(e=>{console.error(e);process.exit(1);});

// Farm Ledger channel branding (0 vidIQ credits): profile picture, banner, watermark.
//   node farm/branding.js <outDir>
// YouTube specs: profile 800x800 (shown as a circle); banner 2560x1440 with everything important inside
// the centered 1546x423 "safe area" (that strip is all phones show); watermark 150x150 PNG, transparent.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const base = `*{margin:0;box-sizing:border-box} body{font-family:'Inter','Inter Display',sans-serif;overflow:hidden}`;
const green = 'radial-gradient(circle at 30% 20%, #3c6e2f 0%, #1d3a17 55%, #0e1d0b 100%)';
const pages = {
  'profile.png': [800, 800, false, `<style>${base}
    body{width:800px;height:800px;background:${green};display:flex;align-items:center;justify-content:center}
    .ring{position:absolute;inset:26px;border-radius:50%;border:22px solid #FFD23F}
    .cow{font-size:330px;margin-top:-70px;filter:drop-shadow(0 14px 20px rgba(0,0,0,.5))}
    .name{position:absolute;bottom:165px;left:0;right:0;text-align:center;color:#FFD23F;font-weight:900;font-size:84px;letter-spacing:2px;-webkit-text-stroke:8px #000;paint-order:stroke fill}
    .coin{position:absolute;right:150px;top:170px;width:150px;height:150px;border-radius:50%;background:#FFD23F;border:8px solid #000;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:100px;color:#1d3a17}
    </style><div class="ring"></div><div class="cow">🐄</div><div class="coin">$</div><div class="name">FARM LEDGER</div>`],
  'banner.png': [2560, 1440, false, `<style>${base}
    body{width:2560px;height:1440px;background:${green};position:relative}
    .stripes{position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 3px,transparent 3px 14px)}
    .safe{position:absolute;left:507px;top:508px;width:1546px;height:423px;display:flex;align-items:center;gap:56px;padding:0 40px}
    .logo{flex:none;width:300px;height:300px;border-radius:50%;background:#FFD23F;border:12px solid #000;display:flex;align-items:center;justify-content:center;font-size:190px}
    h1{color:#FFD23F;font-weight:900;font-size:150px;line-height:.95;-webkit-text-stroke:10px #000;paint-order:stroke fill;letter-spacing:-2px}
    .tag{margin-top:22px;display:inline-block;background:#fff;color:#111;font-weight:900;font-size:50px;padding:10px 24px;border-radius:12px}
    .when{margin-top:20px;color:#fff;font-weight:800;font-size:40px;white-space:nowrap;-webkit-text-stroke:5px #000;paint-order:stroke fill}
    .row{position:absolute;left:0;right:0;bottom:250px;text-align:center;font-size:110px;letter-spacing:40px;opacity:.9}
    .row.top{top:250px;bottom:auto}
    </style><div class="stripes"></div><div class="row top">🌾 🚜 🌽 🥩 🥚 🍯</div><div class="row">🐄 🐐 🐎 🐔 🐖 🐝</div>
    <div class="safe"><div class="logo">🐄</div><div><h1>THE FARM LEDGER</h1>
    <div class="tag">FARM &amp; RANCH MONEY, ANSWERED WITH USDA DATA</div>
    <div class="when">NEW SHORTS DAILY 6 PM CT · LONG VIDEO SUNDAYS</div></div></div>`],
  'watermark.png': [150, 150, true, `<style>${base}
    html,body{background:transparent!important} body{width:150px;height:150px;display:flex;align-items:center;justify-content:center}
    .b{width:140px;height:140px;border-radius:50%;background:#FFD23F;border:7px solid #000;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .c{font-size:62px;line-height:1;margin-top:-4px} .s{font-weight:900;font-size:17px;color:#111;margin-top:2px}
    </style><div class="b"><div class="c">🐄</div><div class="s">SUBSCRIBE</div></div>`],
};
(async () => {
  const b = await chromium.launch();
  for (const [name, [w, h, transparent, html]] of Object.entries(pages)) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`, { waitUntil: 'load' });
    await p.screenshot({ path: path.join(out, name), type: 'png', omitBackground: transparent });
    await p.close(); console.log('rendered', name, fs.statSync(path.join(out, name)).size);
  }
  await b.close();
})();

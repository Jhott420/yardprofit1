// Farm Ledger thumbnail maker (0 vidIQ credits). Renders branded thumbnails with Playwright.
//   node farm/thumbs.js <specs.json> <outDir>
// specs: [{ id, big: "$1,752", sub: "TO KEEP 1 COW FOR A YEAR", q: "How much does it cost to raise a cow?", emoji: "🐄", color: "#FFD23F", bg: "path/to/frame.jpg" (optional), wide: false }]
// Vertical (1080x1920) for Shorts, 1280x720 when wide:true.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const [specFile, outDir] = process.argv.slice(2);
const specs = JSON.parse(fs.readFileSync(specFile));
fs.mkdirSync(outDir, { recursive: true });
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const html = s => {
  const W = s.wide ? 1280 : 1080, H = s.wide ? 720 : 1920, k = s.wide ? 0.62 : 1;
  const bg = s.bg ? `url('data:image/jpeg;base64,${fs.readFileSync(s.bg).toString('base64')}') center/cover` : 'radial-gradient(circle at 30% 20%, #3c6e2f 0%, #1d3a17 55%, #0e1d0b 100%)';
  return `<!doctype html><html><head><style>
  *{margin:0;box-sizing:border-box} body{width:${W}px;height:${H}px;overflow:hidden;font-family:'Inter','Inter Display',sans-serif}
  .bg{position:absolute;inset:0;background:${bg};filter:${s.bg ? 'saturate(1.15) brightness(.8)' : 'none'}}
  .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.05) 40%,rgba(0,0,0,.15) 60%,rgba(0,0,0,.8) 100%)}
  .grain{position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 2px,transparent 2px 9px)}
  .tag{position:absolute;top:${60*k}px;left:${60*k}px;background:#FFD23F;color:#1b1b1b;font-weight:900;font-size:${42*k}px;padding:${10*k}px ${24*k}px;border-radius:${12*k}px;letter-spacing:1px}
  .emoji{position:absolute;${s.wide ? `right:60px;top:150px;font-size:300px` : `left:0;right:0;text-align:center;top:${H*0.38}px;font-size:450px`};filter:drop-shadow(0 12px 24px rgba(0,0,0,.6));transform:rotate(-8deg)}
  .wrap{position:absolute;left:${60*k}px;right:${(s.wide ? 380 : 60)}px;${s.wide ? 'top:140px' : `top:${H*0.17}px;text-align:center`}}
  .big{font-weight:900;font-size:${s.wide ? 170 : 260}px;line-height:.95;color:${s.color || '#FFD23F'};-webkit-text-stroke:${10*k}px #000;paint-order:stroke fill;letter-spacing:-4px;text-shadow:0 10px 0 rgba(0,0,0,.35)}
  .sub{margin-top:${18*k}px;display:inline-block;background:#fff;color:#111;font-weight:900;font-size:${s.wide ? 44 : 64}px;line-height:1.1;padding:${10*k}px ${20*k}px;border-radius:${10*k}px;transform:rotate(-1.5deg)}
  .q{position:absolute;left:${60*k}px;right:${60*k}px;bottom:${s.wide ? 50 : 230}px;${s.wide ? '' : 'text-align:center'};color:#fff;font-weight:900;font-size:${s.wide ? 58 : 88}px;line-height:1.05;-webkit-text-stroke:${7*k}px #000;paint-order:stroke fill}
  </style></head><body><div class="bg"></div><div class="shade"></div><div class="grain"></div>
  <div class="tag">THE FARM LEDGER</div><div class="emoji">${esc(s.emoji)}</div>
  <div class="wrap"><div class="big">${esc(s.big)}</div><div class="sub">${esc(s.sub)}</div></div>
  <div class="q">${esc(s.q)}</div></body></html>`;
};
(async () => {
  const b = await chromium.launch();
  for (const s of specs) {
    const W = s.wide ? 1280 : 1080, H = s.wide ? 720 : 1920;
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(html(s), { waitUntil: 'load' });
    const out = path.join(outDir, `${s.id}.jpg`);
    await p.screenshot({ path: out, type: 'jpeg', quality: 88 });
    await p.close(); console.log('rendered', out, fs.statSync(out).size);
  }
  await b.close();
})();

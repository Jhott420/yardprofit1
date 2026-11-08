// Renders original animated scene clips and thumbnails with Playwright + FFmpeg.
// Every frame is drawn from our own HTML/CSS, so the visuals carry no third-party rights.
const path = require('path');
const { spawn } = require('child_process');

const WIDTH = 1280;
const HEIGHT = 720;
// Shorts are rendered at 720x1280 and upscaled; text is sized for a phone held upright.
const VERTICAL = { width: 720, height: 1280 };
const FPS = 24;

const PALETTES = [
  ['#1d0b3a', '#5b2a86', '#c2410c', '#facc15'],
  ['#0b2a3a', '#13698a', '#22d3ee', '#fde047'],
  ['#10261a', '#2f7d50', '#a3e635', '#fef08a'],
  ['#2a0f1f', '#8a2b52', '#fb7185', '#fde68a'],
  ['#141a33', '#3d4fa8', '#818cf8', '#fcd34d'],
  ['#2b1a05', '#a0611a', '#fb923c', '#fef3c7']
];

function paletteFor(seed) {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function sceneHtml(card, { duration, index, total, palette, channel, width = WIDTH, height = HEIGHT }) {
  const vertical = height > width;
  const [c1, c2, c3, accent] = palette;
  const words = escapeHtml(card.headline).split(/\s+/).filter(Boolean);
  const headlineSize = vertical
    ? (card.headline.length > 40 ? 60 : card.headline.length > 24 ? 70 : 84)
    : (card.headline.length > 48 ? 54 : card.headline.length > 30 ? 64 : 76);
  const points = (card.points || []).slice(0, 3);
  // Spread bullet reveals across the scene so they land while the narrator talks about them.
  const firstPointAt = Math.min(2.2, duration * 0.3);
  const pointGap = points.length ? Math.max(0.6, (duration * 0.8 - firstPointAt) / points.length) : 0;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; font-family: 'DejaVu Sans', Arial, sans-serif; color: #fff;
    background: linear-gradient(135deg, ${c1}, ${c2}); }
  .blob { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; }
  .b1 { width: 520px; height: 520px; background: ${c3}; left: -120px; top: -160px; animation: drift1 14s ease-in-out infinite alternate; }
  .b2 { width: 440px; height: 440px; background: ${accent}; right: -140px; bottom: -180px; opacity: .35; animation: drift2 17s ease-in-out infinite alternate; }
  .b3 { width: 300px; height: 300px; background: ${c2}; left: 55%; top: 30%; opacity: .5; animation: drift1 11s ease-in-out infinite alternate-reverse; }
  .dots { position: absolute; inset: -40px; background-image: radial-gradient(rgba(255,255,255,.12) 2px, transparent 2px);
    background-size: 40px 40px; animation: pan 20s linear infinite; }
  .stage { position: absolute; inset: 0; padding: 0 ${vertical ? 56 : 96}px; display: flex; flex-direction: column; justify-content: center;
    animation: zoom ${duration}s linear forwards; }
  .kicker { align-self: flex-start; background: ${accent}; color: ${c1}; font-weight: 800; font-size: 22px; letter-spacing: 3px;
    padding: 8px 18px; border-radius: 10px; margin-bottom: 26px; text-transform: uppercase; opacity: 0;
    animation: slideIn .6s cubic-bezier(.2,.8,.2,1) .15s forwards; }
  h1 { font-size: ${headlineSize}px; line-height: 1.1; font-weight: 900; max-width: ${width - (vertical ? 112 : 200)}px; text-shadow: 0 6px 24px rgba(0,0,0,.35); }
  h1 span { display: inline-block; opacity: 0; transform: translateY(30px) scale(.9); margin-right: .25em;
    animation: pop .55s cubic-bezier(.2,.9,.3,1.3) forwards; }
  ul { list-style: none; margin-top: 34px; }
  li { display: flex; align-items: center; gap: 18px; font-size: ${vertical ? 36 : 30}px; font-weight: 600; margin: 14px 0; opacity: 0;
    transform: translateX(-24px); animation: fadeRight .6s ease-out forwards; }
  li i { flex: none; width: 34px; height: 34px; border-radius: 50%; background: ${accent}; position: relative; }
  li i::after { content: ''; position: absolute; left: 12px; top: 6px; width: 8px; height: 16px; border: solid ${c1};
    border-width: 0 4px 4px 0; transform: rotate(45deg); }
  .bar { position: absolute; left: 0; bottom: 0; height: 6px; background: ${accent}; width: 0; animation: grow ${duration}s linear forwards; }
  .count { position: absolute; top: 34px; right: 48px; font-size: 22px; font-weight: 700; opacity: .7; }
  .brand { position: absolute; bottom: 30px; right: 48px; font-size: 22px; font-weight: 700; opacity: .65; }
  @keyframes drift1 { to { transform: translate(140px, 90px) scale(1.15); } }
  @keyframes drift2 { to { transform: translate(-120px, -70px) scale(1.1); } }
  @keyframes pan { to { transform: translate(40px, 40px); } }
  @keyframes zoom { from { transform: scale(1); } to { transform: scale(1.05); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
  @keyframes pop { to { opacity: 1; transform: none; } }
  @keyframes fadeRight { to { opacity: 1; transform: none; } }
  @keyframes grow { to { width: 100%; } }
  </style></head><body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div><div class="dots"></div>
  <div class="stage">
    ${card.kicker ? `<div class="kicker">${escapeHtml(card.kicker)}</div>` : ''}
    <h1>${words.map((word, i) => `<span style="animation-delay:${(0.35 + i * 0.09).toFixed(2)}s">${word}</span>`).join('')}</h1>
    ${points.length ? `<ul>${points.map((point, i) =>
      `<li style="animation-delay:${(firstPointAt + i * pointGap).toFixed(2)}s"><i></i>${escapeHtml(point)}</li>`).join('')}</ul>` : ''}
  </div>
  <div class="count">${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</div>
  <div class="brand">${escapeHtml(channel)}</div>
  <div class="bar"></div>
  </body></html>`;
}

// Science-horror scene: grainy black void, glitching text that types in word by word,
// and a swaying stickman with glowing eyes. Poses vary by scene so the Short keeps moving.
const STICKMAN_POSES = {
  stand: 'M0,-60 L0,40 M0,-30 L-38,10 M0,-30 L38,10 M0,40 L-28,110 M0,40 L28,110',
  reach: 'M0,-60 L0,40 M0,-30 L-44,-80 M0,-30 L44,-80 M0,40 L-28,110 M0,40 L28,110',
  hunch: 'M0,-50 Q10,0 0,40 M0,-25 L-30,30 M0,-25 L30,30 M0,40 L-22,110 M0,40 L22,110',
  point: 'M0,-60 L0,40 M0,-30 L-38,10 M0,-30 L70,-40 M0,40 L-28,110 M0,40 L28,110'
};

function horrorSceneHtml(card, { duration, index, total, channel, width, height }) {
  const words = escapeHtml(card.headline).toUpperCase().split(/\s+/).filter(Boolean);
  // Size by total length, then shrink so the longest word still fits the 620px text column.
  const longest = Math.max(...words.map(w => w.length), 1);
  const headlineSize = Math.min(card.headline.length > 34 ? 66 : card.headline.length > 20 ? 78 : 94, Math.floor(620 / (longest * 0.72)));
  const pose = STICKMAN_POSES[card.pose] ? card.pose : Object.keys(STICKMAN_POSES)[index % 4];
  const scale = card.scale === 'tiny' ? 0.6 : card.scale === 'huge' ? 1.65 : 1.4; // keeps the figure below the text block
  const points = (card.points || []).slice(0, 2);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #050505; color: #f4f4f4;
    font-family: 'DejaVu Sans', Arial, sans-serif; position: relative; }
  .void { position: absolute; inset: -10%; background: radial-gradient(ellipse at 50% 62%, #2a0507 0%, #0b0203 45%, #000 75%);
    animation: breathe 5s ease-in-out infinite alternate; }
  .grain { position: absolute; inset: -50%; opacity: .16;
    background-image: radial-gradient(#fff 1px, transparent 1px), radial-gradient(#fff 1px, transparent 1px);
    background-size: 7px 7px, 11px 11px; background-position: 0 0, 3px 5px; animation: grain .4s steps(4) infinite; }
  .scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 2px, transparent 2px 5px); }
  .vignette { position: absolute; inset: 0; box-shadow: inset 0 0 220px 90px #000; }
  .stage { position: absolute; inset: 0; animation: flicker ${Math.max(3, duration / 2).toFixed(2)}s steps(1) infinite, push ${duration}s linear forwards; }
  .text { position: absolute; top: 150px; left: 50px; right: 50px; }
  .kicker { font-family: 'DejaVu Sans Mono', monospace; color: #ff2a2a; font-size: 30px; letter-spacing: 6px; margin-bottom: 26px; opacity: 0;
    text-transform: uppercase; animation: show .1s linear .1s forwards, blink 1.1s steps(1) .1s infinite; }
  h1 { font-size: ${headlineSize}px; line-height: 1.04; font-weight: 900; letter-spacing: 1px; text-shadow: 0 0 18px rgba(255,0,0,.35); }
  h1 span { display: inline-block; margin-right: .22em; opacity: 0; position: relative; animation: slam .18s ease-out forwards; }
  h1 span::before, h1 span::after { content: attr(data-w); position: absolute; left: 0; top: 0; opacity: .7; }
  h1 span::before { color: #ff1f3d; animation: glitchA 1.7s steps(1) infinite; }
  h1 span::after { color: #18e6ff; animation: glitchB 2.3s steps(1) infinite; }
  .points { margin-top: 30px; font-family: 'DejaVu Sans Mono', monospace; font-size: 30px; color: #d9d9d9; }
  .points div { opacity: 0; margin: 10px 0; animation: show .1s linear forwards; }
  .points div::before { content: '> '; color: #ff2a2a; }
  .figure { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%) scale(${scale}); transform-origin: 50% 100%; }
  .figure svg { overflow: visible; animation: sway 3.2s ease-in-out infinite alternate; transform-origin: 50% 100%; }
  .eye { fill: #ff1a1a; filter: drop-shadow(0 0 8px #ff0000); animation: eyes 4s steps(1) infinite; }
  .shadow { position: absolute; left: 50%; bottom: 136px; width: 260px; height: 26px; transform: translateX(-50%) scale(${scale});
    background: radial-gradient(ellipse, rgba(255,0,0,.35), transparent 70%); }
  .bar { position: absolute; left: 0; bottom: 0; height: 8px; width: 0; background: #ff1a1a; animation: grow ${duration}s linear forwards; }
  .tag { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-family: 'DejaVu Sans Mono', monospace;
    font-size: 24px; letter-spacing: 4px; color: rgba(255,255,255,.45); }
  .count { position: absolute; top: 60px; right: 50px; font-family: 'DejaVu Sans Mono', monospace; font-size: 24px; color: rgba(255,42,42,.8); }
  @keyframes breathe { to { transform: scale(1.08); } }
  @keyframes grain { 0% { transform: translate(0,0); } 25% { transform: translate(-3%,2%); } 50% { transform: translate(2%,-3%); } 75% { transform: translate(-2%,-1%); } }
  @keyframes flicker { 0%, 100% { opacity: 1; } 47% { opacity: .82; } 48% { opacity: 1; } 71% { opacity: .9; } 72% { opacity: 1; } }
  @keyframes push { from { transform: scale(1); } to { transform: scale(1.06); } }
  @keyframes show { to { opacity: 1; } }
  @keyframes blink { 50% { opacity: .2; } }
  @keyframes slam { 0% { opacity: 0; transform: scale(1.6); filter: blur(6px); } 100% { opacity: 1; transform: none; filter: none; } }
  @keyframes glitchA { 0%, 88%, 100% { transform: translate(0,0); opacity: 0; } 89% { transform: translate(-6px,2px); opacity: .8; } 93% { transform: translate(4px,-2px); opacity: .7; } }
  @keyframes glitchB { 0%, 90%, 100% { transform: translate(0,0); opacity: 0; } 91% { transform: translate(6px,-3px); opacity: .8; } 95% { transform: translate(-3px,1px); opacity: .6; } }
  @keyframes sway { from { transform: rotate(-2.5deg); } to { transform: rotate(2.5deg); } }
  @keyframes eyes { 0%, 100% { opacity: 1; } 62% { opacity: 0; } 64% { opacity: 1; } }
  @keyframes grow { to { width: 100%; } }
  </style></head><body>
  <div class="void"></div>
  <div class="stage">
    <div class="shadow"></div>
    <div class="figure"><svg width="200" height="300" viewBox="-100 -130 200 260">
      <circle cx="0" cy="-88" r="30" fill="none" stroke="#f4f4f4" stroke-width="9"/>
      <circle class="eye" cx="-11" cy="-90" r="5"/><circle class="eye" cx="11" cy="-90" r="5"/>
      <path d="${STICKMAN_POSES[pose]}" fill="none" stroke="#f4f4f4" stroke-width="9" stroke-linecap="round"/>
    </svg></div>
    <div class="text">
      ${card.kicker ? `<div class="kicker">${escapeHtml(card.kicker)}</div>` : ''}
      <h1>${words.map((w, i) => `<span data-w="${w}" style="animation-delay:${(0.2 + i * 0.16).toFixed(2)}s">${w}</span>`).join('')}</h1>
      ${points.length ? `<div class="points">${points.map((p, i) => `<div style="animation-delay:${(0.4 + words.length * 0.16 + i * Math.max(0.8, duration / 4)).toFixed(2)}s">${escapeHtml(p)}</div>`).join('')}</div>` : ''}
    </div>
  </div>
  <div class="grain"></div><div class="scan"></div><div class="vignette"></div>
  <div class="count">${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}</div>
  <div class="tag">${escapeHtml(channel)}</div>
  <div class="bar"></div>
  </body></html>`;
}

// Neon "Vice" theme for gaming Shorts: synthwave sun, scrolling grid, palm silhouettes, glowing
// text. Drawn from scratch so it carries no game publisher's art or logo.
const PALM = 'M0,0 C2,-60 6,-120 10,-170 M10,-170 C-20,-190 -55,-185 -80,-160 M10,-170 C-15,-200 -40,-215 -70,-215 M10,-170 C25,-205 50,-220 80,-215 M10,-170 C40,-190 70,-180 95,-155 M10,-170 C5,-200 0,-225 -5,-240';

function neonSceneHtml(card, { duration, index, total, channel, width, height }) {
  const words = escapeHtml(card.headline).toUpperCase().split(/\s+/).filter(Boolean);
  const longest = Math.max(...words.map(w => w.length), 1);
  const headlineSize = Math.min(card.headline.length > 34 ? 68 : card.headline.length > 20 ? 80 : 96, Math.floor(620 / (longest * 0.72)));
  const points = (card.points || []).slice(0, 3);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; color: #fff; position: relative;
    font-family: 'DejaVu Sans', Arial, sans-serif; background: linear-gradient(180deg, #12002b 0%, #3b0a5c 38%, #ff2e88 58%, #ff9e3d 66%, #12002b 66.2%); }
  .sun { position: absolute; left: 50%; top: 600px; width: 380px; height: 380px; margin-left: -190px; border-radius: 50%;
    background: linear-gradient(180deg, #ffe45c, #ff5fa2 70%);
    -webkit-mask: repeating-linear-gradient(180deg, #000 0 26px, transparent 26px 34px); animation: rise ${duration}s ease-out forwards; }
  .grid { position: absolute; left: -50%; right: -50%; top: 847px; height: 900px; transform-origin: 50% 0; transform: perspective(300px) rotateX(70deg);
    background-image: linear-gradient(#ff2bd6 3px, transparent 3px), linear-gradient(90deg, #ff2bd6 3px, transparent 3px);
    background-size: 80px 80px; box-shadow: 0 0 40px #ff2bd6 inset; animation: scroll 1.2s linear infinite; opacity: .85; }
  .palms { position: absolute; left: 0; right: 0; top: 0; height: 100%; pointer-events: none; }
  .palms svg { position: absolute; top: 850px; overflow: visible; }
  .palms path { fill: none; stroke: #0a0014; stroke-width: 11; stroke-linecap: round; }
  .p1 { left: 40px; transform: scale(1.5); transform-origin: 0 0; animation: sway 4s ease-in-out infinite alternate; }
  .p2 { right: 70px; transform: scale(-1.2,1.2); transform-origin: 0 0; animation: sway 5s ease-in-out infinite alternate-reverse; }
  .stage { position: absolute; left: 48px; right: 48px; top: 130px; animation: push ${duration}s linear forwards; }
  .kicker { display: inline-block; padding: 8px 18px; border: 3px solid #00e5ff; color: #00e5ff; border-radius: 8px; font-weight: 900;
    font-size: 30px; letter-spacing: 4px; text-transform: uppercase; box-shadow: 0 0 18px #00e5ff, inset 0 0 12px #00e5ff;
    text-shadow: 0 0 10px #00e5ff; margin-bottom: 30px; opacity: 0; animation: pop .3s ease-out .1s forwards; }
  h1 { font-size: ${headlineSize}px; line-height: 1.02; font-weight: 900; font-style: italic; }
  h1 span { display: inline-block; margin-right: .2em; opacity: 0; color: #fff;
    text-shadow: 0 0 8px #ff2bd6, 0 0 22px #ff2bd6, 0 0 44px #ff2bd6, 4px 4px 0 #2a0040; animation: pop .3s cubic-bezier(.2,1.4,.4,1) forwards; }
  .points { margin-top: 32px; }
  .points div { font-size: 34px; font-weight: 800; margin: 14px 0; opacity: 0; color: #fff; text-shadow: 0 0 10px #00e5ff, 2px 2px 0 #2a0040;
    animation: slide .35s ease-out forwards; }
  .points div::before { content: '▶ '; color: #00e5ff; }
  .count { position: absolute; top: 56px; right: 48px; font-weight: 900; font-size: 24px; color: #ffe45c; text-shadow: 0 0 10px #ff2e88; }
  .brand { position: absolute; top: 56px; left: 48px; font-weight: 900; font-size: 24px; letter-spacing: 3px; color: #fff; opacity: .8; text-shadow: 0 0 10px #ff2bd6; }
  .bar { position: absolute; left: 0; bottom: 0; height: 10px; width: 0; background: linear-gradient(90deg, #00e5ff, #ff2bd6); animation: grow ${duration}s linear forwards; }
  @keyframes rise { from { transform: translateY(40px); } to { transform: translateY(-20px); } }
  @keyframes scroll { to { background-position: 0 80px, 0 80px; } }
  @keyframes sway { from { transform: scale(1.5) rotate(-2deg); } to { transform: scale(1.5) rotate(2deg); } }
  @keyframes push { from { transform: scale(1); } to { transform: scale(1.04); } }
  @keyframes pop { 0% { opacity: 0; transform: scale(1.8) rotate(-4deg); } 100% { opacity: 1; transform: none; } }
  @keyframes slide { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: none; } }
  @keyframes grow { to { width: 100%; } }
  </style></head><body>
  <div class="sun"></div><div class="grid"></div>
  <div class="palms"><svg class="p1" width="10" height="10"><path d="${PALM}"/></svg><svg class="p2" width="10" height="10"><path d="${PALM}"/></svg></div>
  <div class="brand">${escapeHtml(channel)}</div>
  <div class="count">${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}</div>
  <div class="stage">
    ${card.kicker ? `<div class="kicker">${escapeHtml(card.kicker)}</div>` : ''}
    <h1>${words.map((w, i) => `<span style="animation-delay:${(0.25 + i * 0.14).toFixed(2)}s">${w}</span>`).join('')}</h1>
    ${points.length ? `<div class="points">${points.map((p, i) => `<div style="animation-delay:${(0.5 + words.length * 0.14 + i * Math.max(0.7, duration / 4)).toFixed(2)}s">${escapeHtml(p)}</div>`).join('')}</div>` : ''}
  </div>
  <div class="bar"></div>
  </body></html>`;
}

// High-contrast thumbnail: 2-4 huge words with one accent word in colour, a giant
// background glyph for shape contrast, and a dark vignette so text pops at phone size.
function thumbnailHtml(thumb, palette) {
  const [c1, c2, c3, accent] = palette;
  const words = escapeHtml(thumb.hook).split(/\s+/).filter(Boolean);
  const accentWord = String(thumb.accent || '').toLowerCase().replace(/[^\w']/g, '');
  const size = words.length > 4 || thumb.hook.length > 26 ? 118 : 148;
  const glyph = escapeHtml(thumb.glyph || '?').slice(0, 2);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; font-family: 'DejaVu Sans', Arial, sans-serif; color: #fff; position: relative;
    background: radial-gradient(circle at 75% 45%, ${c3} 0%, ${c2} 38%, ${c1} 80%); display: flex; flex-direction: column; justify-content: center; padding: 0 70px; }
  .glyph { position: absolute; right: 40px; top: 50%; transform: translateY(-52%) rotate(8deg); font-size: 640px; font-weight: 900; line-height: 1;
    color: ${accent}; opacity: .9; text-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .vignette { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.65) 0%, rgba(0,0,0,.35) 55%, rgba(0,0,0,0) 80%); }
  .tag { position: relative; align-self: flex-start; background: ${accent}; color: #111; font-weight: 900; font-size: 38px; padding: 8px 22px;
    border-radius: 10px; margin-bottom: 22px; text-transform: uppercase; letter-spacing: 2px; }
  h1 { position: relative; font-size: ${size}px; font-weight: 900; line-height: .98; max-width: 860px; text-transform: uppercase;
    -webkit-text-stroke: 4px #000; paint-order: stroke fill; text-shadow: 0 10px 30px rgba(0,0,0,.6); }
  h1 em { font-style: normal; color: ${accent}; }
  </style></head><body><div class="glyph">${glyph}</div><div class="vignette"></div>
  ${thumb.tag ? `<div class="tag">${escapeHtml(thumb.tag)}</div>` : ''}
  <h1>${words.map(word => (word.toLowerCase().replace(/[^\w']/g, '') === accentWord ? `<em>${word}</em>` : word)).join(' ')}</h1></body></html>`;
}

function startEncoder(ffmpegPath, outputPath) {
  const encoder = spawn(ffmpegPath, [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', String(FPS), outputPath
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  encoder.stderr.on('data', chunk => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    encoder.on('close', code => (code === 0 ? resolve(outputPath) : reject(new Error(`ffmpeg exited ${code}: ${stderr}`))));
  });
  return { encoder, done };
}

async function writeFrame(stream, buffer) {
  if (!stream.write(buffer)) await new Promise(resolve => stream.once('drain', resolve));
}

// cards: [{ kicker, headline, points }], durations: seconds per scene (same order).
async function renderSceneClips({ agentDir, cards, durations, outDir, seed, channel, vertical = false, theme = 'explainer' }) {
  const size = vertical ? VERTICAL : { width: WIDTH, height: HEIGHT };
  const { chromium } = require(path.join(agentDir, 'node_modules', 'playwright'));
  const ffmpegPath = require(path.join(agentDir, 'node_modules', 'ffmpeg-static'));
  const palette = paletteFor(seed);
  const browser = await chromium.launch();
  const outputs = [];
  try {
    const page = await browser.newPage({ viewport: size });
    for (const [index, card] of cards.entries()) {
      const duration = Math.max(2, Number(durations[index]) || 6);
      const html = theme === 'horror'
        ? horrorSceneHtml(card, { duration, index, total: cards.length, channel, ...size })
        : theme === 'neon'
          ? neonSceneHtml(card, { duration, index, total: cards.length, channel, ...size })
          : sceneHtml(card, { duration, index, total: cards.length, palette, channel, ...size });
      await page.setContent(html);
      const outputPath = path.join(outDir, `scene_${String(index).padStart(2, '0')}.mp4`);
      const { encoder, done } = startEncoder(ffmpegPath, outputPath);
      const frames = Math.ceil(duration * FPS);
      for (let frame = 0; frame < frames; frame++) {
        // Step every CSS animation to this exact time, so output is smooth however slow the screenshots are.
        await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), (frame / FPS) * 1000);
        await writeFrame(encoder.stdin, await page.screenshot({ type: 'jpeg', quality: 88 }));
      }
      encoder.stdin.end();
      outputs.push(await done);
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return outputs;
}

async function renderThumbnail({ agentDir, thumb, outputPath, seed }) {
  const { chromium } = require(path.join(agentDir, 'node_modules', 'playwright'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.setContent(thumbnailHtml(thumb, paletteFor(seed)));
    await page.screenshot({ path: outputPath, type: 'jpeg', quality: 90 });
  } finally {
    await browser.close().catch(() => {});
  }
  return outputPath;
}

module.exports = { renderSceneClips, renderThumbnail };

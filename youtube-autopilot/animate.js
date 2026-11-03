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
async function renderSceneClips({ agentDir, cards, durations, outDir, seed, channel, vertical = false }) {
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
      await page.setContent(sceneHtml(card, { duration, index, total: cards.length, palette, channel, ...size }));
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

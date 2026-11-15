// The Cattle Ledger Weekly — stitches the week's Shorts into one 16:9 long video with chapters, at 0 vidIQ credits.
// node beef/weekly.js <agentDir> <ledgerRoot> <config.json> [--upload]
//   ledgerRoot: the scratchpad beef/ folder holding ledgerNN/{short.mp4, meta.json}
//   config.json: {
//     "edition": 1,
//     "title": "How Much Does a Cow Cost? Cattle & Beef Prices Explained (2026)",   // long-video title (search question first)
//     "intro": "Everything you need to know about cattle & beef prices this week",   // one line on the intro card
//     "order": [15, 16, 14],          // optional: ledger numbers in play order (default: every unused ledger, oldest first)
//     "skip": [1, 2],                 // optional: ledger numbers to mark used without including
//     "chapterTitles": {"14": "Why Is Beef So Expensive?"},  // optional overrides (e.g. after a retitle)
//     "descriptionIntro": "…",        // optional first paragraph (the title question is always line 1)
//     "tags": ["cattle prices", …]     // optional
//   }
// Without --upload it only builds <ledgerRoot>/weeklyNN/long.mp4, thumb.jpg and meta.json, so they can be checked first.
// With --upload it uploads (private, publishAt = next 6:00 PM Central, like the Shorts), sets the thumbnail if the channel
// allows it, adds the video to the series playlist, and records the used ledgers in <agentDir>/state/weekly-used.json.
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const [agentDir, ledgerRoot, cfgPath] = process.argv.slice(2).map(p => path.resolve(p));
const UPLOAD = process.argv.includes('--upload');
const cfg = JSON.parse(fs.readFileSync(cfgPath));
const USED = path.join(agentDir, 'state', 'weekly-used.json');
const used = new Set((() => { try { return JSON.parse(fs.readFileSync(USED)); } catch { return []; } })());
const FONT = '/usr/share/fonts/opentype/inter/Inter-Black.otf';
const FONT2 = '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf';
const ff = args => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const pad = n => String(n).padStart(2, '0');
const clean = t => t.replace(/\s*#shorts?\b/gi, '').replace(/\s*\|\s*The Cattle Ledger/i, '')
  .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
const mmss = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

// Which Shorts go in
const all = fs.readdirSync(ledgerRoot).map(d => /^ledger(\d+)$/.exec(d)).filter(Boolean).map(m => +m[1])
  .filter(n => fs.existsSync(path.join(ledgerRoot, `ledger${pad(n)}`, 'short.mp4')) && fs.existsSync(path.join(ledgerRoot, `ledger${pad(n)}`, 'meta.json')))
  .sort((a, b) => a - b);
const order = cfg.order || all.filter(n => !used.has(n) && !(cfg.skip || []).includes(n));
if (order.length < 3) { console.error(`only ${order.length} unused Shorts; need at least 3 for chapters`); process.exit(2); }
const out = path.join(ledgerRoot, `weekly${pad(cfg.edition)}`);
fs.mkdirSync(out, { recursive: true });

// Text for drawtext goes through files so quotes/colons/$ need no escaping
const textFile = (name, text) => { const p = path.join(out, name); fs.writeFileSync(p, text); return p; };
// Word-wrap for the side panel (about 16 characters a line at this size)
const wrap = (t, w = 16) => t.split(' ').reduce((ls, word) => { const l = ls[ls.length - 1]; if (l && (l + ' ' + word).length <= w) ls[ls.length - 1] = l + ' ' + word; else ls.push(word); return ls; }, []).join('\n');

// 1) Intro card (4 s): blurred frame from the first Short, series name, edition and one-line promise
const first = path.join(ledgerRoot, `ledger${pad(order[0])}`, 'short.mp4');
ff(['-ss', '2', '-i', first, '-frames:v', '1', path.join(out, 'introbg.jpg')]);
const tA = textFile('intro_a.txt', 'THE CATTLE LEDGER');
const tB = textFile('intro_b.txt', `WEEKLY #${cfg.edition}`);
const tC = textFile('intro_c.txt', wrap(cfg.intro || 'The real numbers behind the beef business', 44));
ff(['-loop', '1', '-t', '4', '-i', path.join(out, 'introbg.jpg'), '-f', 'lavfi', '-t', '4', '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex',
  `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=30,eq=brightness=-0.25,` +
  `drawtext=fontfile=${FONT}:textfile=${tA}:fontsize=120:fontcolor=#FFD23F:x=(w-tw)/2:y=330:borderw=6:bordercolor=black,` +
  `drawtext=fontfile=${FONT}:textfile=${tB}:fontsize=72:fontcolor=white:x=(w-tw)/2:y=490:borderw=4:bordercolor=black,` +
  `drawtext=fontfile=${FONT2}:textfile=${tC}:fontsize=48:fontcolor=white:x=(w-tw)/2:y=620:line_spacing=14:borderw=3:bordercolor=black,` +
  `fade=t=in:st=0:d=0.4,format=yuv420p,fps=30[v]`,
  '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
  path.join(out, 'seg00.mp4')]);

// 2) Each Short → 1920x1080: blurred fill behind, the Short centered, chapter number + title in the left panel
const chapters = [{ t: 0, title: 'Intro' }];
let clock = dur(path.join(out, 'seg00.mp4'));
const segs = [path.join(out, 'seg00.mp4')];
const metas = [];
order.forEach((n, i) => {
  const dir = path.join(ledgerRoot, `ledger${pad(n)}`);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json')));
  const title = (cfg.chapterTitles || {})[n] || clean(meta.title);
  metas.push({ n, title, meta });
  const tNum = textFile(`num${pad(i + 1)}.txt`, `#${i + 1}`);
  const tTitle = textFile(`title${pad(i + 1)}.txt`, wrap(title.toUpperCase()));
  const tBrand = textFile('brand.txt', 'THE CATTLE LEDGER');
  const seg = path.join(out, `seg${pad(i + 1)}.mp4`);
  ff(['-i', path.join(dir, 'short.mp4'), '-filter_complex',
    `[0:v]split[a][b];[a]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=40,eq=brightness=-0.3[bg];` +
    `[b]scale=-2:1080[fg];[bg][fg]overlay=(W-w)/2:0,` +
    `drawtext=fontfile=${FONT}:textfile=${tNum}:fontsize=110:fontcolor=#FFD23F:x=(656-tw)/2:y=300:borderw=5:bordercolor=black,` +
    `drawtext=fontfile=${FONT}:textfile=${tTitle}:fontsize=50:fontcolor=white:x=(656-tw)/2:y=450:line_spacing=16:borderw=4:bordercolor=black,` +
    `drawtext=fontfile=${FONT2}:textfile=${tBrand}:fontsize=34:fontcolor=#FFD23F:x=1264+(656-tw)/2:y=990:borderw=3:bordercolor=black,` +
    `format=yuv420p,fps=30[v]`,
    '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', seg]);
  chapters.push({ t: clock, title });
  clock += dur(seg);
  segs.push(seg);
});

// 3) Join (all segments share codecs, so the concat demuxer copies without re-encoding)
fs.writeFileSync(path.join(out, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
const long = path.join(out, 'long.mp4');
ff(['-f', 'concat', '-safe', '0', '-i', path.join(out, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', long]);
const total = dur(long);

// 4) Thumbnail 1280x720: a frame from the first Short + the title question
const thumbText = textFile('thumb.txt', wrap((cfg.thumbText || cfg.title.split('?')[0] + '?').toUpperCase(), 14));
ff(['-ss', '1.5', '-i', first, '-frames:v', '1', '-vf',
  // the Short's captions sit in its top half and its source line at the bottom, so crop the clean band in between
  `crop=1080:720:0:900,scale=1280:-2,crop=1280:720,eq=brightness=-0.18,` +
  `drawtext=fontfile=${FONT}:textfile=${thumbText}:fontsize=96:fontcolor=#FFD23F:x=60:y=(h-th)/2:line_spacing=10:borderw=8:bordercolor=black`,
  path.join(out, 'thumb.jpg')]);

// 5) Description with chapters + sources (each Short's own description already carries its USDA sources)
const q = cfg.title.includes('?') ? cfg.title.split('?')[0] + '?' : cfg.title;
const srcLines = [...new Set(metas.flatMap(m => (m.meta.description.match(/^Sources?:.*$/gm) || []).map(l => l.replace(/\s*https?:\S+/g, '').trim())))];
const photogs = [...new Set(metas.flatMap(m => ((m.meta.description.match(/Footage: Pexels \(([^)]*)\)/) || [])[1] || '').split(',').map(s => s.trim()).filter(Boolean)))];
const description = [
  q, '',
  cfg.descriptionIntro || `The Cattle Ledger Weekly #${cfg.edition}: ${order.length} short answers about cattle and beef money, every number from USDA.`, '',
  'Chapters:', ...chapters.map(c => `${mmss(c.t)} ${c.title}`), '',
  'Sources (USDA Economic Research Service unless noted):', ...srcLines.map(l => '• ' + l.replace(/^Sources?:\s*/, '')), '',
  'Follow The Cattle Ledger for the truth behind the beef business.', '',
  `Footage: Pexels (${photogs.join(', ')}).`, '',
  '#cattle #beef #ranching #cattleprices #beefprices #thecattleledger',
].join('\n').slice(0, 4900);
const tags = cfg.tags || ['cattle prices', 'beef prices', 'how much does a cow cost', 'cost to raise a cow', 'cattle market 2026', 'ranching', 'beef cattle', 'USDA', 'The Cattle Ledger'];
const meta = { title: cfg.title, description, tags, chapters, order, durationSeconds: Math.round(total) };
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
console.log(`built ${long} (${mmss(total)}, ${order.length} chapters)`);
console.log(chapters.map(c => `${mmss(c.t)} ${c.title}`).join('\n'));
if (!UPLOAD) process.exit(0);

// 6) Upload, scheduled for the next 6:00 PM Central (same rule as upload.js)
const { google } = require(path.join(agentDir, 'node_modules', 'googleapis'));
const creds = JSON.parse(fs.readFileSync(path.join(agentDir, 'config/credentials.json')));
const tokens = JSON.parse(fs.readFileSync(path.join(agentDir, 'config/tokens.json')));
const auth = new google.auth.OAuth2(creds.youtube.client_id, creds.youtube.client_secret);
auth.setCredentials(tokens.youtube);
const yt = google.youtube({ version: 'v3', auth });
function next6pmCentral(now = new Date()) {
  const tz = 'America/Chicago';
  const parts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map(p => [p.type, p.value]));
  const offsetMs = d => { const p = parts(d); return Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime(); };
  for (let add = 0; add < 3; add++) {
    const p = parts(new Date(now.getTime() + add * 864e5));
    const guess = Date.UTC(+p.year, p.month - 1, +p.day, 18, 0, 0);
    const t = new Date(guess - offsetMs(new Date(guess)));
    if (t.getTime() - now.getTime() > 10 * 60e3) return t.toISOString();
  }
}
(async () => {
  const publishAt = cfg.publishNow ? null : next6pmCentral();
  const r = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: { title: cfg.title, description, tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: publishAt ? { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: false }
        : { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: false },
    },
    media: { body: fs.createReadStream(long) },
  });
  const id = r.data.id;
  console.log('uploaded', id, `https://youtube.com/watch?v=${id}`, publishAt ? `(scheduled for ${publishAt})` : '(public now)');
  try { await yt.thumbnails.set({ videoId: id, media: { mimeType: 'image/jpeg', body: fs.createReadStream(path.join(out, 'thumb.jpg')) } }); console.log('thumbnail set'); }
  catch (e) { console.log('thumbnail not set (channel may need phone verification for custom thumbnails):', e.message); }
  const PLAYLIST = 'PLLsReRoslZUY';
  for (let i = 1; i <= 4; i++) {
    try { await yt.playlistItems.insert({ part: 'snippet', requestBody: { snippet: { playlistId: PLAYLIST, resourceId: { kind: 'youtube#video', videoId: id } } } }); console.log('added to playlist'); break; }
    catch (e) { if (i === 4) console.log('playlist add failed:', e.message); else await new Promise(r => setTimeout(r, 10000 * i)); }
  }
  for (const n of [...order, ...(cfg.skip || [])]) used.add(n);
  fs.mkdirSync(path.dirname(USED), { recursive: true });
  fs.writeFileSync(USED, JSON.stringify([...used].sort((a, b) => a - b)));
  meta.videoId = id; meta.publishAt = publishAt;
  fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(meta, null, 1));
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

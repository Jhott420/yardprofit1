// node beef-upload.js <agentDir> <video.mp4> <meta.json>
// meta: {title, description, tags[], comment, synthetic (true when realistic AI footage is used),
//        publishNow (optional; default is to schedule for the next 6:00 PM Central)}
// Since Nov 15 every Short is uploaded private and scheduled (status.publishAt) for 6:00 PM America/Chicago,
// so the whole day's Shorts go live together. A private video can't take comments, so the pinned-style
// question is queued in <agentDir>/state/pending-comments.json and posted by the next run once the video is public.
const path = require('path'), fs = require('fs');
const dir = path.resolve(process.argv[2]);
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'config/credentials.json')));
const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'config/tokens.json')));
const auth = new google.auth.OAuth2(creds.youtube.client_id, creds.youtube.client_secret);
auth.setCredentials(tokens.youtube);
const yt = google.youtube({ version: 'v3', auth });
const meta = JSON.parse(fs.readFileSync(process.argv[4]));
// Next 6:00 PM in America/Chicago (needs at least 10 min of lead time), as a UTC ISO string.
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
const PENDING = path.join(dir, 'state', 'pending-comments.json');
const readPending = () => { try { return JSON.parse(fs.readFileSync(PENDING)); } catch { return []; } };
const writePending = a => { fs.mkdirSync(path.dirname(PENDING), { recursive: true }); fs.writeFileSync(PENDING, JSON.stringify(a, null, 1)); };
async function postComment(videoId, text) {
  await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } } });
}
async function flushPending() {
  const left = [];
  for (const c of readPending()) {
    try {
      const v = (await yt.videos.list({ part: 'status', id: c.videoId })).data.items[0];
      if (v && v.status.privacyStatus === 'public') { await postComment(c.videoId, c.text); console.log('queued comment posted on', c.videoId); }
      else if (v) left.push(c);
    } catch (e) { console.log('queued comment failed on', c.videoId, e.message); left.push(c); }
  }
  writePending(left);
}
// Hashtags: always lead with #shorts #fyp + channel core tags, keep topic tags, cap at 12 (YouTube ignores all past 15).
{
  const CORE = ['#shorts', '#fyp', '#cattle', '#beef', '#ranching', '#thecattleledger'];
  const own = (meta.description.match(/#[A-Za-z0-9_]+/g) || []).map(h => h.toLowerCase());
  const body = meta.description.split('\n').filter(l => !/^\s*(#[A-Za-z0-9_]+\s*)+$/.test(l)).join('\n').trimEnd();
  meta.description = body + '\n\n' + [...new Set([...CORE, ...own, '#farming', '#agriculture'])].slice(0, 12).join(' ');
}
(async () => {
  await flushPending();
  const publishAt = meta.publishNow ? null : (meta.publishAt || next6pmCentral());
  const r = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: publishAt
        ? { privacyStatus: 'private', publishAt, selfDeclaredMadeForKids: false, containsSyntheticMedia: !!meta.synthetic }
        : { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: !!meta.synthetic },
    },
    media: { body: fs.createReadStream(process.argv[3]) },
  });
  const id = r.data.id;
  console.log('uploaded', id, `https://youtube.com/shorts/${id}`, publishAt ? `(scheduled for ${publishAt})` : '(public now)');
  const PLAYLIST = 'PLLsReRoslZUY'; // The Cattle Ledger: Beef & Cattle Economics
  for (let i = 1; i <= 4; i++) {
    try { await yt.playlistItems.insert({ part: 'snippet', requestBody: { snippet: { playlistId: PLAYLIST, resourceId: { kind: 'youtube#video', videoId: id } } } }); console.log('added to playlist'); break; }
    catch (e) { if (i === 4) console.log('playlist add failed:', e.message); else await new Promise(r => setTimeout(r, 10000 * i)); }
  }
  if (meta.comment && publishAt) {
    writePending([...readPending(), { videoId: id, text: meta.comment }]);
    console.log('comment queued until the video goes public');
  } else if (meta.comment) {
    try { await postComment(id, meta.comment); console.log('comment posted'); }
    catch (e) { console.log('comment failed:', e.message); }
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

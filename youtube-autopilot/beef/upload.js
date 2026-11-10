// node beef-upload.js <agentDir> <video.mp4> <meta.json>
// meta: {title, description, tags[], comment, synthetic (true when realistic AI footage is used)}
const path = require('path'), fs = require('fs');
const dir = path.resolve(process.argv[2]);
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'config/credentials.json')));
const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'config/tokens.json')));
const auth = new google.auth.OAuth2(creds.youtube.client_id, creds.youtube.client_secret);
auth.setCredentials(tokens.youtube);
const yt = google.youtube({ version: 'v3', auth });
const meta = JSON.parse(fs.readFileSync(process.argv[4]));
// Hashtags: always lead with #shorts #fyp + channel core tags, keep topic tags, cap at 12 (YouTube ignores all past 15).
{
  const CORE = ['#shorts', '#fyp', '#cattle', '#beef', '#ranching', '#thecattleledger'];
  const own = (meta.description.match(/#[A-Za-z0-9_]+/g) || []).map(h => h.toLowerCase());
  const body = meta.description.split('\n').filter(l => !/^\s*(#[A-Za-z0-9_]+\s*)+$/.test(l)).join('\n').trimEnd();
  meta.description = body + '\n\n' + [...new Set([...CORE, ...own, '#farming', '#agriculture'])].slice(0, 12).join(' ');
}
(async () => {
  const r = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: !!meta.synthetic },
    },
    media: { body: fs.createReadStream(process.argv[3]) },
  });
  const id = r.data.id;
  console.log('uploaded', id, `https://youtube.com/shorts/${id}`);
  const PLAYLIST = 'PLLsReRoslZUY'; // The Cattle Ledger: Beef & Cattle Economics
  for (let i = 1; i <= 4; i++) {
    try { await yt.playlistItems.insert({ part: 'snippet', requestBody: { snippet: { playlistId: PLAYLIST, resourceId: { kind: 'youtube#video', videoId: id } } } }); console.log('added to playlist'); break; }
    catch (e) { if (i === 4) console.log('playlist add failed:', e.message); else await new Promise(r => setTimeout(r, 10000 * i)); }
  }
  if (meta.comment) {
    try {
      await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId: id, topLevelComment: { snippet: { textOriginal: meta.comment } } } } });
      console.log('comment posted');
    } catch (e) { console.log('comment failed:', e.message); }
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

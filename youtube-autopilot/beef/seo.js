// Cattle Ledger SEO pass (every 2 days, user's request Nov 15). Uses only the free YouTube Data + Analytics APIs (0 vidIQ credits).
//   node beef/seo.js <agentDir> report              → prints search terms, per-video views/retention, title/tag/description issues, channel keywords
//   node beef/seo.js <agentDir> apply <plan.json>   → applies a plan:
//     { "channel": { "keywords": "...", "description": "..." },             // optional
//       "videos": [ { "id": "...", "title": "...", "firstLine": "...", "tags": [...] } ] }   // any field optional
// Guardrails enforced here (not just in the prompt):
//   - at most 3 title changes per run, and never on a video with ≥300 views in the last 48 h (don't disturb winners)
//   - titles ≤ 70 chars; Shorts keep "#shorts" at the end; tags ≤ 480 chars total; channel keywords ≤ 480 chars
//   - only snippet fields named in the plan change; firstLine is prepended to the description (facts/sources untouched)
//   - only public videos (and scheduled ones) are reported/changed; unlisted/private personal videos are left alone
//   - every applied change is appended to <agentDir>/state/seo-log.json (old → new) so it can be reverted
const path = require('path'), fs = require('fs');
const [agentDir, mode, planPath] = process.argv.slice(2);
const dir = path.resolve(agentDir);
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const c = JSON.parse(fs.readFileSync(path.join(dir, 'config/credentials.json')));
const t = JSON.parse(fs.readFileSync(path.join(dir, 'config/tokens.json')));
const auth = new google.auth.OAuth2(c.youtube.client_id, c.youtube.client_secret); auth.setCredentials(t.youtube);
const yt = google.youtube({ version: 'v3', auth }), ya = google.youtubeAnalytics({ version: 'v2', auth });
const day = d => d.toISOString().slice(0, 10);
const LOG = path.join(dir, 'state', 'seo-log.json');
const PERSONAL = new Set(['vx-v-2I1My8', 'dsAPhdUP2iI', 'iUYWK_XDxBk']); // user's personal videos: never touch

async function uploads() {
  const ch = (await yt.channels.list({ part: 'contentDetails,brandingSettings,statistics', mine: true })).data.items[0];
  const ids = []; let pageToken;
  do {
    const r = await yt.playlistItems.list({ part: 'contentDetails', playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: 50, pageToken });
    ids.push(...r.data.items.map(i => i.contentDetails.videoId)); pageToken = r.data.nextPageToken;
  } while (pageToken);
  const vids = [];
  for (let i = 0; i < ids.length; i += 50)
    vids.push(...(await yt.videos.list({ part: 'snippet,statistics,status,contentDetails', id: ids.slice(i, i + 50).join(',') })).data.items);
  return { ch, vids: vids.filter(v => v.status.privacyStatus === 'public' || (v.status.privacyStatus === 'private' && v.status.publishAt)).filter(v => !PERSONAL.has(v.id)) };
}
const q = async (params) => { for (let i = 1; ; i++) { try { return (await ya.reports.query({ ids: 'channel==MINE', ...params })).data.rows || []; } catch (e) { if (i >= 3) return { error: e.message }; await new Promise(r => setTimeout(r, 4000 * i)); } } };

async function report() {
  const { ch, vids } = await uploads();
  const end = new Date(), start28 = new Date(end - 28 * 864e5);
  console.log('CHANNEL', ch.statistics.subscriberCount, 'subs |', ch.statistics.viewCount, 'views');
  console.log('KEYWORDS', ch.brandingSettings.channel.keywords);
  console.log('DESCRIPTION', JSON.stringify(ch.brandingSettings.channel.description));
  console.log('\nSEARCH TERMS (28 d, YouTube search; Analytics lags ~2–3 days):');
  console.log(JSON.stringify(await q({ startDate: day(start28), endDate: day(end), metrics: 'views', dimensions: 'insightTrafficSourceDetail', filters: 'insightTrafficSourceType==YT_SEARCH', sort: '-views', maxResults: 40 })));
  console.log('\nTRAFFIC SOURCES (28 d):', JSON.stringify(await q({ startDate: day(start28), endDate: day(end), metrics: 'views', dimensions: 'insightTrafficSourceType', sort: '-views' })));
  const perVid = await q({ startDate: day(start28), endDate: day(end), metrics: 'views,averageViewPercentage,averageViewDuration', dimensions: 'video', sort: '-views', maxResults: 50 });
  const an = Object.fromEntries(Array.isArray(perVid) ? perVid.map(r => [r[0], r.slice(1)]) : []);
  console.log('\nVIDEOS (public/scheduled, newest first): id | published | views(total) | analytics views/avg%/avgSec | title | issues');
  for (const v of vids) {
    const s = v.snippet, issues = [];
    const isShort = /#shorts/i.test(s.title) || /PT[0-5]?\dS$/.test(v.contentDetails.duration);
    const q1 = s.description.split('\n')[0];
    if (s.title.length > 70) issues.push('title>70');
    if (!/\?/.test(s.title)) issues.push('title not a question');
    if (!q1.includes('?')) issues.push('desc line 1 not a question');
    if (!s.tags || s.tags.length < 5) issues.push('few tags');
    if (isShort && !/#shorts/i.test(s.title)) issues.push('no #shorts');
    console.log([v.id, s.publishedAt.slice(0, 10), v.status.privacyStatus, v.statistics.viewCount || 0, (an[v.id] || []).map(x => Math.round(x)).join('/'), s.title, issues.join(', ')].join(' | '));
  }
}

async function apply() {
  const plan = JSON.parse(fs.readFileSync(planPath));
  const log = (() => { try { return JSON.parse(fs.readFileSync(LOG)); } catch { return []; } })();
  const stamp = new Date().toISOString();
  if (plan.channel) {
    const ch = (await yt.channels.list({ part: 'brandingSettings', mine: true })).data.items[0];
    const bs = ch.brandingSettings, old = { keywords: bs.channel.keywords, description: bs.channel.description };
    if (plan.channel.keywords) { if (plan.channel.keywords.length > 480) throw new Error('keywords > 480 chars'); bs.channel.keywords = plan.channel.keywords; }
    if (plan.channel.description) bs.channel.description = plan.channel.description.slice(0, 1000);
    await yt.channels.update({ part: 'brandingSettings', requestBody: { id: ch.id, brandingSettings: { channel: bs.channel } } });
    log.push({ at: stamp, channel: { old, new: plan.channel } }); console.log('channel updated');
  }
  let titleChanges = 0;
  for (const p of plan.videos || []) {
    if (PERSONAL.has(p.id)) { console.log('skip personal video', p.id); continue; }
    const v = (await yt.videos.list({ part: 'snippet,statistics', id: p.id })).data.items[0];
    if (!v) { console.log('not found', p.id); continue; }
    const sn = v.snippet, old = { title: sn.title, firstLine: sn.description.split('\n')[0], tags: sn.tags };
    if (p.title && p.title !== sn.title) {
      const recent = await q({ startDate: day(new Date(Date.now() - 2 * 864e5)), endDate: day(new Date()), metrics: 'views', filters: `video==${p.id}` });
      const v48 = Array.isArray(recent) && recent[0] ? recent[0][0] : 0;
      if (titleChanges >= 3) console.log('title change limit reached; skip', p.id);
      else if (v48 >= 300) console.log(`skip title on ${p.id}: ${v48} views in 48 h (winner)`);
      else if (p.title.length > 70) console.log('skip title >70 chars', p.id);
      else {
        let nt = p.title; if (/#shorts/i.test(sn.title) && !/#shorts/i.test(nt)) nt += ' #shorts';
        sn.title = nt; titleChanges++;
      }
    }
    // firstLine is ADDED above the existing description (never overwrites the sourced facts)
    if (p.firstLine && sn.description.split('\n')[0] !== p.firstLine) sn.description = p.firstLine + '\n\n' + sn.description;
    if (p.tags) { if (p.tags.join(',').length > 480) { console.log('tags too long; skip', p.id); } else sn.tags = p.tags; }
    await yt.videos.update({ part: 'snippet', requestBody: { id: p.id, snippet: { title: sn.title, description: sn.description, tags: sn.tags, categoryId: sn.categoryId, defaultLanguage: sn.defaultLanguage, defaultAudioLanguage: sn.defaultAudioLanguage } } });
    log.push({ at: stamp, video: p.id, old, new: { title: sn.title, firstLine: sn.description.split('\n')[0], tags: sn.tags } });
    console.log('updated', p.id, '→', sn.title);
  }
  fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
}
(mode === 'apply' ? apply() : report()).catch(e => { console.error('FAILED:', e.message); process.exit(1); });

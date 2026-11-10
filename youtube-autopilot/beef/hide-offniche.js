// node hide-offniche.js <agentDir> [--apply] — set every public non-cattle video to private
const path = require('path'), fs = require('fs');
const dir = path.resolve(process.argv[2]); const apply = process.argv.includes('--apply');
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const c = JSON.parse(fs.readFileSync(path.join(dir, 'config/credentials.json')));
const t = JSON.parse(fs.readFileSync(path.join(dir, 'config/tokens.json')));
const a = new google.auth.OAuth2(c.youtube.client_id, c.youtube.client_secret); a.setCredentials(t.youtube);
const yt = google.youtube({ version: 'v3', auth: a });
const SKIP = new Set(['vx-v-2I1My8','dsAPhdUP2iI','iUYWK_XDxBk']);
const keep = /cattle|cow|beef|steak|farmers/i;
(async () => {
  const ch = (await yt.channels.list({ part: 'contentDetails', mine: true })).data.items[0];
  const pl = ch.contentDetails.relatedPlaylists.uploads; let ids = [], tok;
  do { const r = await yt.playlistItems.list({ part: 'contentDetails', playlistId: pl, maxResults: 50, pageToken: tok }); ids.push(...r.data.items.map(i => i.contentDetails.videoId)); tok = r.data.nextPageToken; } while (tok);
  const hidden = [];
  for (let i = 0; i < ids.length; i += 50) {
    const vs = (await yt.videos.list({ part: 'snippet,status', id: ids.slice(i, i + 50).join(',') })).data.items;
    for (const v of vs) {
      if (v.status.privacyStatus !== 'public' || keep.test(v.snippet.title) || SKIP.has(v.id)) continue;
      console.log((apply ? 'HIDING ' : 'would hide ') + v.id + ' | ' + v.snippet.title);
      if (apply) {
        const st = v.status;
        await yt.videos.update({ part: 'status', requestBody: { id: v.id, status: { privacyStatus: 'private', embeddable: st.embeddable, license: st.license, publicStatsViewable: st.publicStatsViewable, selfDeclaredMadeForKids: st.selfDeclaredMadeForKids ?? false, containsSyntheticMedia: st.containsSyntheticMedia } } });
        hidden.push({ id: v.id, title: v.snippet.title });
      }
    }
  }
  if (apply) fs.writeFileSync(path.join(path.dirname(__filename), '..', 'autopilot-state', 'hidden-offniche.json'), JSON.stringify(hidden, null, 2));
  console.log('done', hidden.length);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });

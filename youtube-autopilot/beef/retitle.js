// node retitle.js <agentDir> <json map {id: newTitle}> — changes titles only, keeps everything else
const path = require('path'), fs = require('fs');
const dir = path.resolve(process.argv[2]);
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const c = JSON.parse(fs.readFileSync(path.join(dir, 'config/credentials.json')));
const t = JSON.parse(fs.readFileSync(path.join(dir, 'config/tokens.json')));
const auth = new google.auth.OAuth2(c.youtube.client_id, c.youtube.client_secret); auth.setCredentials(t.youtube);
const yt = google.youtube({ version: 'v3', auth });
const map = JSON.parse(fs.readFileSync(process.argv[3]));
(async () => { for (const [id, title] of Object.entries(map)) {
  const v = (await yt.videos.list({ part: 'snippet', id })).data.items[0];
  const sn = v.snippet; const old = sn.title; sn.title = title;
  const q = title.replace(/ [^\w\s?'$,.-]+ #shorts$/u, '').replace(/ #shorts$/, '');
  if (!sn.description.startsWith(q)) sn.description = q + '\n\n' + sn.description;
  await yt.videos.update({ part: 'snippet', requestBody: { id, snippet: { title: sn.title, description: sn.description, tags: sn.tags, categoryId: sn.categoryId, defaultLanguage: sn.defaultLanguage } } });
  console.log(id, '|', old, '=>', title);
}})().catch(e => { console.error(e.message); process.exit(1); });

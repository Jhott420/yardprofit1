// Fresh YouTube sign-in for the Cattle Ledger tools (upload.js, seo.js, weekly.js).
//   node beef/signin.js <agentDir> url              -> prints the Google sign-in link
//   node beef/signin.js <agentDir> code <url|code>  -> saves config/tokens.json
// <agentDir>/config/credentials.json may be Google's downloaded OAuth client file
// ({"installed": {...}} or {"web": {...}}) or the agent's format ({"youtube": {client_id, client_secret}}).
// After signing in, Google sends the browser to http://localhost/?code=... (the page won't load; that's expected).
// Paste that whole address back as <url|code>.
const path = require('path'), fs = require('fs');
const dir = path.resolve(process.argv[2]);
const { google } = require(path.join(dir, 'node_modules', 'googleapis'));
const credPath = path.join(dir, 'config/credentials.json');
const raw = JSON.parse(fs.readFileSync(credPath));
const c = raw.youtube || raw.installed || raw.web;
if (!c || !c.client_id || !c.client_secret) throw new Error('credentials.json has no client_id/client_secret');
if (!raw.youtube) fs.writeFileSync(credPath, JSON.stringify({ youtube: { client_id: c.client_id, client_secret: c.client_secret } }, null, 1));
const REDIRECT = 'http://localhost';
const auth = new google.auth.OAuth2(c.client_id, c.client_secret, REDIRECT);
const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];
(async () => {
  if (process.argv[3] === 'url') {
    console.log(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES }));
  } else if (process.argv[3] === 'code') {
    let code = process.argv[4] || '';
    try { code = new URL(code).searchParams.get('code') || code; } catch {}
    const { tokens } = await auth.getToken(decodeURIComponent(code));
    if (!tokens.refresh_token) throw new Error('No refresh token returned; open the sign-in link again (it forces consent).');
    fs.writeFileSync(path.join(dir, 'config/tokens.json'), JSON.stringify({ youtube: tokens }, null, 1));
    auth.setCredentials(tokens);
    const me = await google.youtube({ version: 'v3', auth }).channels.list({ part: ['snippet'], mine: true });
    console.log('signed in as channel:', me.data.items?.[0]?.snippet?.title);
  } else throw new Error('usage: signin.js <agentDir> url | code <url|code>');
})().catch(e => { console.error(e.message); process.exit(1); });

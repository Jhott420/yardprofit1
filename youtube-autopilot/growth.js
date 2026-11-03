// Growth steps run after a video is published: a clean curiosity title, hashtags,
// a channel playlist, and a vertical animated Short that points back to the full video.
//
//   AGENT_DIR=... node growth.js --video <youtubeId> --production <productionId>   # apply to an existing video
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSceneClips } = require('./animate');

const PLAYLIST_TITLE = process.env.PLAYLIST_TITLE || 'Explained Simply';
const HELPER_MODEL = process.env.HELPER_MODEL || 'gemini-3.5-flash-lite';
const TTS_MODELS = (process.env.TTS_MODELS || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts').split(',');
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Kore';
const SHORT_MAX_SECONDS = 58;

const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function agentFiles(agentDir) {
  const read = file => JSON.parse(fs.readFileSync(path.join(agentDir, 'config', file), 'utf8'));
  return { credentials: read('credentials.json'), tokens: read('tokens.json') };
}

function youtube(agentDir) {
  const { google } = require(path.join(agentDir, 'node_modules', 'googleapis'));
  const { credentials, tokens } = agentFiles(agentDir);
  const auth = new google.auth.OAuth2(credentials.youtube.client_id, credentials.youtube.client_secret);
  auth.setCredentials(tokens.youtube);
  return google.youtube({ version: 'v3', auth });
}

async function gemini(agentDir, prompt) {
  const key = agentFiles(agentDir).credentials.gemini?.apiKey;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${HELPER_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.8 } }),
      signal: AbortSignal.timeout(120000)
    });
    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (res.ok && text) return JSON.parse(text);
    log(`Gemini helper attempt ${attempt} failed: ${json.error?.message || 'empty response'}`);
    await sleep(15000 * attempt);
  }
  throw new Error('Gemini helper model did not respond');
}

// Removes the agent's template suffixes like ": The Complete Guide" or ": Beginner to Expert Guide".
function stripTemplateSuffix(title) {
  return String(title || '')
    .replace(/\s*[:|\-–—]\s*(the\s+)?(complete|ultimate|full|definitive|beginner|expert|step[- ]by[- ]step)\b[^:|]*$/i, '')
    .replace(/^the ultimate guide to\s+/i, '')
    .trim();
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'vs', 'via']);

// Gemini sometimes returns titles in all lowercase; YouTube titles read better in Title Case.
function titleCase(text) {
  return String(text || '').split(' ').map((word, i) => {
    if (!word || /[A-Z]/.test(word.slice(1))) return word; // keep acronyms and names like "iPhone"
    const lower = word.toLowerCase();
    return i > 0 && SMALL_WORDS.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

const narrationOf = scenes => [...scenes].sort((a, b) => a.position - b.position).map(s => s.scriptText || s.script_text || '').join('\n');

async function packaging(agentDir, title, narration) {
  const result = await gemini(agentDir, `You package a faceless YouTube explainer video so more people click and keep watching, without misleading them.
Current title: ${stripTemplateSuffix(title)}
Narration: ${narration.slice(0, 6000)}
Return JSON {"title": "...", "hashtags": ["#...", "#...", "#..."]}.
title: Title Case, max 60 characters, a curiosity gap or surprising claim the video really delivers on, plain words, no ALL CAPS words,
no emojis, no colon-suffix like "Complete Guide", no clickbait the video does not pay off.
hashtags: 3 broad, real hashtags people browse (e.g. #psychology #science #facts).`);
  const clean = titleCase(stripTemplateSuffix(result.title || '').slice(0, 100)) || stripTemplateSuffix(title);
  const hashtags = (result.hashtags || []).map(tag => `#${String(tag).replace(/[^\w]/g, '')}`).filter(tag => tag.length > 1).slice(0, 3);
  return { title: clean, hashtags };
}

async function ensurePlaylist(yt) {
  const lists = await yt.playlists.list({ part: 'snippet', mine: true, maxResults: 50 });
  const found = lists.data.items?.find(item => item.snippet.title === PLAYLIST_TITLE);
  if (found) return found.id;
  const created = await yt.playlists.insert({
    part: 'snippet,status',
    requestBody: { snippet: { title: PLAYLIST_TITLE, description: 'Short, clear explanations of everyday science, psychology and history.' }, status: { privacyStatus: 'public' } }
  });
  return created.data.id;
}

async function addToPlaylist(yt, playlistId, videoId) {
  // A just-created playlist can 404 for a short while, so retry before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      const existing = await yt.playlistItems.list({ part: 'snippet', playlistId, videoId, maxResults: 1 });
      if (existing.data.items?.length) return;
      await yt.playlistItems.insert({ part: 'snippet', requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } } });
      return;
    } catch (error) {
      if (attempt >= 4 || !/cannot be found|notFound/i.test(error.message)) throw error;
      await sleep(15000 * attempt);
    }
  }
}

async function polishVideo({ agentDir, videoId, narration }) {
  const yt = youtube(agentDir);
  const video = (await yt.videos.list({ part: 'snippet', id: videoId })).data.items?.[0];
  if (!video) throw new Error(`Video ${videoId} not found`);
  const { title, hashtags } = await packaging(agentDir, video.snippet.title, narration);
  // The agent's description template credits background music these videos don't have.
  let description = (video.snippet.description || '').split('\n').filter(line => !/background music/i.test(line)).join('\n');
  if (hashtags.length && !description.includes(hashtags[0])) description = `${description.trim()}\n\n${hashtags.join(' ')}`;
  await yt.videos.update({
    part: 'snippet',
    requestBody: { id: videoId, snippet: { ...video.snippet, title, description, categoryId: video.snippet.categoryId || '27' } }
  });
  const playlistId = await ensurePlaylist(yt);
  await addToPlaylist(yt, playlistId, videoId);
  log(`polished ${videoId}: "${title}" ${hashtags.join(' ')}`);
  return { title, hashtags, playlistId };
}

// ---------- Shorts ----------

function ffmpeg(agentDir) {
  return require(path.join(agentDir, 'node_modules', 'ffmpeg-static'));
}

async function speak(agentDir, text, outWav) {
  const key = agentFiles(agentDir).credentials.gemini?.apiKey;
  for (const model of TTS_MODELS) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Say in an upbeat, curious explainer voice: ${text}` }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } } }
      }),
      signal: AbortSignal.timeout(180000)
    });
    const json = await res.json();
    const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part) {
      const rate = Number((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
      const pcm = path.join(path.dirname(outWav), 'short.pcm');
      fs.writeFileSync(pcm, Buffer.from(part.inlineData.data, 'base64'));
      execFileSync(ffmpeg(agentDir), ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', pcm, outWav]);
      return fs.statSync(pcm).size / 2 / rate;
    }
    log(`Short TTS on ${model} failed: ${json.error?.message?.split('\n')[0] || 'no audio'}`);
  }
  throw new Error('No TTS model produced audio for the Short');
}

async function makeShort({ agentDir, mainVideoId, mainTitle, narration, workDir, channel, seed }) {
  fs.mkdirSync(workDir, { recursive: true });
  const plan = await gemini(agentDir, `Turn this explainer into a YouTube Short (vertical, under 55 seconds spoken).
Video title: ${mainTitle}
Full narration: ${narration.slice(0, 6000)}
Write 4 or 5 segments totalling 105-125 words. Segment 1 is a scroll-stopping hook (a surprising fact or question) in under 12 words.
The last segment pays off the hook and ends with "Full video on the channel."
Every headline and bullet must state a specific, concrete fact or claim from the narration (names, numbers, mechanisms); never vague filler like \"fascinating science\", \"core components\" or \"key concepts\".
Use only facts from the narration. Each segment gets an on-screen card: kicker (2-3 words), headline (max 7 words), points (0-2 bullets, max 5 words).
Return JSON {"title": "<max 55 chars, curiosity hook, no hashtags>", "segments": [{"text": "", "card": {"kicker": "", "headline": "", "points": []}}]}`);
  if (!Array.isArray(plan.segments) || plan.segments.length < 3) throw new Error('Short plan has too few segments');

  const wav = path.join(workDir, 'short.wav');
  let seconds = await speak(agentDir, plan.segments.map(s => s.text).join(' '), wav);
  let audio = wav;
  if (seconds > SHORT_MAX_SECONDS) {
    const tempo = seconds / SHORT_MAX_SECONDS;
    if (tempo > 1.2) throw new Error(`Short narration is ${seconds.toFixed(1)}s, too long to fit`);
    audio = path.join(workDir, 'short_fast.wav');
    execFileSync(ffmpeg(agentDir), ['-y', '-loglevel', 'error', '-i', wav, '-filter:a', `atempo=${tempo.toFixed(3)}`, audio]);
    seconds = SHORT_MAX_SECONDS;
  }

  // Give each card screen time in proportion to how much of the narration it covers.
  const lengths = plan.segments.map(s => s.text.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const durations = lengths.map(length => (length / total) * seconds);
  const clips = await renderSceneClips({
    agentDir, cards: plan.segments.map(s => s.card), durations, outDir: workDir, seed, channel, vertical: true
  });

  const output = path.join(workDir, 'short.mp4');
  const inputs = clips.flatMap(clip => ['-i', clip]);
  const filter = clips.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30[v${i}]`).join(';') +
    `;${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[v]`;
  execFileSync(ffmpeg(agentDir), ['-y', '-loglevel', 'error', ...inputs, '-i', audio, '-filter_complex', filter,
    '-map', '[v]', '-map', `${clips.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', output]);

  const yt = youtube(agentDir);
  const title = `${stripTemplateSuffix(plan.title).slice(0, 88)} #Shorts`;
  const uploaded = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title,
        description: `${plan.segments[0].text}\n\nWatch the full video: https://youtu.be/${mainVideoId}\n\n#Shorts #explained #facts`,
        tags: ['shorts', 'explained', 'facts', 'science', 'psychology'],
        categoryId: '27'
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
    },
    media: { body: fs.createReadStream(output) }
  });
  log(`Short published: https://youtube.com/shorts/${uploaded.data.id} "${title}"`);
  return { id: uploaded.data.id, url: `https://youtube.com/shorts/${uploaded.data.id}`, title, seconds, file: output };
}

module.exports = { polishVideo, makeShort, stripTemplateSuffix, narrationOf };

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const agentDir = path.resolve(process.env.AGENT_DIR || path.join(__dirname, '..', 'youtube-automation-agent'));
  const videoId = value('--video');
  const productionId = value('--production');
  if (!videoId || !productionId) {
    console.error('Usage: node growth.js --video <youtubeId> --production <productionId> [--no-short]');
    process.exit(2);
  }
  (async () => {
    const envKey = (fs.readFileSync(path.join(agentDir, '.env'), 'utf8').match(/^API_KEY=(.*)$/m) || [])[1];
    const res = await fetch(`${process.env.AGENT_URL || 'http://127.0.0.1:3456'}/api/content/${productionId}`, { headers: { 'x-api-key': envKey } });
    const bundle = await res.json();
    const narration = narrationOf((bundle.result || bundle).scenes || []);
    const polished = await polishVideo({ agentDir, videoId, narration });
    if (!args.includes('--no-short')) {
      const stateDir = path.resolve(process.env.STATE_DIR || path.join(__dirname, 'state'));
      await makeShort({
        agentDir, mainVideoId: videoId, mainTitle: polished.title, narration,
        workDir: path.join(stateDir, 'shorts', videoId), channel: process.env.CHANNEL_LABEL || 'Explained Simply', seed: polished.title
      });
    }
  })().catch(error => { log(`FAILED: ${error.message}`); process.exit(1); });
}

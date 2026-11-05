// Growth steps run after a video is published: honest curiosity title, bold thumbnail,
// search-friendly description with chapters, tags and hashtags, an engagement comment,
// a channel playlist, and a vertical animated Short that points back to the full video.
//
//   AGENT_DIR=... node growth.js --video <youtubeId> --production <productionId> [--no-short]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSceneClips, renderThumbnail } = require('./animate');

const PLAYLIST_TITLE = process.env.PLAYLIST_TITLE || 'Explained Simply';
// Small fast models first; when one is overloaded ("high demand") the next is tried.
const HELPER_MODELS = (process.env.HELPER_MODELS || 'gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.7-flash').split(',');
// Shorts try the model that follows spoken-style directions first (the 3.x TTS models read them aloud).
const SHORT_TTS_MODELS = (process.env.SHORT_TTS_MODELS || 'gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts,gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-3.8-flash-lite-tts').split(',');
const DIRECTED_TTS_MODELS = new Set(['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']);
const SHORT_VOICE = process.env.SHORT_TTS_VOICE || 'Fenrir';
const SHORT_DIRECTION = 'Narrate this like a gripping short-form storyteller: energetic, curious and punchy, with a dramatic pause after the first line: ';
const SHORT_MAX_SECONDS = 58;

const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function agentFiles(agentDir) {
  const read = file => JSON.parse(fs.readFileSync(path.join(agentDir, 'config', file), 'utf8'));
  return { credentials: read('credentials.json'), tokens: read('tokens.json') };
}

const geminiKey = agentDir => agentFiles(agentDir).credentials.gemini?.apiKey;

function youtube(agentDir) {
  const { google } = require(path.join(agentDir, 'node_modules', 'googleapis'));
  const { credentials, tokens } = agentFiles(agentDir);
  const auth = new google.auth.OAuth2(credentials.youtube.client_id, credentials.youtube.client_secret);
  auth.setCredentials(tokens.youtube);
  return google.youtube({ version: 'v3', auth });
}

async function gemini(agentDir, parts, { json = true } = {}) {
  const attempts = HELPER_MODELS.length * 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const model = HELPER_MODELS[(attempt - 1) % HELPER_MODELS.length];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': geminiKey(agentDir), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: typeof parts === 'string' ? [{ text: parts }] : parts }],
        generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.8 } : { temperature: 0 }
      }),
      signal: AbortSignal.timeout(120000)
    });
    const body = await res.json();
    const text = body.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    if (res.ok && text) return json ? JSON.parse(text) : text;
    log(`Gemini helper attempt ${attempt} (${model}) failed: ${body.error?.message || 'empty response'}`);
    await sleep(Math.min(60000, 10000 * attempt));
  }
  throw new Error('Gemini helper models did not respond');
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

const normalizeText = text => String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

const sortedScenes = scenes => [...scenes].sort((a, b) => a.position - b.position);
const narrationOf = scenes => sortedScenes(scenes).map(s => s.scriptText || s.script_text || '').join('\n');

function timestamp(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// YouTube chapters need a 0:00 start, at least 3 entries and at least 10 seconds each.
function chapters(scenes, titles) {
  const list = [];
  let at = 0;
  sortedScenes(scenes).forEach((scene, i) => {
    const title = String(titles[i] || scene.label || '').trim();
    if (title && (!list.length || at - list[list.length - 1].at >= 10)) list.push({ at, title });
    at += Number(scene.duration) || 0;
  });
  return list.length >= 3 ? list.map(c => `${timestamp(c.at)} ${c.title}`).join('\n') : '';
}

async function packaging(agentDir, title, scenes, avoidThumbTexts = []) {
  // The helper model occasionally drops fields or repeats a recent thumbnail, so check and ask again.
  const used = new Set(avoidThumbTexts.map(normalizeText));
  for (let attempt = 1; ; attempt++) {
    const pack = await packagingOnce(agentDir, title, scenes, avoidThumbTexts);
    const missing = ['title', 'thumbnail.text', 'hashtags', 'tags'].filter(field =>
      field === 'thumbnail.text' ? !pack.thumbnail.text || used.has(normalizeText(pack.thumbnail.text))
        : !(Array.isArray(pack[field]) ? pack[field].length : pack[field]));
    if (!missing.length || attempt >= 3) {
      if (missing.length) log(`packaging still missing ${missing.join(', ')}; using what we have`);
      return pack;
    }
    log(`packaging missing ${missing.join(', ')}; retrying`);
  }
}

async function packagingOnce(agentDir, title, scenes, avoidThumbTexts = []) {
  const narration = narrationOf(scenes);
  const result = await gemini(agentDir, `You package a faceless YouTube explainer video to maximise clicks and watch time without misleading anyone.
Current title: ${stripTemplateSuffix(title)}
Scenes (in order): ${JSON.stringify(sortedScenes(scenes).map(s => ({ label: s.label, opening: String(s.scriptText || s.script_text || '').slice(0, 160) })))}
Narration: ${narration.slice(0, 6000)}

Return JSON:
{"title": "", "thumbnail": {"text": "", "accent": "", "tag": "", "glyph": ""}, "hook": "", "chapters": [], "tags": [], "hashtags": [], "comment": ""}
- title: Title Case, max 60 characters, a curiosity gap or surprising claim the video truly pays off, the main search keyword near the start,
  no ALL CAPS words, no emojis, no "Complete Guide"-style suffix.
  Never exaggerate past what the narration says: no "destroys", "ruins", "shocking", "insane" or "secret" unless literally true.
- thumbnail.text: 2-4 punchy words specific to THIS topic that ADD to the title (do not repeat it). It must not reuse or resemble
  these recent thumbnails: ${JSON.stringify(avoidThumbTexts)}. Avoid generic "your brain ..." phrasing. thumbnail.accent: the one word to colour.
  thumbnail.tag: 1-2 word topic label. thumbnail.glyph: one character to show huge in the background, such as ? or ! or a digit.
- hook: the first two lines of the description, 1-2 sentences, keyword-rich, makes people want to watch.
- chapters: one short chapter title (max 5 words) per scene, same count and order as the scenes; specific, not "Introduction"/"Conclusion".
- tags: 12-15 search phrases people actually type, mixing broad and specific.
- hashtags: 3 real hashtags people browse.
- comment: one friendly question that invites viewers to share their own experience of the topic.`);
  return {
    title: titleCase(stripTemplateSuffix(result.title || '').slice(0, 100)) || stripTemplateSuffix(title),
    thumbnail: result.thumbnail || {},
    hook: String(result.hook || '').trim(),
    chapters: Array.isArray(result.chapters) ? result.chapters : [],
    tags: (result.tags || []).map(String).filter(Boolean).slice(0, 15),
    hashtags: (result.hashtags || []).map(tag => `#${String(tag).replace(/[^\w]/g, '')}`).filter(tag => tag.length > 1).slice(0, 3),
    comment: String(result.comment || '').trim()
  };
}

// Drops the agent's unreliable "Timestamps:" block and its false background-music credit.
function cleanAgentDescription(description) {
  return String(description || '')
    .replace(/([.!?])([A-Z])/g, '$1\n\n$2') // restore paragraph breaks the agent's text sometimes loses
    .replace(/Timestamps:[\s\S]*?(?=\n\n|$)/gi, '') // its timestamps are estimates and often wrong
    .split('\n')
    .filter(line => !/background music/i.test(line) && !/^\s*(timestamps|chapters):?\s*$/i.test(line)
      && !/^\s*\d{1,2}:\d{2}\s*[-–—]?\s*\S/.test(line) && !/^\s*(#\w+\s*)+$/.test(line) && !/^More in the .* playlist/i.test(line)) // polish adds fresh chapters and hashtags
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

async function postQuestion(yt, videoId, text) {
  if (!text) return;
  const mine = await yt.commentThreads.list({ part: 'snippet', videoId, maxResults: 20, order: 'time' }).catch(() => null);
  const channelId = (await yt.channels.list({ part: 'id', mine: true })).data.items?.[0]?.id;
  if (mine?.data.items?.some(item => item.snippet.topLevelComment.snippet.authorChannelId?.value === channelId)) return;
  await yt.commentThreads.insert({ part: 'snippet', requestBody: { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } } });
}

async function polishVideo({ agentDir, videoId, scenes, workDir, avoidThumbTexts = [] }) {
  const yt = youtube(agentDir);
  const video = (await yt.videos.list({ part: 'snippet', id: videoId })).data.items?.[0];
  if (!video) throw new Error(`Video ${videoId} not found`);
  const pack = await packaging(agentDir, video.snippet.title, scenes, avoidThumbTexts);

  const chapterBlock = chapters(scenes, pack.chapters);
  const description = [
    pack.hook,
    chapterBlock && `Chapters:\n${chapterBlock}`,
    cleanAgentDescription(video.snippet.description),
    `More in the ${PLAYLIST_TITLE} playlist on the channel.`,
    pack.hashtags.join(' ')
  ].filter(Boolean).join('\n\n').slice(0, 4900);
  // YouTube rejects tags containing < > " , or # and very long ones.
  const cleanTag = tag => String(tag).replace(/[<>",#]/g, ' ').replace(/\s+/g, ' ').trim();
  const tags = [...new Set([...pack.tags, ...(video.snippet.tags || [])].map(cleanTag).filter(tag => tag.length >= 2 && tag.length <= 60))];
  // YouTube caps tags at 500 characters, counting quotes around multi-word tags and separators.
  const tagBudget = list => list.reduce((sum, tag) => sum + tag.length + (tag.includes(' ') ? 2 : 0) + 1, 0);
  while (tagBudget(tags) > 450) tags.pop();
  await yt.videos.update({
    part: 'snippet',
    requestBody: { id: videoId, snippet: { ...video.snippet, title: pack.title, description, tags, categoryId: video.snippet.categoryId || '27' } }
  });

  if (pack.thumbnail.text) {
    fs.mkdirSync(workDir, { recursive: true });
    const thumbPath = path.join(workDir, 'thumbnail-bold.jpg');
    await renderThumbnail({ agentDir, outputPath: thumbPath, seed: pack.title, thumb: { hook: pack.thumbnail.text, accent: pack.thumbnail.accent, tag: pack.thumbnail.tag, glyph: pack.thumbnail.glyph } });
    await yt.thumbnails.set({ videoId, media: { mimeType: 'image/jpeg', body: fs.createReadStream(thumbPath) } })
      .catch(error => log(`thumbnail upload failed: ${error.message}`));
  }

  const playlistId = await ensurePlaylist(yt);
  await addToPlaylist(yt, playlistId, videoId);
  await postQuestion(yt, videoId, pack.comment).catch(error => log(`comment failed: ${error.message}`));
  log(`polished ${videoId}: "${pack.title}" | thumb "${pack.thumbnail.text}" | ${pack.hashtags.join(' ')} | ${chapterBlock ? 'chapters' : 'no chapters'}`);
  return { ...pack, playlistId };
}

// ---------- Shorts ----------

const ffmpeg = agentDir => require(path.join(agentDir, 'node_modules', 'ffmpeg-static'));

// Some TTS models speak a style direction aloud instead of following it; transcribe and check.
async function spokeDirection(agentDir, wav) {
  const mp3 = wav.replace(/\.wav$/, '_check.mp3');
  execFileSync(ffmpeg(agentDir), ['-y', '-loglevel', 'error', '-i', wav, '-t', '12', '-c:a', 'libmp3lame', mp3]);
  const transcript = await gemini(agentDir, [
    { inlineData: { mimeType: 'audio/mp3', data: fs.readFileSync(mp3).toString('base64') } },
    { text: 'Transcribe every word spoken, verbatim. Output only the transcript.' }
  ], { json: false });
  return /narrate|storyteller|short-form|in an? [\w\s,-]*voice/i.test(transcript.slice(0, 160));
}

async function speak(agentDir, text, outWav) {
  for (const model of SHORT_TTS_MODELS) {
    const attempts = DIRECTED_TTS_MODELS.has(model) ? [SHORT_DIRECTION, ''] : [''];
    for (const direction of attempts) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': geminiKey(agentDir), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: direction + text }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SHORT_VOICE } } } }
        }),
        signal: AbortSignal.timeout(180000)
      });
      const json = await res.json();
      const part = json.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part) {
        log(`Short TTS on ${model} failed: ${json.error?.message?.split('\n')[0] || 'no audio'}`);
        break; // quota or model error: move on to the next model
      }
      const rate = Number((part.inlineData.mimeType.match(/rate=(\d+)/) || [])[1] || 24000);
      const pcm = path.join(path.dirname(outWav), 'short.pcm');
      fs.writeFileSync(pcm, Buffer.from(part.inlineData.data, 'base64'));
      execFileSync(ffmpeg(agentDir), ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', pcm, outWav]);
      if (direction && await spokeDirection(agentDir, outWav)) {
        log(`${model} read the style direction aloud; retrying without it`);
        continue;
      }
      log(`Short narration: ${model}, voice ${SHORT_VOICE}${direction ? ', storyteller direction' : ''}`);
      return fs.statSync(pcm).size / 2 / rate;
    }
  }
  throw new Error('No TTS model produced usable audio for the Short');
}

async function makeShort({ agentDir, mainVideoId, mainTitle, scenes, workDir, channel, seed }) {
  fs.mkdirSync(workDir, { recursive: true });
  const plan = await gemini(agentDir, `Turn this explainer into a YouTube Short (vertical, under 55 seconds spoken) built to stop the scroll and be rewatched.
Video title: ${mainTitle}
Full narration: ${narrationOf(scenes).slice(0, 6000)}
Write 4 or 5 segments totalling 100-120 words. Segment 1 is the hook: one surprising, specific fact or question in under 12 words, no greeting.
Middle segments deliver concrete facts fast. The last segment pays off the hook and ends with "Full video on the channel."
Every headline and bullet must state a specific, concrete fact or claim from the narration (names, numbers, mechanisms); never vague filler like "fascinating science", "core components" or "key concepts".
Use only facts from the narration. Each segment gets an on-screen card: kicker (2-3 words), headline (max 7 words), points (0-2 bullets, max 5 words).
Return JSON {"title": "<max 55 chars, curiosity hook that does not exaggerate past the narration, no hashtags>", "hashtags": ["#..", "#.."], "segments": [{"text": "", "card": {"kicker": "", "headline": "", "points": []}}]}`);
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

  const hashtags = ['#Shorts', ...(plan.hashtags || []).map(tag => `#${String(tag).replace(/[^\w]/g, '')}`).filter(tag => tag.length > 1)].slice(0, 4);
  const yt = youtube(agentDir);
  const title = `${titleCase(stripTemplateSuffix(plan.title)).slice(0, 88)} #Shorts`;
  const uploaded = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title,
        description: `${plan.segments[0].text}\n\nWatch the full video: https://youtu.be/${mainVideoId}\n\n${hashtags.join(' ')}`,
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

module.exports = { polishVideo, makeShort, stripTemplateSuffix, narrationOf, cleanAgentDescription };

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
    const body = await res.json();
    const scenes = (body.result || body).scenes || [];
    if (!scenes.length) throw new Error(`No scenes found for ${productionId}`);
    const stateDir = path.resolve(process.env.STATE_DIR || path.join(__dirname, 'state'));
    const workDir = path.join(stateDir, 'growth', videoId);
    const polished = await polishVideo({ agentDir, videoId, scenes, workDir });
    if (!args.includes('--no-short')) {
      await makeShort({
        agentDir, mainVideoId: videoId, mainTitle: polished.title, scenes,
        workDir: path.join(workDir, 'short'), channel: process.env.CHANNEL_LABEL || 'Explained Simply', seed: polished.title
      });
    }
  })().catch(error => { log(`FAILED: ${error.message}`); process.exit(1); });
}

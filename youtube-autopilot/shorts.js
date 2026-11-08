#!/usr/bin/env node
// Faceless Shorts engine. Each format sets the writing brief, fact source, voice, look and metadata:
//   horror — a true science fact told like a horror story (dark stickman theme, ominous narrator)
//   gta6   — GTA 6 news/facts with a release countdown, written ONLY from facts/gta6.md (neon theme, hyped narrator)
// Runs on its own; the agent server is not needed.
//
//   AGENT_DIR=... node shorts.js --format gta6 [--topic "..."] [--no-publish]
//   AGENT_DIR=... node shorts.js --upload <state/shorts/...>    # publish a Short rendered earlier with --no-publish
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSceneClips } = require('./animate');
const { gemini, speak, youtube, ffmpeg, postQuestion } = require('./growth');

const AGENT_DIR = path.resolve(process.env.AGENT_DIR || path.join(__dirname, '..', 'youtube-automation-agent'));
const STATE_DIR = path.resolve(process.env.STATE_DIR || path.join(__dirname, 'state'));
const MAX_SECONDS = 58;
// Fact-checking needs a stronger model than the small helper used for writing.
const CHECK_MODELS = (process.env.FACTCHECK_MODELS || 'gemini-3.5-flash,gemini-3.7-flash,gemini-3.1-pro-preview').split(',');

const args = process.argv.slice(2);
const argValue = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const log = (...parts) => console.log(new Date().toISOString(), ...parts);

const CARD_SPEC = `Each segment gets an on-screen card: kicker (2-3 words), headline (max 6 words, specific), points (0-2 short lines, max 4 words each)`;

// Rotating angles keep the channel varied (YouTube's monetization review rejects repetitive, mass-produced uploads).
const HORROR_ANGLES = [
  'WHAT IF: a science-based hypothetical ("What if the Moon disappeared?", "What if you fell into a black hole?"). The premise is imaginary; everything that follows must be real physics/biology. Make the concept the question itself, e.g. "WHAT IF THE MOON DISAPPEARED?".',
  'SCARY TRUE FACT: one real, unsettling fact about space, the deep ocean, nature or physics, told like a horror story.',
  'TOP 3 RANKING: the 3 most terrifying real examples of something (e.g. "3 deadliest places in the universe"), counting down to the worst.',
  'YOUR BODY: what really happens to the human body in an extreme situation (no sleep, space without a suit, deepest dive), step by step. No medical advice.'
];
const horrorAngle = () => HORROR_ANGLES[history('horror').length % HORROR_ANGLES.length];

const GTA6_RELEASE = '2026-11-19';
function gtaCountdown() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const days = Math.round((Date.parse(GTA6_RELEASE) - Date.parse(today)) / 86400000);
  if (days > 1) return { days, label: `${days} DAYS LEFT`, line: `GTA 6 releases in ${days} days (19 November 2026).` };
  if (days === 1) return { days, label: 'OUT TOMORROW', line: 'GTA 6 releases tomorrow, 19 November 2026.' };
  if (days === 0) return { days, label: 'OUT TODAY', line: 'GTA 6 releases today, 19 November 2026.' };
  return { days, label: 'OUT NOW', line: `GTA 6 came out on 19 November 2026, ${-days} days ago.` };
}

const FORMATS = {
  horror: {
    channel: 'STICKMAN HORROR',
    theme: 'horror',
    voice: process.env.HORROR_VOICE || 'Algenib',
    direction: 'Narrate this like a chilling horror storyteller: low, slow and ominous, building dread, with dramatic pauses: ',
    spokenDirection: /narrate|horror storyteller|ominous|building dread/i,
    atmosphere: true,
    brief: () => `You write viral "Stickman Horror" YouTube Shorts: real science told like a horror story, narrated over a creepy stickman animation.
This Short's angle: ${horrorAngle()}`,
    rules: `- Every claim must be true and mainstream science. Say "scientists think" for anything theoretical. No made-up numbers.
- Be dramatic in tone and pacing, never in facts: no metaphors that state something literally false.
- Creepy, not gory. No real named people, no medical scare claims, nothing about self-harm.
- 5 or 6 segments, 65-85 words in total (the narrator reads slowly), short punchy sentences.
- Segment 1 is the hook: a shocking statement in under 10 words, no greeting.
- Build dread, then end on a chilling final line followed by "Follow for more stickman horror."
- ${CARD_SPEC}, pose (one of stand, reach, hunch, point), scale (tiny for cosmic size, huge for overwhelming, else normal).
  Kicker examples: "FACT 01", "SCALE", "THE CATCH".`,
    checkPrompt: script => `You are fact-checking a 40-second science Short for a general audience.
Grade each factual claim: "true" (accurate), "simplified" (loose wording or dramatic framing a scientist would accept for a popular video),
or "false" (wrong, invented, or states a speculative idea as certain fact). Do not grade metaphors or tone, only factual content.
A clearly hypothetical "what if" premise is fine; grade whether what the script says would happen is real science.
Script: ${JSON.stringify(script.segments.map(s => s.text))}
Return JSON {"claims": [{"claim": "", "verdict": "true|simplified|false", "why": ""}]}.`,
    title: concept => `${concept} | Stickman Horror #shorts`,
    baseHashtags: ['#shorts', '#stickman', '#horror'],
    tags: concept => ['stickman horror', 'what if', 'scary facts', 'science horror', 'creepy science', concept.toLowerCase(), 'shorts'],
    categoryId: '24',
    footer: ''
  },
  gta6: {
    channel: 'GTA 6 DAILY',
    theme: 'neon',
    voice: process.env.GTA_VOICE || 'Puck',
    direction: 'Narrate this like a hyped gaming YouTuber: fast, excited and punchy, with energy on every key fact: ',
    spokenDirection: /narrate|hyped gaming|youtuber|punchy/i,
    atmosphere: false,
    facts: () => fs.readFileSync(path.join(__dirname, 'facts', 'gta6.md'), 'utf8'),
    brief: () => `You write viral YouTube Shorts for a GTA 6 fan channel. ${gtaCountdown().line}
Use ONLY facts from this fact sheet. Labels: [confirmed], [reported] and [estimate] must be kept in your wording
(say "reportedly" for [reported], and "analysts estimate" for [estimate]).
FACT SHEET:
${FORMATS.gta6.facts()}`,
    rules: `- Never invent features, leaks, release info, prices or numbers. Nothing that is not on the fact sheet.
- Angles that work: shocking numbers, things most fans missed, "GTA 6 will let you...", records, the countdown, controversies (discs, 30 FPS, price).
- 4 to 6 segments, 70-95 words in total, fast punchy sentences.
- Segment 1 is the hook: a surprising, specific claim in under 10 words, no greeting.
- End with a question to the viewer, then "Follow for daily GTA 6 news."
- ${CARD_SPEC}. Use "${gtaCountdown().label}" as the first card's kicker.
- Fan channel tone. Never claim to be Rockstar, never use official logos.`,
    checkPrompt: script => `Check this GTA 6 Short against the fact sheet below. Grade each factual claim:
"supported" (the sheet says it), "unsupported" (not on the sheet), or "contradicts" (the sheet says otherwise, or a [reported]/[estimate] item is stated as confirmed fact).
Opinions, hype and questions to the viewer are not claims.
FACT SHEET:
${FORMATS.gta6.facts()}
Script: ${JSON.stringify(script.segments.map(s => s.text))}
Return JSON {"claims": [{"claim": "", "verdict": "supported|unsupported|contradicts", "why": ""}]}.`,
    blocking: ['unsupported', 'contradicts'],
    title: concept => `${concept} | GTA 6 #shorts`,
    baseHashtags: ['#shorts', '#gta6', '#gtavi'],
    tags: concept => ['gta 6', 'gta vi', 'gta 6 news', 'gta 6 release date', 'vice city', 'leonida', concept.toLowerCase(), 'shorts'],
    categoryId: '20',
    footer: '\n\nFan-made channel. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive.'
  }
};

const historyFile = format => path.join(STATE_DIR, `${format}-history.json`);
const history = format => { try { return JSON.parse(fs.readFileSync(historyFile(format), 'utf8')); } catch { return []; } };

async function writeScript(fmt, avoid, topic, revise) {
  const revision = revise
    ? `\nRevise this earlier draft on the same topic so every problem below is fixed, keeping the hook strong:\nDraft: ${JSON.stringify(revise.script)}\nProblems: ${JSON.stringify(revise.problems)}\n`
    : '';
  return gemini(AGENT_DIR, `${fmt.brief()}
${topic ? `Topic: ${topic}` : `Pick a fresh angle. Do not repeat or closely overlap these earlier Shorts: ${JSON.stringify(avoid)}`}${revision}

Rules:
${fmt.rules}

Return JSON:
{"topic": "", "concept": "<1-4 word ALL CAPS name for the Short>", "segments": [{"text": "", "card": {"kicker": "", "headline": "", "points": [], "pose": "", "scale": ""}}],
 "hashtags": ["#..", "#.."], "comment": "<one short question that makes viewers reply>"}`);
}

async function factCheck(fmt, script) {
  // Grade each claim; only blocking verdicts stop the Short. Short-form simplification is fine.
  const result = await gemini(AGENT_DIR, fmt.checkPrompt(script), { models: CHECK_MODELS });
  const blocking = fmt.blocking || ['false'];
  const problems = (result.claims || []).filter(c => blocking.includes(c.verdict)).map(c => `${c.claim}: ${c.why}`);
  return { ok: Array.isArray(result.claims) && result.claims.length > 0 && !problems.length, problems };
}

function addAtmosphere(voiceWav, seconds, outWav) {
  // A faint low drone (brown noise + 55 Hz hum) under the narration; generated here, so no music rights involved.
  execFileSync(ffmpeg(AGENT_DIR), ['-y', '-loglevel', 'error', '-i', voiceWav,
    '-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'anoisesrc=color=brown:amplitude=0.6',
    '-f', 'lavfi', '-t', seconds.toFixed(2), '-i', 'sine=frequency=55',
    '-filter_complex', '[1:a]lowpass=f=220,volume=0.05[n];[2:a]volume=0.035[s];[0:a][n][s]amix=inputs=3:duration=first:normalize=0[a]',
    '-map', '[a]', outWav]);
}

async function build(format) {
  const fmt = FORMATS[format];
  const avoid = history(format).slice(-80).map(item => item.concept || item.topic);
  let script;
  let revise = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    script = await writeScript(fmt, avoid, argValue('--topic') || revise?.script.topic, revise);
    if (!Array.isArray(script.segments) || script.segments.length < 4) { log('script malformed; rewriting'); script = null; revise = null; continue; }
    const check = await factCheck(fmt, script);
    if (check.ok) break;
    log(`fact-check round ${attempt} flagged: ${check.problems.join(' | ').slice(0, 300)}; revising`);
    revise = { script, problems: check.problems };
    script = null;
  }
  if (!script) throw new Error('Could not produce a script that passes the fact-check');
  const concept = String(script.concept || script.topic).toUpperCase().replace(/[^A-Z0-9 '?!\-]/g, '').trim().slice(0, 60);
  log(`concept: ${concept} — ${script.topic}`);

  const workDir = path.join(STATE_DIR, 'shorts', `${format}-${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const voiceWav = path.join(workDir, 'voice.wav');
  let seconds = await speak(AGENT_DIR, script.segments.map(s => s.text).join(' '), voiceWav,
    { voice: fmt.voice, direction: fmt.direction, spokenCheck: fmt.spokenDirection });
  let audio = voiceWav;
  if (seconds > MAX_SECONDS) {
    const tempo = seconds / MAX_SECONDS;
    if (tempo > 1.2) throw new Error(`Narration is ${seconds.toFixed(1)}s, too long for a Short`);
    audio = path.join(workDir, 'voice_fast.wav');
    execFileSync(ffmpeg(AGENT_DIR), ['-y', '-loglevel', 'error', '-i', voiceWav, '-filter:a', `atempo=${tempo.toFixed(3)}`, audio]);
    seconds = MAX_SECONDS;
  }
  if (fmt.atmosphere) {
    const mixed = path.join(workDir, 'mix.wav');
    addAtmosphere(audio, seconds, mixed);
    audio = mixed;
  }

  const lengths = script.segments.map(s => s.text.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const clips = await renderSceneClips({
    agentDir: AGENT_DIR, cards: script.segments.map(s => s.card), durations: lengths.map(l => (l / total) * seconds),
    outDir: workDir, seed: concept, channel: fmt.channel, vertical: true, theme: fmt.theme
  });
  const output = path.join(workDir, 'short.mp4');
  const filter = clips.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30[v${i}]`).join(';') +
    `;${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[v]`;
  execFileSync(ffmpeg(AGENT_DIR), ['-y', '-loglevel', 'error', ...clips.flatMap(c => ['-i', c]), '-i', audio,
    '-filter_complex', filter, '-map', '[v]', '-map', `${clips.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', output]);
  log(`rendered ${output} (${seconds.toFixed(1)}s)`);
  fs.writeFileSync(path.join(workDir, 'script.json'), JSON.stringify({ format, concept, ...script }, null, 2));
  return workDir;
}

async function publish(workDir) {
  const script = JSON.parse(fs.readFileSync(path.join(workDir, 'script.json'), 'utf8'));
  const fmt = FORMATS[script.format];
  const hashtags = [...fmt.baseHashtags, ...(script.hashtags || []).map(t => `#${String(t).replace(/[^\w]/g, '')}`)]
    .filter((t, i, all) => t.length > 1 && all.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i).slice(0, 5);
  const title = fmt.title(script.concept);
  const yt = youtube(AGENT_DIR);
  const uploaded = await yt.videos.insert({
    part: 'snippet,status',
    requestBody: {
      snippet: {
        title,
        description: `${script.segments[0].text}\n\n${script.segments.slice(1).map(s => s.text).join(' ')}\n\n${hashtags.join(' ')}${fmt.footer}`,
        tags: fmt.tags(script.concept),
        categoryId: fmt.categoryId
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
    },
    media: { body: fs.createReadStream(path.join(workDir, 'short.mp4')) }
  });
  const id = uploaded.data.id;
  await postQuestion(yt, id, script.comment).catch(error => log(`comment failed: ${error.message}`));
  log(`PUBLISHED: https://youtube.com/shorts/${id} "${title}"`);
  return { format: script.format, concept: script.concept, topic: script.topic, youtubeId: id, url: `https://youtube.com/shorts/${id}`, title };
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  let record;
  if (argValue('--upload')) {
    record = await publish(path.resolve(argValue('--upload')));
  } else {
    const format = argValue('--format') || 'horror';
    if (!FORMATS[format]) throw new Error(`Unknown format "${format}"; use one of ${Object.keys(FORMATS).join(', ')}`);
    const workDir = await build(format);
    const script = JSON.parse(fs.readFileSync(path.join(workDir, 'script.json'), 'utf8'));
    record = { format, concept: script.concept, topic: script.topic, file: path.join(workDir, 'short.mp4'), workDir };
    if (!args.includes('--no-publish')) Object.assign(record, await publish(workDir));
  }
  record.at = new Date().toISOString();
  fs.writeFileSync(historyFile(record.format), JSON.stringify([...history(record.format), record], null, 2));
  fs.writeFileSync(path.join(STATE_DIR, 'last-run.json'), JSON.stringify({ ok: true, ...record }, null, 2));
}

main().catch(error => {
  log(`FAILED: ${error.message}`);
  try { fs.writeFileSync(path.join(STATE_DIR, 'last-run.json'), JSON.stringify({ ok: false, at: new Date().toISOString(), error: error.message }, null, 2)); } catch { /* ignore */ }
  process.exit(1);
});

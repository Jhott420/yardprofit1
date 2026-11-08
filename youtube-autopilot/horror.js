#!/usr/bin/env node
// Science Horror Shorts: a true, unsettling science fact told like a horror story, as a
// 30-50 second vertical Short with a glitchy stickman animation and an ominous narrator.
// Runs on its own; the agent server is not needed.
//
//   AGENT_DIR=/path/to/youtube-automation-agent node horror.js [--topic "..."] [--no-publish]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { renderSceneClips } = require('./animate');
const { gemini, speak, youtube, ffmpeg, postQuestion } = require('./growth');

const AGENT_DIR = path.resolve(process.env.AGENT_DIR || path.join(__dirname, '..', 'youtube-automation-agent'));
const STATE_DIR = path.resolve(process.env.STATE_DIR || path.join(__dirname, 'state'));
const VOICE = process.env.HORROR_VOICE || 'Algenib';
const DIRECTION = 'Narrate this like a chilling horror storyteller: low, slow and ominous, building dread, with dramatic pauses: ';
const SPOKEN_DIRECTION = /narrate|horror storyteller|ominous|building dread/i;
const MAX_SECONDS = 58;
// Fact-checking needs a stronger model than the small helper used for writing.
const CHECK_MODELS = (process.env.FACTCHECK_MODELS || 'gemini-3.5-flash,gemini-3.7-flash,gemini-3.1-pro-preview').split(',');

const args = process.argv.slice(2);
const argValue = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const log = (...parts) => console.log(new Date().toISOString(), ...parts);
const historyFile = path.join(STATE_DIR, 'horror-history.json');
const history = () => { try { return JSON.parse(fs.readFileSync(historyFile, 'utf8')); } catch { return []; } };

async function writeScript(avoid, topic, revise) {
  const revision = revise
    ? `\nRevise this earlier draft on the same topic so every problem below is fixed, keeping the hook strong:\nDraft: ${JSON.stringify(revise.script)}\nProblems: ${JSON.stringify(revise.problems)}\n`
    : '';
  return gemini(AGENT_DIR, `You write viral "Science Horror" YouTube Shorts: one TRUE, well-established science fact told like a horror story.
Examples of the vibe: vacuum decay, the heat death of the universe, what the deep ocean hides, a body process that sounds terrifying, a real space phenomenon.
${topic ? `Topic: ${topic}` : `Pick a fresh topic. Do not repeat or closely overlap these: ${JSON.stringify(avoid)}`}${revision}

Rules:
- Every claim must be true and mainstream science. Say "scientists think" for anything theoretical. No made-up numbers.
- Be dramatic in tone and pacing, never in facts: no metaphors that state something literally false.
- Creepy, not gory. No real named people, no medical scare claims, nothing about self-harm.
- 5 or 6 segments, 65-85 words in total (the narrator reads slowly), short punchy sentences.
- Segment 1 is the hook: a shocking statement in under 10 words, no greeting.
- Build dread, then end on a chilling final line followed by "Follow for more science horror."
- Each segment gets an on-screen card: kicker (2-3 words, e.g. "FACT 01", "SCALE", "THE CATCH"), headline (max 6 words, specific),
  points (0-2 terminal-style lines, max 4 words each), pose (one of stand, reach, hunch, point), scale (tiny for cosmic size, huge for overwhelming, else normal).

Return JSON:
{"topic": "", "concept": "<1-3 word ALL CAPS name, e.g. VACUUM DECAY>", "segments": [{"text": "", "card": {"kicker": "", "headline": "", "points": [], "pose": "", "scale": ""}}],
 "hashtags": ["#..", "#..", "#.."], "comment": "<one short question that makes viewers reply>"}`);
}

async function factCheck(script) {
  // Grade each claim; only outright false or misleading ones block. Short-form simplification is fine.
  const result = await gemini(AGENT_DIR, `You are fact-checking a 40-second science Short for a general audience.
Grade each factual claim: "true" (accurate), "simplified" (loose wording or dramatic framing a scientist would accept for a popular video),
or "false" (wrong, invented, or states a speculative idea as certain fact). Do not grade metaphors or tone, only factual content.
Script: ${JSON.stringify(script.segments.map(s => s.text))}
Return JSON {"claims": [{"claim": "", "verdict": "true|simplified|false", "why": ""}]}.`, { models: CHECK_MODELS });
  const problems = (result.claims || []).filter(c => c.verdict === 'false').map(c => `${c.claim}: ${c.why}`);
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

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const avoid = history().slice(-80).map(item => item.concept || item.topic);
  let script;
  let revise = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    script = await writeScript(avoid, argValue('--topic') || revise?.script.topic, revise);
    if (!Array.isArray(script.segments) || script.segments.length < 4) { log('script malformed; rewriting'); script = null; revise = null; continue; }
    const check = await factCheck(script);
    if (check.ok) break;
    log(`fact-check round ${attempt} flagged: ${check.problems.join(' | ').slice(0, 300)}; revising`);
    revise = { script, problems: check.problems };
    script = null;
  }
  if (!script) throw new Error('Could not produce a script that passes the fact-check');
  const concept = String(script.concept || script.topic).toUpperCase().replace(/[^A-Z0-9 '\-]/g, '').trim().slice(0, 40);
  log(`concept: ${concept} — ${script.topic}`);

  const workDir = path.join(STATE_DIR, 'horror', `${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  const voiceWav = path.join(workDir, 'voice.wav');
  let seconds = await speak(AGENT_DIR, script.segments.map(s => s.text).join(' '), voiceWav, { voice: VOICE, direction: DIRECTION, spokenCheck: SPOKEN_DIRECTION });
  let voice = voiceWav;
  if (seconds > MAX_SECONDS) {
    const tempo = seconds / MAX_SECONDS;
    if (tempo > 1.2) throw new Error(`Narration is ${seconds.toFixed(1)}s, too long for a Short`);
    voice = path.join(workDir, 'voice_fast.wav');
    execFileSync(ffmpeg(AGENT_DIR), ['-y', '-loglevel', 'error', '-i', voiceWav, '-filter:a', `atempo=${tempo.toFixed(3)}`, voice]);
    seconds = MAX_SECONDS;
  }
  const audio = path.join(workDir, 'mix.wav');
  addAtmosphere(voice, seconds, audio);

  const lengths = script.segments.map(s => s.text.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const clips = await renderSceneClips({
    agentDir: AGENT_DIR, cards: script.segments.map(s => s.card), durations: lengths.map(l => (l / total) * seconds),
    outDir: workDir, seed: concept, channel: 'SCIENCE HORROR', vertical: true, theme: 'horror'
  });
  const output = path.join(workDir, 'short.mp4');
  const filter = clips.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30[v${i}]`).join(';') +
    `;${clips.map((_, i) => `[v${i}]`).join('')}concat=n=${clips.length}:v=1:a=0[v]`;
  execFileSync(ffmpeg(AGENT_DIR), ['-y', '-loglevel', 'error', ...clips.flatMap(c => ['-i', c]), '-i', audio,
    '-filter_complex', filter, '-map', '[v]', '-map', `${clips.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-shortest', output]);
  log(`rendered ${output} (${seconds.toFixed(1)}s)`);

  const record = { at: new Date().toISOString(), concept, topic: script.topic, file: output };
  if (!args.includes('--no-publish')) {
    const hashtags = ['#shorts', '#sciencehorror', ...(script.hashtags || []).map(t => `#${String(t).replace(/[^\w]/g, '')}`)]
      .filter((t, i, all) => t.length > 1 && all.indexOf(t) === i).slice(0, 5);
    const title = `${concept} | Science Horror #shorts`;
    const yt = youtube(AGENT_DIR);
    const uploaded = await yt.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title,
          description: `${script.segments[0].text}\n\n${script.segments.slice(1).map(s => s.text).join(' ')}\n\n${hashtags.join(' ')}`,
          tags: ['science horror', 'scary facts', 'creepy science', 'stickman horror', concept.toLowerCase(), 'shorts'],
          categoryId: '24'
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
      },
      media: { body: fs.createReadStream(output) }
    });
    const id = uploaded.data.id;
    await postQuestion(yt, id, script.comment).catch(error => log(`comment failed: ${error.message}`));
    Object.assign(record, { youtubeId: id, url: `https://youtube.com/shorts/${id}`, title });
    log(`PUBLISHED: ${record.url} "${title}"`);
  }
  fs.writeFileSync(historyFile, JSON.stringify([...history(), record], null, 2));
  fs.writeFileSync(path.join(STATE_DIR, 'last-run.json'), JSON.stringify({ ok: true, format: 'horror', ...record }, null, 2));
}

main().catch(error => {
  log(`FAILED: ${error.message}`);
  try { fs.writeFileSync(path.join(STATE_DIR, 'last-run.json'), JSON.stringify({ ok: false, format: 'horror', at: new Date().toISOString(), error: error.message }, null, 2)); } catch { /* ignore */ }
  process.exit(1);
});

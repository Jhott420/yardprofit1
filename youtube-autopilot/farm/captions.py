#!/usr/bin/env python3
"""Burn word-by-word captions into a video (0 credits). Used since vidIQ compose only
auto-captions its OWN voiceovers, not ElevenLabs audio.

  python3 farm/captions.py in.mp4 words.json out.mp4 [--offset SECONDS] [--style short|long]

words.json: the `words` list from ElevenLabs creative_transcribe_audio
([{"text","type","start","end"}, ...]) or an object with a "words" key.
--offset shifts every word (e.g. if the voiceover started later than 0).
Style: white bold text with a black outline on a dark box, the spoken word highlighted
yellow (#FFD23F), 3 words per line for Shorts, 5 for long videos. Placed in the lower
third, clear of the number labels at the top.
"""
import json, subprocess, sys, os, tempfile, argparse

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('words'); ap.add_argument('out')
ap.add_argument('--offset', type=float, default=0.0)
ap.add_argument('--style', choices=['short', 'long'], default=None)
a = ap.parse_args()

probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', a.video]))['streams'][0]
W, H = probe['width'], probe['height']
style = a.style or ('short' if H > W else 'long')
per = 3 if style == 'short' else 5
size = int(H * (0.042 if style == 'short' else 0.055))
marginv = int(H * (0.30 if style == 'short' else 0.10))

raw = json.load(open(a.words))
words = [w for w in (raw['words'] if isinstance(raw, dict) else raw) if w.get('type', 'word') == 'word']
for w in words:
    w['start'] += a.offset; w['end'] += a.offset

# Group into chunks: break on sentence end, a pause > 0.45 s, or `per` words.
chunks, cur = [], []
for i, w in enumerate(words):
    cur.append(w)
    nxt = words[i + 1] if i + 1 < len(words) else None
    if len(cur) >= per or w['text'][-1:] in '.?!:' or (nxt and nxt['start'] - w['end'] > 0.45) or not nxt:
        chunks.append(cur); cur = []

def ts(t):
    t = max(t, 0); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'

esc = lambda s: s.replace('\\', '\\\\').replace('{', '(').replace('}', ')')
YEL, WHT = '&H003FD2FF&', '&H00FFFFFF&'   # ASS colours are BGR
lines = []
for ci, c in enumerate(chunks):
    nxt_start = chunks[ci + 1][0]['start'] if ci + 1 < len(chunks) else 1e9
    for j, w in enumerate(c):
        start = w['start']
        end = c[j + 1]['start'] if j + 1 < len(c) else min(w['end'] + 0.15, nxt_start)
        txt = ' '.join((r'{\c' + YEL + '}' + esc(x['text']) + r'{\c' + WHT + '}') if k == j else esc(x['text'])
                       for k, x in enumerate(c))
        lines.append(f'Dialogue: 0,{ts(start)},{ts(end)},Cap,,0,0,0,,{txt}')

ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,3,{max(2, size // 12)},0,2,{int(W*0.08)},{int(W*0.08)},{marginv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
""" + '\n'.join(lines) + '\n'

fd, assp = tempfile.mkstemp(suffix='.ass'); os.write(fd, ass.encode()); os.close(fd)
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-vf',
    f"ass={assp}:fontsdir=/usr/share/fonts/opentype/inter", '-c:v', 'libx264', '-crf', '20',
    '-preset', 'medium', '-c:a', 'copy', '-movflags', '+faststart', a.out])
os.unlink(assp)
print(f'captioned {len(words)} words in {len(chunks)} lines -> {a.out}')

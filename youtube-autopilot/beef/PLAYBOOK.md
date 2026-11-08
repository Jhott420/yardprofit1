# Beef Shorts playbook (vidIQ real-footage format)

Each Short is about 35–45 s, vertical, with real stock footage, one narrator, and big number overlays.

1. **Topic.** Take the next unposted line from `facts/beef.md` → Queue. When the queue is empty, pick a new cattle-economics question.
2. **Facts.** Use only numbers in `facts/beef.md`. If a topic needs a new number (carcass yield, feed cost, auction fees), find it on a primary source (USDA ERS/AMS, university extension), add it to the sheet with its link, then use it. Round honestly and say "about".
3. **Script.** About 600–650 characters. Open with the hook line word for word, then 3–4 number beats, and end with a question for the comments. Write numbers as spoken words where TTS could misread them.
4. **Voice.** `vidiq_voiceover_generate` with voice "Chris – Charming, Down-to-Earth" (`iP95p4xoKVk53GoZ742B`). Cost: 28 credits per 1,000 characters. Download the MP3 and transcribe it (`bin/transcribe.js`) to check every number is spoken correctly. Use `ffmpeg silencedetect` to get the beat timings.
5. **Footage.** `vidiq_generate_broll` (portrait, 1 credit per search). Only use clips whose MP4 link is `hd_720_*` or `hd_1080_*`; the `360_640` links look blurry. Pexels is blocked from the container, so pass the URLs straight to compose.
6. **Compose.** `vidiq_compose` (vertical). Cut scenes on the voice pauses. Put the big number at the top (y≈0.14, about 80–110 px, heavy weight, black stroke), and keep a source footer for the whole video. Cost: 1 credit per 4 s.
7. **Check.** Download the render, make a contact sheet of frames, and look at it.
8. **Upload.** `node beef/upload.js <agentDir> short.mp4 meta.json`. Title: "<Title> #shorts". In the description, give the source numbers and credit the Pexels photographers. Tags must stay under 500 characters. The script posts a pinned-style question comment.
9. **Record.** Strike the item in the queue, with its video id.

Each Short uses about 45–50 vidIQ credits.

# The Cattle Ledger — Shorts playbook (vidIQ real-footage format)

Each Short is about 35–45 s, vertical, with real stock footage, one narrator, and big number overlays.

1. **Topic.** Take the next unposted line from `facts/beef.md`: the NEXT UP list first, then the Queue. When the queue is empty, pick a new cattle-economics question.
2. **Facts.** Use only numbers in `facts/beef.md`. If a topic needs a new number (carcass yield, feed cost, auction fees), find it on a primary source (USDA ERS/AMS, university extension), add it to the sheet with its link, then use it. Round honestly and say "about".
3. **Script (SHORT FORMAT, from Nov 10).** The target is **20–30 seconds of audio, about 280–380 characters.**
   - **The first sentence is the single most surprising number, said plainly.** For example: "This 525-pound calf sold for two thousand dollars." No windup.
   - Then give 1–2 supporting beats.
   - Then one line of payoff or insight.
   - Then end with "Follow The Cattle Ledger." Use the short sign-off to save time.
   - Write numbers as spoken words where TTS could misread them.
   - The video's first frame must already show the big number on screen.
   - Cut every 1.5–3 s.
4. **Voice.** Use a professional documentary narrator: `vidiq_voiceover_generate` with voice "Brian – Deep, Resonant" (`nPczCjzI2devNBz1zQrb`). End every script with "Follow The Cattle Ledger for the truth behind the beef business." Cost: 28 credits per 1,000 characters. Download the MP3 and transcribe it (`bin/transcribe.js`) to check every number is spoken correctly. Avoid symbols such as ≠ in captions, because they render badly. Use `ffmpeg silencedetect` to get the beat timings.
5. **AI shot (optional).** For a strong opening, `vidiq_generate_video` (minimax-h3, 768p, 9:16, 6 s) costs **80 credits**. Use at most one per Short, and only when the credit balance is over 800. Otherwise use only stock footage. When an AI shot is used, set `"synthetic": true` in meta.json so YouTube shows its AI-content label.
6. **Footage.** `vidiq_generate_broll` (portrait, 1 credit per search). Only use clips whose MP4 link is `hd_720_*` or `hd_1080_*`; the `360_640` links look blurry. Pexels is blocked from the container, so pass the URLs straight to compose.
7. **Compose.** `vidiq_compose` (vertical). Cut scenes on the voice pauses. Put the big number at the top (y≈0.14, about 80–110 px, heavy weight, black stroke), and keep a source footer for the whole video. Cost: 1 credit per 4 s.
8. **Check.** Download the render, make a contact sheet of frames, and look at it.
9. **Upload.** `node beef/upload.js <agentDir> short.mp4 meta.json`. Title: "<Title> | The Cattle Ledger #shorts". In the description, give the source numbers and credit the Pexels photographers. Tags must stay under 500 characters. upload.js automatically puts `#shorts #fyp #cattle #beef #ranching #thecattleledger` first in the description hashtags, and caps them at 12. The script posts a pinned-style question comment.
10. **Record.** Strike the item in the queue, with its video id.

A 25 s Short uses about 25 vidIQ credits (≈11 voice + 7 compose + b-roll searches), plus 80 if it has an AI shot.

9b. Also write a production package (script, scene table, captions, CapCut iPhone steps, title, description, hashtags) to `beef/ledger/NN-slug.md`, like `01-one-cow-worth.md`.

## What works in this niche (vidIQ outliers, Nov 10 2026)
- **Consumer price shock with a $ in the title.** "$219 for a ribeye?" got 1.1M views; "Is Costco's $120 Steak Worth It?" 735K; "Would you still buy Walmart beef⁉️" 740K.
- **Ranch money, told as curiosity.** Pirtle Farms (13K subs): "How farmers make money raising calves‼️🤯" got 62K; "How one bull can make CRAZY money 💰😱" 26K (96× its channel average); "Why so many ranchers don't eat their own beef 😳" 52K.
- **Cattle-market news.** Beef import and cattle-price news Shorts from Aug–Sep 2026 got 355K–1.5M views. Only cover news when a reputable source is cited.
- **Real people and real footage beat stock.** Most top Shorts are first-person farm footage. Use the user's own clips whenever they send them.
- **Titles:** a dollar amount or curiosity gap + a question + 1–2 emojis. Keep the title under about 60 characters, and put " | The Cattle Ledger" only if it still fits.

# The Cattle Ledger — Shorts playbook (vidIQ real-footage format)

Each Short is about 35–45 s, vertical, with real stock footage, one narrator, and big number overlays.

1. **Topic.** Take the next unposted line from `facts/beef.md`: the NEXT UP list first, then the Queue. When the queue is empty, pick a new cattle-economics question.
2. **Facts.** Use only numbers in `facts/beef.md`. If a topic needs a new number (carcass yield, feed cost, auction fees), find it on a primary source (USDA ERS/AMS, university extension), add it to the sheet with its link, then use it. Round honestly and say "about".
3. **Script (FORMAT, from Nov 13, based on the views data).** The target is **35–45 seconds of audio, about 500–650 characters.** From Nov 10–12, the 20–30 s Shorts got 0–3 views each, while the 40–50 s ones got 7–17. Almost all views came from YouTube search (73) and related videos (22). Shorts-feed traffic was 0.
   - Open with the surprising number in the first sentence, and show it on the first frame.
   - Then 3–4 beats that fully answer the question a searcher typed.
   - Then one payoff line, then "Follow The Cattle Ledger."
   - Write numbers as spoken words where TTS could misread them.
   - Cut every 2–3 s.
   - **Title = a plain search question** people type ("How Much Does It Cost to Raise a Cow?"), under about 60 characters, 1 emoji at the end, then #shorts. No number-only headlines (e.g., "Hay Just Jumped 20%" got 0 views). Repeat the question as the first line of the description.
   - **Schedule (from Nov 15, user's request):** both daily Shorts are made earlier (1:56 PM and 3:56 PM Central) and go live together at **6:00 PM Central**. upload.js uploads them private with `publishAt` set to the next 6 PM Central, and queues the question comment until the video is public. Set `"publishNow": true` in meta.json only to post immediately.
4. **Voice.** Use a professional documentary narrator: `vidiq_voiceover_generate` with voice "Brian – Deep, Resonant" (`nPczCjzI2devNBz1zQrb`). End every script with the subscriber-plan line: "Subscribe. Next: <next topic>." (see Subscriber plan) Cost: 28 credits per 1,000 characters. Download the MP3 and transcribe it (`bin/transcribe.js`) to check every number is spoken correctly. If bin/transcribe.js or its Gemini key is missing (after a container reset), use ElevenLabs `creative_transcribe_audio` instead (attach the MP3 URL to a flow with `creative_attach_reference_file`, then transcribe). Avoid symbols such as ≠ and most emoji (📉 renders as a box; 😳 renders fine) in captions. Use `ffmpeg silencedetect` to get the beat timings.
5. **Stock footage note (Nov 11):** vidIQ renamed `vidiq_generate_broll` to `vidiq_find_broll`. Use whichever exists. If neither does, reuse the HD clip URLs from earlier packages in beef/ledger/.
5b. **AI shot (optional).** For a strong opening, `vidiq_generate_video` (minimax-h3, 768p, 9:16, 6 s) costs **80 credits**. Use at most one per Short, and only when the credit balance is over 800. Otherwise use only stock footage. When an AI shot is used, set `"synthetic": true` in meta.json so YouTube shows its AI-content label.
6. **Footage.** `vidiq_generate_broll` (portrait, 1 credit per search). Only use clips whose MP4 link is `hd_720_*` or `hd_1080_*`; the `360_640` links look blurry. Pexels is blocked from the container, so pass the URLs straight to compose.
7. **Compose.** `vidiq_compose` (vertical). Cut scenes on the voice pauses. Put the big number at the top (y≈0.14, about 80–110 px, heavy weight, black stroke), and keep a source footer for the whole video. Cost: 1 credit per 4 s.
8. **Check.** Download the render, make a contact sheet of frames, and look at it.
9. **Upload.** `node beef/upload.js <agentDir> short.mp4 meta.json`. Title: "<Search question> <emoji> #shorts" (see step 3). In the description, give the source numbers and credit the Pexels photographers. Tags must stay under 500 characters. upload.js automatically puts `#shorts #fyp #cattle #beef #ranching #thecattleledger` first in the description hashtags, and caps them at 12. The script posts a pinned-style question comment.
10. **Record.** Strike the item in the queue, with its video id.

A 25 s Short uses about 35 vidIQ credits (voice has a 28-credit minimum, plus ~6 compose and any b-roll searches), plus 80 if it has an AI shot.

9b. Also write a production package (script, scene table, captions, CapCut iPhone steps, title, description, hashtags) to `beef/ledger/NN-slug.md`, like `01-one-cow-worth.md`.

## What works in this niche (vidIQ outliers, Nov 10 2026)
- **Consumer price shock with a $ in the title.** "$219 for a ribeye?" got 1.1M views; "Is Costco's $120 Steak Worth It?" 735K; "Would you still buy Walmart beef⁉️" 740K.
- **Ranch money, told as curiosity.** Pirtle Farms (13K subs): "How farmers make money raising calves‼️🤯" got 62K; "How one bull can make CRAZY money 💰😱" 26K (96× its channel average); "Why so many ranchers don't eat their own beef 😳" 52K.
- **Cattle-market news.** Beef import and cattle-price news Shorts from Aug–Sep 2026 got 355K–1.5M views. Only cover news when a reputable source is cited.
- **Real people and real footage beat stock.** Most top Shorts are first-person farm footage. Use the user's own clips whenever they send them.
- **Titles:** a dollar amount or curiosity gap + a question + 1–2 emojis. Keep the title under about 60 characters, and put " | The Cattle Ledger" only if it still fits.

## Topic rule (Nov 21 views check)
"How much is/does <a specific thing> cost/weigh/sell for" Shorts got 1,270–1,500 views each: cow cost, raise a cow, heifer, beef from a cow, steak per lb. Trend questions got 63–227: "Are cattle prices going up or down?", "Are beef prices going up?", "How much do ranchers make?". Pick price-of-a-thing topics first, and use trend topics only once nothing else is queued.

## Weekly long video (from Nov 15, user's request)
Every Sunday at 4:26 PM Central, a scheduled task runs beef/weekly.js. It stitches that week's Shorts into one 16:9 "Cattle Ledger Weekly" video and uploads it scheduled for 6:00 PM Central. Each Short is centered on a blurred background with its chapter number and title beside it, and the video gets a 4 s intro card, YouTube chapters, a thumbnail and a sources list. It costs **0 vidIQ credits**. The user asked for a daily long video, but a 6–8 min original costs about 250–300 credits, far more than the plan allows, so they chose the free weekly compilation. Used Shorts are tracked in <agentDir>/state/weekly-used.json.

## SEO pass (every 2 days, from Nov 15, user's request)
A scheduled task at 7:41 PM Central (odd-numbered days) runs `beef/seo.js report`, writes a small plan and runs `beef/seo.js apply`. It uses only the free YouTube APIs. Built-in limits:
- at most 3 title changes per run, and never on a video with ≥300 views in 48 h
- question first lines are added above the description, never replacing the sourced facts
- personal and unlisted videos are never touched
Every change is logged to <agentDir>/state/seo-log.json, and plans are saved in beef/seo/.

## Subscriber plan (from Nov 19, user's request: "do all the above")
About 10,000 views brought about 10 subscribers (about 1 per 1,000). Viewers get their answer and leave, so every Short now gives them a reason to come back:
1. **Ending = a promise.** Replace "Follow The Cattle Ledger for the truth behind the beef business." with "Subscribe. Next: <next topic as a question>." The next topic is the next "(next)" item in facts/beef.md NEXT UP, so the promise is kept by the next run. Show the same line as the last caption ("SUBSCRIBE / NEXT: ..."). If the next topic is blocked (no source yet), name the first item after it that isn't blocked.
2. **Series.** Each new Short continues a top performer. Put "Part N" in the first caption and the description (e.g. "Part 2 of How Much Does It Cost to Raise a Cow?"), and link the earlier part in the description as https://youtube.com/shorts/<id>. **The title stays a plain search question**, because search is where our views come from.
3. **Pinned question comment** on every Short (upload.js already does this).
4. **Comment replies** (vidIQ vidiq_reply_to_comment, 1 credit each): on each production run, check new viewer comments (vidiq_video_comments, channel, order=time, 5 credits, only if the balance is over 60). Reply to real questions or corrections in 1–2 friendly sentences that cite only facts/beef.md numbers. Never argue, and skip spam or insults. Log each reply in beef/comments.md. Needs vidIQ's comment permission; if canReply is false, skip and tell the user.
5. **Related video** (user does this in YouTube Studio): set each popular Short's "Related video" to the latest Sunday weekly video.
6. **Real footage:** if the user sends their own cattle or sale-barn clips, use them as the first shot.

## Change log
- **Nov 21:** Views check. 12,075 views and 21 subscribers. Daily views went 5,121 (Nov 13) → 2,415 → 2,126 → 521 → 241 → 69 (Nov 18), mostly from the Shorts feed (9,283 views Nov 13–15, 639 Nov 16–21) plus the 4-day upload gap. Retention is fine (66–121%). Added the topic rule above.
- **Nov 21:** YouTube login restored with a fresh sign-in (`node beef/signin.js <agentDir> url`, then `code <localhost URL>`). Shorts and SEO tasks turned back on. Posted the missed question comments on #21 and #22.
- **Nov 19:** Added the subscriber plan (promise endings, series parts, comment replies). Queue reordered as series follow-ups (Q → S → T).
- **Nov 17:** Views check. The 6 new-format Shorts from Nov 13–15 average about 1,200 views each (1,271–1,497, except "Are Cattle Prices Going Up or Down?" at 194). The Nov 10–12 short-format ones average about 350, and most are under 20. The channel is at 11.4K total views and 21 subscribers. No format change. Next check is Nov 21.
- **Nov 15:** First SEO pass. Channel keywords now use the questions people search; the description mentions 6 PM daily Shorts and the Sunday weekly video. Retitled #3 ("What Does It Really Cost to Raise Cattle?"), the old "Farmers Don't Keep All That Beef Money" ("How Much Do Ranchers Make From Beef?") and #4 ("Why Is Steak So Expensive? 🥩"). Added question first lines to 8 older Shorts.
- **Nov 15:** Added the weekly long video (beef/weekly.js). Weekly #1 compiles Shorts #4–#18 (#1, #2, #3 and #7 skipped as duplicate topics).
- **Nov 15:** All Shorts are scheduled to publish at 6:00 PM Central (upload.js publishAt). Production runs moved to 1:56 PM and 3:56 PM Central.
- **Nov 13:** Moved to 35–45 s, search-question titles and 2 Shorts a day. Retitled Shorts #7–#14 as search questions (beef/retitle.js). Views check moved to Nov 17.

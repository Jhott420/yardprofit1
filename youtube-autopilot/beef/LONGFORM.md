# The Farm Ledger: weekly long video (from Nov 23, user's request)

This replaces the free Sunday compilation of Shorts. Each week we make one original 6–8 minute 16:9 explainer, which costs about 300 vidIQ credits.

## Topic
Pick a search question with a long-form angle that our sourced numbers can fully answer:
1. What It Really Costs to Raise Beef Cattle (2026): everything is already in facts/beef.md
2. How Much Does a Cow Cost? Calf, Heifer, Feeder and Finished Steer Prices Explained
3. Where Your Beef Dollar Goes: From Ranch to Grocery Store
4. How Much Does It Cost to Start a Small Farm? (needs extension sources first)
5. Goats vs Cattle: Which Makes More Money? (needs sources first)

Never use a number that isn't in facts/beef.md or facts/farm.md with its source link. If a topic needs new numbers, source them first (USDA ERS/NASS/AMS or university extension).

## Script (about 6,000–7,500 characters, 6–8 minutes)
- **0:00 Hook (about 15 s):** the most surprising number, plus what the viewer will learn.
- **4–6 chapters,** each answering one sub-question with 2–4 sourced numbers and a plain example (e.g. "for a 98-cow ranch…").
- **Wrap-up:** the one big takeaway, then "If this helped, subscribe to The Farm Ledger, and check out the Shorts for quick answers."
- Write numbers as spoken words where TTS could misread them. Brian voice (nPczCjzI2devNBz1zQrb).

## Production (vidiq_compose renders at most 240 s per call)
1. **Voice:** split the script into 2–3 parts of at most about 230 s each, at sentence or chapter boundaries. Generate one voiceover per part (28 credits per 1,000 characters) and transcribe each with ElevenLabs creative_transcribe_audio (flow BYI7TpRgG3nQeE0a4kGI). Every number must be spoken correctly.
2. **Footage:** vidiq_find_broll, landscape, 8–12 searches (1 credit each). Reuse the landscape clips in beef/ledger/clips-landscape.md, and add new ones there. Change shots every 4–5 s (at most 50 scenes per part).
3. **Compose** each part with vidiq_compose, format "landscape", using that part's voiceover (1 credit per 4 s). vidIQ adds its own captions, so overlays are only numbers and labels, plus a chapter title card at each chapter start (e.g. "CHAPTER 2 · FEED COSTS") and a small source footer. Check each part's contact sheet for dark frames and dropped overlays.
4. **Join** the parts locally: download them, then `ffmpeg -f concat -safe 0 -i list.txt -c copy long.mp4`. If the parts don't match, re-encode: `-c:v libx264 -crf 20 -c:a aac`. Check the total length and look at a contact sheet of about 12 frames.
5. **Thumbnail:** `node farm/thumbs.js` with `"wide": true` (1280×720), a big number plus the question. Look at it before using it.
6. **Upload:** `node beef/upload.js <agentDir> long.mp4 meta.json`. In meta.json:
   - title: the search question, under 70 characters, plus the year (upload.js appends #fyp)
   - `"coreTags": ["#farming","#homestead","#thefarmledger"]`, `"extraTags": ["#ranching","#agriculture"]` (no #shorts)
   - `"thumbnail"`, and a question `comment`
   - description: a 2-line summary, then chapters (the first at 0:00, at least 3, each ≥ 10 s), then every number with its source link, then the Pexels credits

   It is scheduled for the next 6 PM Central.
7. **Record:** write beef/ledger/long-NN-slug.md (script, chapters, sources, credits used, link), then commit and push.

Budget: voice about 200 + compose about 110 + b-roll about 10 ≈ 320 credits. Skip and tell the user if the balance is under 400 (to keep the daily Shorts going).

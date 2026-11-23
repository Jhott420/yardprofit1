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

## Skills to use (from Nov 23)
- **Packaging first:** run the `yt-video-packager` skill on the topic (vidIQ keyword research + 10 titles, score the top 3, 3 thumbnail ideas, the hook).
- **Script:** run the `yt-retention-script` skill with the winning title and hook and ONLY the sourced numbers. Keep a re-hook (a number, a twist or a question) every 45–60 s.
- **Metadata:** run the `yt-upload-optimizer` skill on the final title and description (chapters, tags, first 2 lines) before upload.

## Script (about 6,000–7,500 characters, 6–8 minutes)
- **0:00 Hook (about 15 s):** the most surprising number, plus what the viewer will learn.
- **4–6 chapters,** each answering one sub-question with 2–4 sourced numbers and a plain example (e.g. "for a 98-cow ranch…").
- **Wrap-up:** the one big takeaway, then "If this helped, subscribe to The Farm Ledger, and check out the Shorts for quick answers."
- Write numbers as spoken words where TTS could misread them. Brian voice (nPczCjzI2devNBz1zQrb).

## Production (vidiq_compose renders at most 240 s per call)
1. **Voice:** split the script into 2–3 parts of at most about 230 s each, at sentence or chapter boundaries. Generate one voiceover per part **with ElevenLabs** (`creative_generate_speech`, Brian `nPczCjzI2devNBz1zQrb`, eleven_v4, generations_count 1; see PLAYBOOK step 4: download the MP3 right away, because the link expires in about 2–3 h), and transcribe each on the same flow with `creative_transcribe_audio`. About 1¢ per 100 characters, so ≈50¢ a video, and 0 vidIQ credits. Every number must be spoken correctly.
2. **Footage:** vidiq_find_broll, landscape, 8–12 searches (1 credit each). Reuse the landscape clips in beef/ledger/clips-landscape.md, and add new ones there. Change shots every 4–5 s (at most 50 scenes per part).
3. **Compose** each part with vidiq_compose, format "landscape", using that part's voiceover (1 credit per 4 s). vidIQ adds its own captions, so overlays are only numbers and labels, plus a chapter title card at each chapter start (e.g. "CHAPTER 2 · FEED COSTS") and a small source footer. Check each part's contact sheet for dark frames and dropped overlays. **Don't add a source footer overlay**: vidIQ enlarges small text and it gets clipped at the top edge (long #1). Put the source line in the join step instead (below). Before trimming into a clip, check its length: vidIQ refuses a scene that runs past the end of its clip.
4. **Join** the parts locally with one re-encode that also adds the brand band (see beef/ledger/long-01-cost-to-raise-a-cow.md):
   `ffmpeg -i part1.mp4 -i part2.mp4 -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a];[v]drawbox=x=0:y=0:w=iw:h=100:color=0x0e1d0b@1:t=fill,drawtext=fontfile=/usr/share/fonts/opentype/inter/Inter-Bold.otf:text='THE FARM LEDGER':fontcolor=0xFFD23F:fontsize=40:x=36:y=30,drawtext=...sources...:fontsize=28:x=w-tw-36:y=37[vo]" -map "[vo]" -map "[a]" -c:v libx264 -crf 20 -c:a aac -b:a 192k -movflags +faststart long.mp4`
   Chapter times for part N = the summed durations of the earlier parts + the card time. Check the total length and look at a contact sheet of about 12 frames.
5. **Thumbnail:** `node farm/thumbs.js` with `"wide": true` (1280×720), a big number plus the question. Look at it before using it.
6. **Upload:** `node beef/upload.js <agentDir> long.mp4 meta.json`. In meta.json:
   - title: the search question, under 70 characters, plus the year (upload.js appends #fyp)
   - `"coreTags": ["#farming","#homestead","#thefarmledger"]`, `"extraTags": ["#ranching","#agriculture"]` (no #shorts)
   - `"thumbnail"`, and a question `comment`
   - description: a 2-line summary, then chapters (the first at 0:00, at least 3, each ≥ 10 s), then every number with its source link, then the Pexels credits

   It is scheduled for the next 6 PM Central.
6b. **Money links (from Nov 23):** right after the 2-line summary in the description, add:
   - a "🛒 GEAR FOR …" list of 3–6 Amazon search links that fit the topic, in the form `https://www.amazon.com/s?k=<words+with+plus>&tag=thecattleledger-20`. Only list items that really fit the video; never claim we use or tested a product.
   - the disclosure line "As an Amazon Associate I earn from qualifying purchases."
   - when the user sends the Gumroad link, also "🐄 Run your own numbers: Cattle Cost Calculator → <link>". It's not set up yet.

   Also post a comment pointing to the gear links, with the disclosure. The user pins it in Studio, because the API can't pin.
7. **Record:** write beef/ledger/long-NN-slug.md (script, chapters, sources, credits used, link), then commit and push.

Budget (from Nov 23, with ElevenLabs voice): compose about 80 + b-roll about 10 + title scores about 15 ≈ 105 vidIQ credits. Skip and tell the user if the balance is under 150 (to keep the daily Shorts going).

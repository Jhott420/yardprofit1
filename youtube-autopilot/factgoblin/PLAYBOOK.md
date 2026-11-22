# Fact Goblin: brain rot Shorts playbook (from Nov 22, user's request)

On Nov 22 the user switched the channel (formerly The Cattle Ledger, channel UC6ojBCuR8pYyC7PcmvPLIvQ) to brain rot. They chose the "unhinged facts" style and the name **Fact Goblin** (handle @factgoblin, which the user changes in YouTube Studio). The 24 cattle Shorts stay public.

**Format:** weird but TRUE facts read fast over satisfying stock footage, with chaotic captions. Each Short is 25–35 s and costs about 40 vidIQ credits.

1. **Facts.** Pick 1 topic with 4–5 connected facts, e.g. "5 facts about octopuses that sound fake". Each fact needs a reputable source checked this run with WebSearch or the web-fetch agent: NASA, NOAA, the Smithsonian, National Geographic, a university, a museum, Britannica or a peer-reviewed paper. Record each fact and its link in `facts/goblin.md` before using it. No source means the fact isn't used. Never use a "fact" that is really a myth (e.g. goldfish 3-second memory, or humans using 10% of their brain). Debunking one is fine if a source backs it up. Keep it family-friendly: no gore, nothing sexual, no real people.
2. **Script.** About 380–480 characters at a fast pace.
   - Open with the wildest fact in the first 2 seconds, e.g. "An octopus has THREE hearts. And it gets weirder."
   - Then the rest of the facts, one line each, punchy.
   - Close with "Subscribe and feed the goblin. Next: <next topic>." The next topic is the next unposted line in `facts/goblin.md` NEXT UP.
   - Use the Brian voice (`nPczCjzI2devNBz1zQrb`) unless the user picks another.
3. **Check** the voiceover with ElevenLabs `creative_transcribe_audio` (flow BYI7TpRgG3nQeE0a4kGI). Every number must be spoken correctly.
4. **Footage:** `vidiq_find_broll`, portrait, 1 credit per search, 2–3 searches. Mix "oddly satisfying" clips (kinetic sand, slime, hydraulic press, soap cutting, marble run) with clips of the topic itself. Cut every 1.5–2.5 s (faster than the cattle channel). Reuse the clips in `factgoblin/clips.md` when they fit, and add new ones to that file.
5. **Compose** with `vidiq_compose`, vertical. vidIQ adds its own word-by-word captions from the voiceover, so don't pass `captions`, and add only:
   - one big hook label at the top for the first 2 s (e.g. "3 HEARTS?!"), as a label rather than the spoken words, or vidIQ drops it
   - an emoji or number label per fact
   - a footer "Sources in description" for the whole video

   Check the contact sheet for overlays vidIQ dropped and for dark frames.
6. **Upload** with `node beef/upload.js <agentDir> short.mp4 meta.json`. meta.json includes:
   - `"playlist": "PLOKrlzQ5HCGo"`
   - `"coreTags": ["#shorts","#fyp","#brainrot","#facts","#factgoblin"]`
   - `"extraTags": ["#funfacts","#didyouknow"]`
   - `"categoryId": "24"` (Entertainment)
   - a question `comment`, e.g. "Which fact broke your brain? 👇"

   Title: the hook as a curiosity line + 1–2 emoji + #shorts, under 60 characters, e.g. "An Octopus Has 3 Hearts?! 🐙🤯 #shorts". The description gives each fact with its source link, then the Pexels credits. It is scheduled for 6 PM Central like before.
7. **Record:** write `factgoblin/ledger/NN-slug.md` (script, facts and sources, captions, credits used), strike the topic in `facts/goblin.md`, then commit and push.

Credits: skip the run and tell the user if the vidIQ balance is under 40. With no AI video unless the balance is over 800, a Short is about 28 (voice) + 3 (b-roll) + 8 (compose) ≈ 40.

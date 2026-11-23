# The Farm Ledger: Long video #1, "How Much Does It Cost to Raise a Cow? (Real USDA Numbers)"

**Video:** https://youtu.be/fxmGtMxnmbc (5:11, 16:9; scheduled 6:00 PM CT Mon Nov 23, 2026)
**Thumbnail:** farm/thumbs/long01.jpg ("$1,752 / TO KEEP 1 COW A YEAR / DO RANCHERS LOSE MONEY?")
**Title scores (vidIQ):** this title 95; backups "Can You Make Money Raising Cattle in 2026?" 91, "Do Ranchers Actually Make Money? $1,752 Per Cow" 84

## Chapters
0:00 Hook · 0:27 The bill · 1:34 The hidden costs · 2:27 What comes back · 3:24 Profit or loss? · 4:17 What to watch

## Script
Part 1 and Part 2 are in the session scratchpad (p1.txt, p2.txt). Both were transcribed with ElevenLabs Scribe (sessions NTf92UFM4A42QGArb2cD and 2mMNu4TEDChGDe5a2NSl) and every number was spoken correctly. All numbers are from facts/beef.md: the ERS cow-calf 2025 table, OKC and Nebraska prices for Sept 2026, and ERS hay prices.

## Production
- Voice: Brian, 2 parts (146.9 s + 163.3 s)
- Compose: landscape, 37 + 36 scenes (scene plans: long-01-p1spec.json and long-01-p2spec.json, built by a small script that turns [time, clip, trimIn, label] rows into compose JSON)
- vidIQ dropped 1 overlay ("🚜 EQUIPMENT", which repeated the narration)
- **The footer overlay rendered too big and clipped at the top edge** (the legibility floor enlarges small text). Fixed for free during the join: ffmpeg concat + `drawbox` (a dark green 100 px band) + `drawtext` ("THE FARM LEDGER" and a one-line source note). For future long videos, drop the footer overlay and add the band at join time.
- A Martina Tomšič calf clip (4058635) is only 7.5 s long, so don't trim into it past about 2 s
- No silences of 1.5 s or longer; contact sheet checked

Credits: voice ≈168 + b-roll 8 + title scores 15 + keywords 5 + compose 37 + 41 = ≈274 (balance after: 2,703)

## Money links
The description has 5 Amazon search links (tag thecattleledger-20) plus the disclosure. A comment with the disclosure is queued and posts when the video goes public; the user pins it in Studio. Add the calculator link once Gumroad has a payout method.

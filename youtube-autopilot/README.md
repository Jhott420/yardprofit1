# YouTube Autopilot

Hands-off daily pipeline for [youtube-automation-agent](https://github.com/darkzOGx/youtube-automation-agent) that **makes an animated explainer video and publishes it to YouTube immediately**, without review.

## What one run does

1. **Picks a topic** with Gemini, following the channel's content pillars and copyright rules, and skipping topics it has already covered (`state/history.json`).
2. **Generates** the script, title, description, tags and narration through the agent.
3. **Fixes narration**: re-voices any scene the free tier dropped, or whose audio came back cut short. Gemini sometimes truncates the voiceover for long scripts. When a voice model runs out of its daily quota, it switches to the next model in `TTS_MODELS`.
4. **Animates every scene**: original motion graphics (word-by-word headlines, checklist reveals, drifting backgrounds, progress bar), rendered frame by frame with Playwright and FFmpeg. There's no stock footage and no third-party media.
5. **Makes a thumbnail** in the same style.
6. **Rebuilds** the final 1080p MP4, then **auto-approves** it. Factual claims are recorded as "waived — owner's hands-off policy".
7. **Publishes now** and sets the custom thumbnail directly, which works around the agent's thumbnail upload bug.

If any step fails, the run stops and **nothing is published**. The reason is written to `state/last-run.json`.

The autopilot pauses the agent's own built-in daily generator, so the two don't both spend the free Gemini quota.

## Run it

```bash
AGENT_DIR=/path/to/youtube-automation-agent node autopilot.js                 # pick a topic, publish
AGENT_DIR=/path/to/youtube-automation-agent node autopilot.js --topic "How do magnets work?"
AGENT_DIR=/path/to/youtube-automation-agent node autopilot.js --no-publish    # build + approve only
AGENT_DIR=/path/to/youtube-automation-agent node autopilot.js --production prod_123   # resume a failed video
```

The agent must already be set up, with `config/credentials.json`, `config/tokens.json` and `.env` in place. If the agent isn't running, the autopilot starts it.

| Variable | Default | Purpose |
|---|---|---|
| `AGENT_DIR` | `../youtube-automation-agent` | Agent install folder |
| `STATE_DIR` | `./state` | History, logs, renders |
| `TTS_MODELS` | `gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-3.8-flash-lite-tts` | Voice models to fall back through |
| `HELPER_MODEL` | `gemini-3.5-flash-lite` | Model for topic picking and on-screen text |
| `AGENT_RESTART_CMD` | *(built in)* | How to restart the agent after a voice-model switch, e.g. `systemctl restart youtube-agent` |
| `CHANNEL_LABEL` | `Explained Simply` | Watermark text on every scene |

## Run it every day on a server

The agent needs a computer that stays on; a phone can't do it. On a $6/month Ubuntu server (DigitalOcean, Hetzner and similar), you can do all of this from the provider's web console on your phone:

1. Copy this folder to the server at `/opt/youtube/youtube-autopilot`.
2. Run `bash /opt/youtube/youtube-autopilot/setup-vps.sh`. It installs Node, the agent and Chromium, and creates a daily timer (15:00 server time; change it with `RUN_AT=09:30 bash setup-vps.sh`).
3. Copy your working `.env`, `config/credentials.json` and `config/tokens.json` into `/opt/youtube/youtube-automation-agent/`.
4. Test with `systemctl start youtube-autopilot && journalctl -u youtube-autopilot -f`.

## Limits on the free Gemini tier

- **Voice:** about 10 requests per day per voice model, and 3 per minute. A 3-minute video needs 1 request when everything works, or about 8 when it has to re-voice every scene. The fallback list covers roughly 4 such videos a day.
- **Images:** not available on the free tier, which is why scenes are animated graphics instead of AI pictures.
- **Script model** (`gemini-3.7-flash`) can take about 2 minutes per call when busy.

Turning on billing for the API key's project in Google AI Studio removes these limits.

## Things to keep in mind

- Videos go **public with no human review**. The topic rules keep content evergreen and copyright-safe, but the AI can still get a fact wrong. Check the channel now and then.
- Uploading via the API is limited by YouTube's daily quota for your Google Cloud project; one upload a day is well within it.
- Since your client secret and Gemini key were pasted into a chat, rotate them, then update `credentials.json`.

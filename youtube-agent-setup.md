# YouTube Automation Agent – Setup Guide

Repo: https://github.com/darkzOGx/youtube-automation-agent (v2.11.0, "Lumen")

Run this on **your own computer**, not a temporary cloud container. Your keys, database and schedules are stored locally, and the Google sign-in opens a browser.

---

## 1. Install

Requires Node.js 18 or newer (tested here on Node 22).

```bash
git clone https://github.com/darkzOGx/youtube-automation-agent.git
cd youtube-automation-agent
npm install
```

`npm install` reports about 35 known vulnerabilities in the packages it depends on. Run `npm audit` if you want the details.

---

## 2. Get your keys

| What | Where | Required? |
|---|---|---|
| **One AI provider key.** Gemini is the easiest; its key starts with `AIza` | https://aistudio.google.com/apikey | Yes |
| **YouTube OAuth credentials.** Create a Google Cloud project, enable the *YouTube Data API v3*, then create an OAuth client of type **Desktop app** | https://console.cloud.google.com/ | Yes, to publish |
| Other AI providers: OpenAI (`sk-`), OpenRouter (`sk-or-`), Kimi, MiMo, GLM | See `.env.example` | Optional |
| AI video: Replicate/Seedance, MiniMax, Kling, Wan | See `.env.example` | Optional. Without one, it makes a free local slideshow video |

Gemini on a free tier covers scripts and voiceover. AI-generated images need paid access.

---

## 3. Choose a setup method

### Option A: the interactive wizard (easiest)

```bash
npm run walkthrough
```

It asks for your keys, checks them and saves them for you. Skip to step 4 afterwards.

### Option B: fill in the templates by hand

```bash
cp .env.example .env
cp config/credentials.example.json config/credentials.json
```

Then edit both files using the templates below.

#### `.env` (only the lines that matter)

Uncomment **one** AI provider line by removing its leading `# `. Leave everything else in the file as it is.

```env
# AI provider – pick ONE
GEMINI_API_KEY=AIza-your-key-here

# Application
NODE_ENV=production
PORT=3456
LOG_LEVEL=info

# Channel
CHANNEL_NAME=Your Channel Name
DEFAULT_AUTHOR=Your Name
TARGET_AUDIENCE=Your target audience description

# YouTube
YOUTUBE_REGION=US
DEFAULT_PRIVACY_STATUS=private

# Security: protects the dashboard's API. Use a long random string.
API_KEY=change-me-to-a-long-random-string

# Keeps API spending under control
MAX_CONCURRENT_JOBS=1
```

#### `config/credentials.json` (cleaned-up version)

The provider blocks you don't use have been removed, so placeholder keys can't be mistaken for real ones. `defaultPrivacy` is set to `"private"` because the original template says `"public"`, which disagrees with `.env`.

```json
{
  "youtube": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "YOUR_CLIENT_SECRET",
    "redirect_uris": ["http://127.0.0.1"]
  },
  "gemini": {
    "apiKey": "YOUR_GEMINI_API_KEY"
  },
  "channel": {
    "channelName": "Your Channel Name",
    "channelDescription": "Your channel description.",
    "defaultCategory": "24",
    "defaultPrivacy": "private",
    "websiteUrl": "",
    "businessEmail": ""
  },
  "content": {
    "contentTypes": ["story", "explainer", "tutorial"],
    "competitorChannels": [],
    "targetAudience": "Your target audience description",
    "postingFrequency": "daily",
    "preferredPostTime": "14:00"
  }
}
```

Notes:
- `defaultCategory` is a YouTube category ID: `24` is Entertainment, `26` Howto & Style, `27` Education, `22` People & Blogs.
- `postingFrequency` and `preferredPostTime` control the automatic schedule.
- Keep `.env` and `config/credentials.json` **out of git**; the repo's `.gitignore` already covers them.

---

## 4. Run it

```bash
npm start
```

- Dashboard: http://localhost:3456. Press **"Generate Content"**.
- Health check: http://localhost:3456/health. It should **not** say `"setupRequired": true`.
- Schedule: http://localhost:3456/schedule
- Analytics: http://localhost:3456/analytics

If the startup log says **"Dashboard started in setup mode"**, a key is missing or invalid. Run `npm run credentials:setup` or check the two files again.

---

## 5. Other useful commands

| Command | What it does |
|---|---|
| `npm run credentials:setup` | Re-enter or fix your keys |
| `npm run scheduler` | Run the daily automation schedule |
| `npm test` | Run the project's tests |
| `npm run agent:strategy`, `agent:script`, `agent:thumbnail`, `agent:seo`, `agent:production`, `agent:publishing`, `agent:analytics` | Run a single agent on its own |

---

## Safety checklist

- [ ] Keep privacy set to **private** until you've reviewed a few videos.
- [ ] Set `API_KEY`, especially if you ever use `HOST=0.0.0.0` (that setting exposes the dashboard to other devices).
- [ ] Set spending limits in your AI provider's billing dashboard.
- [ ] Never commit `.env` or `credentials.json`.

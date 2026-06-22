# World Cup 2026 · Office Sweepstakes

A static scoreboard for our 24-player office sweepstakes (48 teams, two each),
hosted free on **GitHub Pages**. Group results auto-update from two football
APIs via a scheduled **GitHub Action**; the organiser enters knockout scores and
publishes by committing one file.

**Live site:** https://dominikcichon-gd.github.io/sweepnostakes/

---

## How it works

There is **no server** in production — it's a static site plus a scheduled job.

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  GitHub Action (every 15m)  │         │  GitHub Pages (static site)  │
│                             │         │                              │
│  scripts/update-data.js     │  writes │  client/ built with Vite     │
│   1. worldcup26.ir (primary)│ ──────▶ │  reads data.json on load     │
│   2. football-data.org (bkp)│ data.   │  computes standings & bracket│
│   merges → client/public/   │  json   │  in the browser              │
│   data.json (respects locks)│         │                              │
└─────────────────────────────┘         └──────────────────────────────┘
```

- **`shared/logic.js`** — the verbatim roster, official 2026 group draw, flags,
  scoring, fixtures, name-matcher and `computeAll`. Shared by the site and the poller.
- **`shared/sources.js`** — the deterministic mapping from an upstream game to
  our internal fixture key (same orientation everywhere).
- **`scripts/update-data.js`** — the poller the Action runs.
- **`client/`** — the React/Vite app (read-only for everyone; local edit + publish for the organiser).
- **`client/public/data.json`** — the single source of truth (state + last-fetch meta).
- **`.github/workflows/deploy.yml`** — poll → commit → build → deploy.
- **`server/`, `start.sh`, `bin/`** — *optional* legacy local server + Cloudflare
  tunnel. Not used by Pages; kept for local experimentation.

### Result sources

1. **worldcup26.ir** — primary, no key needed.
2. **football-data.org** — backup; free tier covers the World Cup. Fills any
   group fixtures the primary missed, so if worldcup26.ir is down the board still
   updates. Needs a free API token in the `FOOTBALL_DATA_TOKEN` repo secret
   (the site works without it — the backup just stays off).

Manually entered / pasted results are **locked** and never overwritten by either
source. Knockout scores are always manual (our bracket is a fair 1-v-32 seeding,
not FIFA's official template, so it can't be auto-mapped).

---

## One-time setup

1. **Push this repo** to `dominikcichon-gd/sweepnostakes` (`main` branch).
2. **Enable Pages:** repo **Settings → Pages → Build and deployment → Source:
   GitHub Actions**.
3. **Add the backup API key (optional but recommended):**
   - Get a free token at https://www.football-data.org/client/register
   - Repo **Settings → Secrets and variables → Actions → New repository secret**
   - Name `FOOTBALL_DATA_TOKEN`, value = your token.
4. The Action runs on push and every 15 minutes. First run publishes the site at
   the URL above (give it a couple of minutes).

To trigger a refresh by hand: **Actions → "Update results & deploy to Pages" →
Run workflow**.

---

## Entering scores (organiser)

1. Open the site, click **Edit scores** (top-right).
2. Enter group/knockout scores, or paste lines like `Brazil 2-1 Scotland`
   (penalties: `1-1 (4-3 pens)`) on the Groups tab and review.
3. Edits are saved **on your device** until you publish. Click **Publish…**.
4. In the modal, **Copy** (or download) the JSON, open
   [`client/public/data.json`](client/public/data.json) on GitHub, paste over the
   whole file, and **Commit changes**.
5. The Action rebuilds and the site updates in ~1–2 minutes. The dirty banner
   clears automatically once the published data matches your edits.

---

## Local development (optional)

Requires Node 18+.

```bash
npm install
npm run poll        # fetch results into client/public/data.json
BASE_PATH=/ npm run dev:client   # dev server at http://localhost:5173/
npm run build       # production build → server/public/
```

# Market Update

Publishes a stock market summary (via the OpenAI API) 3x per trading day, and displays it
on a Squarespace/Wix site via a small embedded script.

## How it works

1. `scripts/generate-summary.js` fetches real S&P 500 / Dow / Nasdaq quotes (no API key needed)
   and asks OpenAI to write a short summary grounded in that data.
2. `.github/workflows/update-summary.yml` runs the script on a schedule. It checks the real
   America/New_York time and only generates a new summary at ~9:45am, ~12:30pm, and ~4:15pm ET
   on weekdays — other scheduled runs are no-ops, so DST is handled automatically.
3. The result is written to `data/summary.json` and committed back to the repo.
4. With GitHub Pages enabled, that file is served at a public URL your website can fetch.
5. `embed-snippet.html` is the code you paste into a Squarespace Code Block / Wix Embed to
   display it, auto-refreshing whenever visitors load the page.

## One-time setup

1. **Create a GitHub repo** and push this folder to it.
2. **Add your OpenAI API key** as a repository secret:
   Settings → Secrets and variables → Actions → New repository secret → name `OPENAI_API_KEY`.
3. **Enable GitHub Pages**: Settings → Pages → Source: "Deploy from a branch" → `main` / `/ (root)`.
4. Your data will be available at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO/data/summary.json`
5. Edit `embed-snippet.html`, set `DATA_URL` to that address, then paste its contents into a
   Code Block on your Squarespace/Wix page.
6. Test the automation immediately without waiting for the schedule: Actions tab → "Update
   market summary" → "Run workflow".

## Customizing the writing style

Edit the `systemPrompt` in `scripts/generate-summary.js` — this is the equivalent of your
custom GPT's instructions. You can also swap `gpt-4o-mini` for another OpenAI model.

## Changing update times

Edit the `SLOTS` array in `scripts/generate-summary.js` (times are America/New_York, DST-safe).

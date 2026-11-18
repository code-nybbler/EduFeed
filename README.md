# Learning Feed

An endless, social-media-style feed of interesting articles that gradually adapts to what you like. Built with React and Vite. React is the only runtime dependency.

## Run it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo with a `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes the site.

## How it works

- **Content:** three sources, all called straight from the browser (they allow cross-origin requests), so no scraper or server is needed:
  - `src/wiki.js`: Wikipedia articles (random, and "more like this").
  - `src/onThisDay.js`: events, births and deaths for today's date, from Wikipedia's On This Day feed. One request per day, cached.
  - `src/commons.js`: Wikimedia Commons images and videos. Exploration draws from Commons' Featured pictures and Featured media collections; once you've liked things, it searches Commons for those topics instead.
- **Personalisation:** `src/profile.js` keeps likes, saves and interest weights in `localStorage`. Nothing leaves the user's browser.
- **The feed:** `src/useFeed.js` fetches all sources in parallel (one failing never blocks the rest) and `src/batch.js` assembles each batch of 10: one "On this day" card, one Commons image, one Commons video, and seven articles. The personalised share of the articles grows with each like or save (up to 70%) and articles are ranked by category match.
- **Infinite scroll:** `src/components/Feed.jsx` uses `IntersectionObserver`.

## Attribution

Wikipedia text is licensed CC BY-SA 4.0, and every Commons file has its own license that usually requires crediting the author. Cards show the author and license and link back to the source (the Commons file page for media). Keep that if you change the card design.

# Learning Feed

An endless, social-media-style feed of interesting articles, photos and videos that gradually adapts to what you like. Built with React and Vite. React is the only runtime dependency.

## Run it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build into dist/
npm test          # logic tests + a simulated-browser end-to-end test (network is mocked)
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo with a `main` branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes the site.

## Features

- **For you:** the main feed. Each batch of 10 mixes Wikipedia articles, one "On this day" card, and one Commons image and video. The personalised share of the articles grows with every like or save (up to 70%). Articles with a picture rank above ones without.
- **Category buttons:** a scrollable row in the fixed header (History, Science, Nature, Space, Tech, Health, Arts, People, Society, World). Edit the list in `src/filters.js`.
- **Clickable tags:** every tag on a card opens a feed of everything carrying that tag, from both Wikipedia and Commons, shown once each until it runs out.
- **Collections:** the **📁 Collect** button on a card adds it to a collection (and saves it). The Saved tab filters by collection, and collections can be renamed or deleted. Deleting one never deletes the saved posts.
- **Streak:** a day counts when you read 5 cards (change `DAILY_GOAL` in `src/streak.js`). A card counts once it has been mostly on screen for about a second. Days follow the user's own time zone.
- **Near me:** asks for the browser's location only when the user taps it. Shows Wikipedia articles and Commons photos within 10 km, nearest first. A checkbox lets users also mix nearby places into For you; if they have already granted permission, it picks the location up again without a prompt.

## How it works

- **Content:** all sources are called straight from the browser (they allow cross-origin requests), so no scraper or server is needed.
  - `src/wiki.js`: Wikipedia articles (random, "more like this", by topic, by category, and by location).
  - `src/onThisDay.js`: events, births and deaths for today's date. One request per day, cached.
  - `src/commons.js`: Wikimedia Commons images and videos (featured, by topic, by category, and by location).
- **Feed assembly:** `src/sources.js` decides what to fetch for the active filter, `src/batch.js` ranks and mixes the results, and `src/useFeed.js` runs the infinite scroll. One source failing never blocks the rest.
- **Profile:** `src/profile.js` holds likes, saves, collections, interest weights, streak and settings as pure functions.
- **Location:** `src/useGeolocation.js` rounds coordinates to about 110 m. They stay in memory and are sent only to Wikimedia as part of the search.

## Moving to Firebase

All persistence goes through `src/storage.js`, which currently uses `localStorage`. To switch, replace `loadProfile` and `persistProfile` there; the notes at the top of that file map the profile onto Firestore documents. A Firestore version will be asynchronous, so `useState(loadProfile)` in `src/App.jsx` becomes a load effect after sign-in. Collections, the streak and the nearby setting already live in the profile, so they sync with everything else.

## Attribution

Wikipedia text is licensed CC BY-SA 4.0, and every Commons file has its own license that usually requires crediting the author. Cards show the author and license and link back to the source (the Commons file page for media). Keep that if you change the card design.

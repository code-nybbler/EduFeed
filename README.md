# EduFeed

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
- **Category buttons:** a scrollable row in the fixed header. Between them they cover every Wikipedia topic label (`articletopic`). Related topics are grouped: choosing **Science** (Physics, Chemistry, Math, Space), **Tech** (Computing, Engineering, Transport), **Arts** (Visual arts, Music, Stage, Architecture, Fashion, Books), **Entertainment** (Film & TV, Games, Comics & anime, Internet, Media), **Society** (Politics, Business, Philosophy, Education, Language) or **World** (Africa, Asia, Europe, Americas, Oceania) opens a second row, and the "All ..." button there draws from the whole group. Edit the list in `src/filters.js`; give a category a `parent` to put it in a second row under that parent.
- **Clickable tags:** every tag on a card opens a feed of everything carrying that tag, from both Wikipedia and Commons, shown once each until it runs out.
- **Saved and collections:** **☆ Save** keeps a post, and the **📁 Collect** button adds it to a collection (saving it too). The Saved tab filters by collection, and collections can be renamed or deleted. Deleting one never deletes the saved posts.
- **How saves are stored:** only a small record per post (its id, kind, title and save time), never the whole card. The Saved tab fetches the full cards by id, in batches of 20, only when it is opened. Posts that can't be loaded show a placeholder (still saved, with a retry for network errors, and a link out), so a deleted article never silently disappears. "On this day" cards keep a snapshot, since they aren't a single page. Saves from older versions are converted automatically.
- **Streak:** a day counts when you read 5 cards (change `DAILY_GOAL` in `src/streak.js`). A card counts once it has been mostly on screen for about a second. Days follow the user's own time zone.
- **Near me:** asks for the browser's location only when the user taps it. Shows Wikipedia articles and Commons photos within 10 km, nearest first. A checkbox lets users also mix nearby places into For you; if they have already granted permission, it picks the location up again without a prompt.

## How it works

- **Content:** all sources are called straight from the browser (they allow cross-origin requests), so no scraper or server is needed.
  - `src/wiki.js`: Wikipedia articles (random, "more like this", by topic, by category, and by location).
  - `src/onThisDay.js`: events, births and deaths for today's date. One request per day, cached.
  - `src/commons.js`: Wikimedia Commons images and videos (featured, by topic, by category, and by location).
- **Feed assembly:** `src/sources.js` decides what to fetch for the active filter, `src/batch.js` ranks and mixes the results, and `src/useFeed.js` runs the infinite scroll. One source failing never blocks the rest.
- **Profile:** `src/profile.js` holds likes, saves, collections, interest weights, streak and settings as pure functions. `src/cardCache.js` and `src/useSavedCards.js` bring saved posts back from their ids.
- **Sync:** see "Cloud sync" below.
- **Location:** `src/useGeolocation.js` rounds coordinates to about 110 m. They stay in memory and are sent only to Wikimedia as part of the search.

## Cloud sync (Firebase)

The app always reads and writes the copy on the device, so it opens instantly and works offline. Firebase keeps a mirror of that copy in the background:

- **Where:** one Firestore document per user, `users/{uid}`: `{ v, data, rev, updatedAt }`. `data` is the whole profile as JSON text (this avoids Firestore's rules about field names and nested arrays), and `rev` is a revision number.
- **When:** changes are batched and uploaded after 20 seconds of quiet, and right away when the page is hidden or closed. `seen` and the day's reading count never trigger an upload by themselves; they go along with the next real change. Edit `DEBOUNCE_MS` in `src/sync.js` to change this.
- **Conflicts:** an upload only succeeds if the cloud copy is still the one this device last saw. If another device changed it meanwhile, the two copies are merged (nothing from either side is lost) and uploaded. The merge is a union, so something unsaved or unliked on one device can reappear if the other device still has it.
- **Offline or errors:** the sync icon in the header shows the state (hover for details). Nothing is lost: it retries with increasing delays, and immediately when the browser comes back online.
- **Code:** `src/sync.js` (the engine, no Firebase in it), `src/cloud.js` (the only file that imports Firebase; loaded on demand), `src/firebaseConfig.js` (your project's public identifiers), `src/useSync.js` (React hook).

### One-time setup in the Firebase console

1. **Authentication → Sign-in method:** enable **Anonymous**.
2. **Firestore Database → Create database:** production mode, in a location close to your users (it can't be changed later).
3. **Firestore → Rules:** publish this, so each user can only reach their own document:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### Limits to know about

- **Anonymous accounts live in one browser.** A second device gets its own, separate account, and clearing the browser's site data forgets the account. To share one profile across devices, people need to sign in with a real account (for example Google). The sync engine already handles switching accounts by merging this device's data into the account's copy; the sign-in button is the missing piece.
- A document is limited to 1 MiB. Saved posts are small records, so thousands fit; `likes` has no cap. If the profile ever grows past about 900 kB, syncing stops with a "too-large" warning, and the data stays safe on the device.

## Attribution

Wikipedia text is licensed CC BY-SA 4.0, and every Commons file has its own license that usually requires crediting the author. Cards show the author and license and link back to the source (the Commons file page for media). Keep that if you change the card design.

// Where the profile is kept. Right now that is the browser's localStorage.
//
// This is the one file to replace when moving to Firebase: the rest of the app
// only calls loadProfile() and persistProfile(). A Firestore version would be
// asynchronous (load once after sign-in, then write changes), so App.jsx's
// `useState(loadProfile)` would become a load effect. Everything in profile.js
// is pure, and the whole profile is small enough to be ONE document:
//   users/{uid}  ->  { likes, weights, seen, settings, streak, saved, collections }
// Loading it is a single read. `saved` is an array of small records
// ({ id, kind, title, at }, about 80 bytes each), not whole cards: the Saved tab
// fetches the cards again by id from Wikipedia and Commons (see cardCache.js), so
// those lookups cost no Firestore reads. A document is limited to 1 MiB, so keep
// an eye on the arrays that grow: `saved` (thousands of records fit), `likes`
// (uncapped) and `seen` (capped at 1000).

import { emptyProfile, normalizeProfile } from './profile.js';

const KEY = 'learnfeed:v1';

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

export function persistProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private mode or quota exceeded: the feed still works, it just won't remember.
  }
}

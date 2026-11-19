// Where the profile is kept. Right now that is the browser's localStorage.
//
// This is the one file to replace when moving to Firebase: the rest of the app
// only calls loadProfile() and persistProfile(). A Firestore version would be
// asynchronous (load once after sign-in, then write changes), so App.jsx's
// `useState(loadProfile)` would become a load effect. Everything in profile.js
// is pure and maps onto documents:
//   users/{uid}                      -> likes, weights, settings, streak
//   users/{uid}/saved/{cardId}       -> a saved card
//   users/{uid}/collections/{id}     -> { name, createdAt, cardIds }

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

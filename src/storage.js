// Where the profile is kept on this device: the browser's localStorage.
//
// Cloud sync (sync.js, cloud.js) works on top of this. The local copy is always the
// one the app reads and writes, so EduFeed opens instantly and works offline; the
// cloud copy is a mirror that is kept in step in the background.
//
// The cloud copy is a single Firestore document per user, users/{uid}, holding the
// whole profile as JSON text plus a revision number (see cloud.js). Every profile
// function in profile.js is pure, so none of them know about any of this.
//
// A Firestore document is limited to 1 MiB. Saved posts are small records (about 80
// bytes each, see profile.js), so thousands fit. `likes` is the one list with no cap.

import { emptyProfile, normalizeProfile } from './profile.js';

const KEY = 'learnfeed:v1';
const SYNC_KEY = 'learnfeed:sync:v1';

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

/** Sync bookkeeping that must survive a reload: which account, the cloud revision last seen, unsynced changes. */
export const syncMetaStore = {
  load() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(meta) {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify(meta));
    } catch {
      // Not remembering only means the next visit re-checks the cloud copy.
    }
  },
};

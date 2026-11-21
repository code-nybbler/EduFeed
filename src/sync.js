// Keeps the local profile and its cloud copy in step. The local copy always comes
// first: the app works from it immediately and offline, and this runs on the side.
//
// How it decides what to do (each time it syncs):
//   - Nothing in the cloud yet:       upload the local profile (if there is anything in it).
//   - Cloud unchanged since we last looked:   upload only if we have unsynced changes.
//   - Cloud changed, we have no changes:      take the cloud copy.
//   - Cloud changed AND we have changes:      merge both (mergeProfiles) and upload the result.
// Uploads are compare-and-set against the revision we last saw, so they can never
// overwrite a newer cloud copy: if it moved in the meantime, we start again and merge.
//
// Writes are rationed so the free tier goes a long way: changes are batched for
// DEBOUNCE_MS, and some constantly-changing things (`seen`, the day's reading
// count) never trigger an upload by themselves; they simply go along with the next one.
//
// The Firebase specifics live behind `adapter` (see cloud.js), which keeps this file
// testable without a network.

import { isEmptyProfile, mergeProfiles, normalizeProfile } from './profile.js';

export const DEBOUNCE_MS = 20000;
export const MAX_BYTES = 900000; // a Firestore document holds up to 1 MiB
export const REFRESH_MS = 60000; // coming back to the tab checks the cloud copy, at most this often
const MAX_TRIES = 4; // compare-and-set conflicts in one sync before giving up until the next one
const RETRY_MS = [5000, 15000, 45000, 120000, 300000];

/** Did anything change that is worth uploading? Ignores `seen` and the day's reading progress. */
export function worthSyncing(prev, next) {
  return (
    prev.likes !== next.likes ||
    prev.saved !== next.saved ||
    prev.collections !== next.collections ||
    prev.weights !== next.weights ||
    prev.settings !== next.settings ||
    prev.streak.current !== next.streak.current ||
    prev.streak.best !== next.streak.best ||
    prev.streak.lastDay !== next.streak.lastDay
  );
}

const fail = (code, message) => Object.assign(new Error(message), { code });

function parseRemote(json) {
  try {
    return normalizeProfile(JSON.parse(json));
  } catch {
    // Never overwrite something we can't read.
    throw fail('corrupt', 'The copy in your account could not be read.');
  }
}

/**
 * @param adapter         { signIn(), load(uid), save(uid, json, expectedRev) }, see cloud.js
 * @param getProfile      () => the current profile
 * @param replaceProfile  (profile) => void: swaps in a profile that came from the cloud
 * @param store           { load(), save(meta) }: where we remember { uid, rev, dirty } between visits
 * @param onStatus        ({ state: 'syncing'|'synced'|'offline'|'error', code?, message? }) => void
 */
export function createSync({
  adapter,
  getProfile,
  replaceProfile,
  store,
  onStatus = () => {},
  debounceMs = DEBOUNCE_MS,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
}) {
  // rev: the cloud revision we last saw. dirty: changes not yet uploaded.
  let meta = { uid: null, rev: 0, dirty: false, ...store.load() };
  let changeSeq = 0; // counts worthwhile changes, to notice edits made while an upload is in flight
  let lastApplied = null; // the profile we last took from the cloud, so that doesn't count as an edit
  let running = false;
  let again = false;
  let stopped = false;
  let failures = 0;
  let debounceTimer = null;
  let retryTimer = null;
  let inflight = Promise.resolve();
  let lastRunAt = 0;
  const clock = timers.now ?? (() => Date.now());

  const persist = () => store.save(meta);

  function apply(profile) {
    lastApplied = profile;
    replaceProfile(profile);
  }

  async function cycle() {
    const uid = await adapter.signIn();

    // A different account than last time (or the first time ever): whatever is on this device is
    // unsynced as far as that account is concerned, so it must be merged in, not overwritten.
    if (meta.uid !== uid) {
      meta = { uid, rev: 0, dirty: !isEmptyProfile(getProfile()) };
      persist();
    }

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const remote = await adapter.load(uid);
      const local = getProfile();
      let toPush = null;

      if (!remote) {
        meta.rev = 0;
        if (meta.dirty || !isEmptyProfile(local)) toPush = local;
      } else if (remote.rev !== meta.rev) {
        const theirs = parseRemote(remote.json);
        if (meta.dirty) {
          toPush = mergeProfiles(local, theirs);
          apply(toPush);
        } else {
          apply(theirs);
        }
        meta.rev = remote.rev;
      } else if (meta.dirty) {
        toPush = local;
      }

      if (!toPush) {
        meta.dirty = false;
        persist();
        return;
      }

      const json = JSON.stringify(toPush);
      if (json.length > MAX_BYTES) throw fail('too-large', 'Your data is too large to sync.');

      const seq = changeSeq;
      const result = await adapter.save(uid, json, meta.rev);
      if (!result.ok) continue; // the cloud copy moved while we were working: read it again and merge
      meta.rev = result.rev;
      meta.dirty = changeSeq !== seq; // edited during the upload? then there is more to send
      persist();
      return;
    }
    throw fail('conflict', 'Your account kept changing while syncing. Will try again.');
  }

  function scheduleRetry() {
    timers.clear(retryTimer);
    const wait = RETRY_MS[Math.min(Math.max(failures, 1), RETRY_MS.length) - 1];
    retryTimer = timers.set(syncNow, wait);
  }

  /** Syncs now. The promise settles when it (and any run queued behind it) is finished; it never rejects: problems go to onStatus. */
  function syncNow() {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true; // finish this one, then go once more
      return inflight;
    }
    running = true;
    lastRunAt = clock();
    timers.clear(debounceTimer);
    timers.clear(retryTimer);
    inflight = (async () => {
      try {
        if (!isOnline()) {
          onStatus({ state: 'offline' });
          failures = Math.max(failures, 1);
          scheduleRetry();
          return;
        }
        onStatus({ state: 'syncing' });
        await cycle();
        failures = 0;
        onStatus({ state: 'synced' });
      } catch (e) {
        failures += 1;
        onStatus(isOnline() ? { state: 'error', code: e?.code ?? 'unknown', message: e?.message } : { state: 'offline' });
        scheduleRetry();
      } finally {
        running = false;
        if (again && !stopped) {
          again = false;
          await syncNow();
        }
      }
    })();
    return inflight;
  }

  return {
    /** Starts syncing. Call once, after the local profile has loaded. */
    start: () => syncNow(),
    syncNow,

    /** Call whenever the profile changes. Batches worthwhile changes into one upload after a quiet moment. */
    notifyChange(prev, next) {
      if (stopped || next === lastApplied) return;
      if (!worthSyncing(prev, next)) return;
      changeSeq += 1;
      meta.dirty = true;
      persist();
      timers.clear(debounceTimer);
      debounceTimer = timers.set(syncNow, debounceMs);
    },

    /** The tab came back into view: pick up changes made on another device, but not more than once a minute. */
    refresh() {
      return !stopped && clock() - lastRunAt >= REFRESH_MS ? syncNow() : Promise.resolve();
    },

    /** Forget the account and replace the local profile (signing out). Not counted as a change. */
    resetTo(profile) {
      meta = { uid: null, rev: 0, dirty: false };
      failures = 0;
      persist();
      apply(profile);
    },

    /** Upload any pending changes now (the page is being hidden or closed). */
    flush() {
      if (!stopped && meta.dirty) syncNow();
    },

    stop() {
      stopped = true;
      timers.clear(debounceTimer);
      timers.clear(retryTimer);
    },

    /** For tests and debugging. */
    meta: () => ({ ...meta }),
  };
}

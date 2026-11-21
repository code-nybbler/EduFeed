// The Firebase side of syncing. This is the only file that imports the Firebase
// SDK, and it is loaded lazily (see useSync.js), so the app paints from its local
// copy first and the SDK downloads in the background.
//
// It implements the small "adapter" interface that sync.js is written against:
//   signIn()                           -> uid (anonymous sign-in the first time, then the saved session)
//   load(uid)                          -> { json, rev } or null if there is no cloud copy yet
//   save(uid, json, expectedRev)       -> { ok: true, rev } or { ok: false } if the cloud copy
//                                         changed since `expectedRev` (so nothing is overwritten)
//
// The cloud copy is ONE document, users/{uid}:
//   { v: 1, data: "<the whole profile as JSON text>", rev: <number>, updatedAt: <server time> }
// Keeping the profile as text (instead of nested Firestore fields) sidesteps Firestore's rules
// about field names, nested arrays and per-field indexes, and means one read and one write per sync.

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';

export function createFirebaseAdapter() {
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const ref = (uid) => doc(db, 'users', uid);

  return {
    async signIn() {
      await auth.authStateReady(); // wait for Firebase to restore a previous session, if there is one
      if (auth.currentUser) return auth.currentUser.uid;
      const credential = await signInAnonymously(auth);
      return credential.user.uid;
    },

    async load(uid) {
      const snap = await getDoc(ref(uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return { json: String(data.data ?? ''), rev: Number(data.rev) || 0 };
    },

    // A transaction makes this a compare-and-set: the write only happens if the
    // document is still at the revision the caller last saw.
    save(uid, json, expectedRev) {
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref(uid));
        const current = snap.exists() ? Number(snap.data().rev) || 0 : 0;
        if (current !== expectedRev) return { ok: false };
        const rev = current + 1;
        tx.set(ref(uid), { v: 1, data: json, rev, updatedAt: serverTimestamp() });
        return { ok: true, rev };
      });
    },
  };
}

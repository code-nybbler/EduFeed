// The Firebase side of syncing. This is the only file that imports the Firebase
// SDK, and it is loaded lazily (see useSync.js), so the app paints from its local
// copy first and the SDK downloads in the background.
//
// It implements the small "adapter" interface that sync.js is written against:
//   signIn()                           -> uid (anonymous sign-in the first time, then the saved session)
//   load(uid)                          -> { json, rev } or null if there is no cloud copy yet
//   save(uid, json, expectedRev)       -> { ok: true, rev } or { ok: false } if the cloud copy
//                                         changed since `expectedRev` (so nothing is overwritten)
// plus, for accounts:
//   getUser()                          -> { uid, isAnonymous, name, email, photo } or null
//   onUser(callback)                   -> calls back whenever the signed-in user changes; returns an unsubscribe
//   signInWithGoogle()                 -> opens Google's sign-in window (see below)
//   signOut()
//
// The cloud copy is ONE document, users/{uid}:
//   { v: 1, data: "<the whole profile as JSON text>", rev: <number>, updatedAt: <server time> }
// Keeping the profile as text (instead of nested Firestore fields) sidesteps Firestore's rules
// about field names, nested arrays and per-field indexes, and means one read and one write per sync.

import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.js';

// A person's name, email and photo. Right after an anonymous account is upgraded they can still be
// empty on the user object itself, but the provider's copy (providerData) always has them.
function describe(user) {
  if (!user) return null;
  const from = (key) => user[key] || user.providerData.find((p) => p?.[key])?.[key] || '';
  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    name: from('displayName'),
    email: from('email'),
    photo: from('photoURL'),
  };
}

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

    getUser: () => describe(auth.currentUser),

    onUser: (callback) => onAuthStateChanged(auth, (user) => callback(describe(user))),

    /**
     * First choice: attach Google to the account the person already has (they are anonymous
     * until now), so the same uid and all their data carry over. If that Google account is
     * already used by an account (say, from another device), switch to that account instead;
     * the sync engine then merges this device's data into it.
     */
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      await auth.authStateReady();
      try {
        if (auth.currentUser) await linkWithPopup(auth.currentUser, provider);
        else await signInWithPopup(auth, provider);
      } catch (e) {
        if (e?.code !== 'auth/credential-already-in-use') throw e;
        const credential = GoogleAuthProvider.credentialFromError(e);
        if (!credential) throw e;
        await signInWithCredential(auth, credential);
      }
    },

    signOut: () => signOut(auth),

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

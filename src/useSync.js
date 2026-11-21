import { useCallback, useEffect, useRef, useState } from 'react';
import { createSync } from './sync.js';
import { syncMetaStore } from './storage.js';
import { emptyProfile } from './profile.js';
import { authMessage } from './authMessages.js';

const UNSYNCED = {
  code: 'unsynced',
  message:
    "Couldn't save your latest changes to your account yet, so you weren't signed out. Check your connection and try again.",
};

/**
 * Runs cloud sync alongside the app, and handles signing in and out.
 *
 * `adapter`: leave it out to use Firebase (loaded on demand, after the first paint);
 * pass `null` to turn syncing off; pass an object to use that instead (tests).
 *
 * Returns
 *   status          { state: 'off' | 'syncing' | 'synced' | 'offline' | 'error', code?, message? }
 *   account         undefined while unknown, null when there is no user, else { uid, isAnonymous, name, email, photo }
 *   canSignIn       whether this adapter offers Google sign-in
 *   busy            a sign-in or sign-out is in progress
 *   authError       text to show after a failed sign-in or sign-out (cancelling the window is not an error)
 *   clearAuthError, signIn(), signOut()
 */
export function useSync(profile, setProfile, { adapter, debounceMs } = {}) {
  const [status, setStatus] = useState({ state: adapter === null ? 'off' : 'syncing' });
  const [account, setAccount] = useState(undefined);
  const [canSignIn, setCanSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const previous = useRef(profile);
  const engine = useRef(null);
  const adapterRef = useRef(null);

  useEffect(() => {
    if (adapter === null) return undefined;
    let cancelled = false;
    let sync = null;
    const cleanups = [];

    (async () => {
      try {
        const resolved = adapter ?? (await import('./cloud.js')).createFirebaseAdapter();
        if (cancelled) return;
        adapterRef.current = resolved;
        setCanSignIn(typeof resolved.signInWithGoogle === 'function');

        sync = createSync({
          adapter: resolved,
          getProfile: () => profileRef.current,
          replaceProfile: (next) => {
            profileRef.current = next; // visible to the engine straight away, before React re-renders
            setProfile(next);
          },
          store: syncMetaStore,
          onStatus: (s) => {
            if (cancelled) return;
            setStatus(s);
            // The anonymous account is created during the first sync, so look again once it is done.
            if (s.state === 'synced') setAccount(resolved.getUser?.() ?? null);
          },
          debounceMs,
        });
        engine.current = sync;

        if (typeof resolved.onUser === 'function') {
          const off = resolved.onUser((user) => !cancelled && setAccount(user));
          if (typeof off === 'function') cleanups.push(off);
        }

        const online = () => sync.syncNow();
        const visibility = () => (document.visibilityState === 'hidden' ? sync.flush() : sync.refresh());
        const leaving = () => sync.flush();
        window.addEventListener('online', online);
        window.addEventListener('pagehide', leaving);
        document.addEventListener('visibilitychange', visibility);
        cleanups.push(
          () => window.removeEventListener('online', online),
          () => window.removeEventListener('pagehide', leaving),
          () => document.removeEventListener('visibilitychange', visibility)
        );

        sync.start();
      } catch (e) {
        if (!cancelled) setStatus({ state: 'error', code: e?.code ?? 'init', message: e?.message });
      }
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      sync?.stop();
      engine.current = null;
      adapterRef.current = null;
    };
  }, [adapter, debounceMs, setProfile]);

  // Tell the engine about every change to the profile.
  useEffect(() => {
    if (previous.current !== profile) {
      engine.current?.notifyChange(previous.current, profile);
      previous.current = profile;
    }
  }, [profile]);

  const signIn = useCallback(async () => {
    const a = adapterRef.current;
    const sync = engine.current;
    if (!a?.signInWithGoogle || !sync) return;
    setBusy(true);
    setAuthError(null);
    try {
      await a.signInWithGoogle();
      setAccount(a.getUser?.() ?? null);
      await sync.syncNow(); // a new account's copy is merged with this device's data
    } catch (e) {
      setAuthError(authMessage(e)); // null (the window was just closed) shows nothing
    } finally {
      setBusy(false);
    }
  }, []);

  // Signing out removes this person's data from the device, so make sure it is safely in the account first.
  const signOut = useCallback(async () => {
    const a = adapterRef.current;
    const sync = engine.current;
    if (!a?.signOut || !sync) return;
    setBusy(true);
    setAuthError(null);
    try {
      await sync.syncNow();
      if (sync.meta().dirty) throw UNSYNCED;
      await a.signOut();
      sync.resetTo(emptyProfile());
      setAccount(null);
      await sync.syncNow(); // starts a fresh anonymous account for whoever uses this device next
    } catch (e) {
      setAuthError(authMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return { status, account, canSignIn, busy, authError, clearAuthError, signIn, signOut };
}

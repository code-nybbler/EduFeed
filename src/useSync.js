import { useEffect, useRef, useState } from 'react';
import { createSync } from './sync.js';
import { syncMetaStore } from './storage.js';

/**
 * Runs cloud sync alongside the app and reports its status.
 *
 * `adapter`: leave it out to use Firebase (loaded on demand, after the first paint);
 * pass `null` to turn syncing off; pass an object to use that instead (tests).
 * Returns { state: 'off' | 'syncing' | 'synced' | 'offline' | 'error', code?, message? }.
 */
export function useSync(profile, setProfile, { adapter, debounceMs } = {}) {
  const [status, setStatus] = useState({ state: adapter === null ? 'off' : 'syncing' });
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const previous = useRef(profile);
  const engine = useRef(null);

  useEffect(() => {
    if (adapter === null) return undefined;
    let cancelled = false;
    let sync = null;
    const cleanups = [];

    (async () => {
      try {
        const resolved = adapter ?? (await import('./cloud.js')).createFirebaseAdapter();
        if (cancelled) return;
        sync = createSync({
          adapter: resolved,
          getProfile: () => profileRef.current,
          replaceProfile: (next) => {
            profileRef.current = next; // visible to the engine straight away, before React re-renders
            setProfile(next);
          },
          store: syncMetaStore,
          onStatus: (s) => !cancelled && setStatus(s),
          debounceMs,
        });
        engine.current = sync;

        const online = () => sync.syncNow();
        const hidden = () => document.visibilityState === 'hidden' && sync.flush();
        const leaving = () => sync.flush();
        window.addEventListener('online', online);
        window.addEventListener('pagehide', leaving);
        document.addEventListener('visibilitychange', hidden);
        cleanups.push(
          () => window.removeEventListener('online', online),
          () => window.removeEventListener('pagehide', leaving),
          () => document.removeEventListener('visibilitychange', hidden)
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
    };
  }, [adapter, debounceMs, setProfile]);

  // Tell the engine about every change to the profile.
  useEffect(() => {
    if (previous.current !== profile) {
      engine.current?.notifyChange(previous.current, profile);
      previous.current = profile;
    }
  }, [profile]);

  return status;
}

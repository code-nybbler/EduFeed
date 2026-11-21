import { useCallback, useRef, useState } from 'react';
import { buildBatch, isEmptyParts, leftovers, mergeParts } from './batch.js';
import { fetchParts, initialCursor } from './sources.js';
import { isSequential } from './filters.js';
import { markSeen } from './profile.js';

const MAX_ATTEMPTS = 3;

/**
 * Infinite feed for one filter. The component using this is keyed by the
 * filter, so changing the filter starts a fresh feed.
 *
 * "For you" and category feeds sample at random and never repeat. Tag, search and
 * nearby feeds walk through a fixed list: they keep a cursor per source plus a
 * buffer of fetched-but-not-yet-shown cards, and report `done` once all of it
 * has been shown.
 */
export function useFeed(profile, setProfile, filter, coords) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const coordsRef = useRef(coords);
  coordsRef.current = coords;

  const inFlight = useRef(false);
  const finished = useRef(false);
  const sessionIds = useRef(new Set());
  const cursor = useRef(initialCursor(filter));
  const buffer = useRef(null);

  const loadMore = useCallback(async () => {
    if (inFlight.current || finished.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const sequential = isSequential(filter);
      let page = [];
      let exhausted = false;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const p = profileRef.current;
        // The main feed never repeats anything the user has ever been shown.
        // Other feeds only avoid repeats within themselves.
        const exclude = new Set(sessionIds.current);
        if (filter.type === 'all') p.seen.forEach((id) => exclude.add(id));

        const { parts: fetched, errors } = await fetchParts(filter, {
          profile: p,
          exclude,
          cursor: cursor.current,
          coords: coordsRef.current,
        });
        const parts = sequential && buffer.current ? mergeParts(buffer.current, fetched) : fetched;
        if (isEmptyParts(parts) && errors.length > 0) throw errors[0];

        page = buildBatch(parts, p, exclude, { keepOrder: filter.type === 'nearby' || filter.type === 'search' });

        if (sequential) {
          buffer.current = leftovers(parts, page, exclude);
          exhausted =
            Object.values(cursor.current).every((v) => v === null) && isEmptyParts(buffer.current);
        }
        if (page.length > 0 || exhausted) break;
      }

      if (page.length > 0) {
        const ids = page.map((c) => c.id);
        ids.forEach((id) => sessionIds.current.add(id));
        setProfile((p) => markSeen(p, ids));
        setCards((prev) => [...prev, ...page]);
      }
      if (exhausted) {
        finished.current = true;
        setDone(true);
      } else if (page.length === 0) {
        setError('Nothing new found right now.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [filter, setProfile]);

  return { cards, loading, error, done, loadMore };
}

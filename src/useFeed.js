import { useCallback, useRef, useState } from 'react';
import { fetchRandom, fetchRelated } from './wiki.js';
import { fetchOnThisDay } from './onThisDay.js';
import { fetchCommonsImages, fetchCommonsVideos } from './commons.js';
import { BATCH, SPECIAL_SLOTS, buildBatch } from './batch.js';
import { markSeen, personalRatio, pickSeeds } from './profile.js';

const MAX_ATTEMPTS = 3;

/**
 * Infinite feed. Each batch pulls from four sources at once:
 *   - Wikipedia articles: random ones plus ones similar to what the user liked
 *   - "On this day" history for today's date
 *   - one Wikimedia Commons image and one Commons video
 * The personalised share grows as the user likes and saves more. A source that
 * fails or is slow never blocks the others.
 */
export function useFeed(profile, setProfile) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const inFlight = useRef(false);
  const sessionIds = useRef(new Set());

  const loadMore = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      let page = [];
      for (let attempt = 0; attempt < MAX_ATTEMPTS && page.length === 0; attempt++) {
        const p = profileRef.current;
        const exclude = new Set([...p.seen, ...sessionIds.current]);

        const ratio = personalRatio(p);
        const slots = BATCH - SPECIAL_SLOTS; // slots left for Wikipedia articles
        const seeds = ratio > 0 ? pickSeeds(p, 3) : [];
        const nPersonal = seeds.length ? Math.round(slots * ratio) : 0;
        const perSeed = seeds.length ? Math.ceil(nPersonal / seeds.length) + 3 : 0;

        // With some probability, fetch media about a topic the user liked instead of a featured one.
        const topicFor = (i) =>
          seeds.length && Math.random() < ratio ? seeds[i % seeds.length] : undefined;

        const errors = [];
        const safe = (promise) =>
          promise.catch((e) => {
            errors.push(e);
            return [];
          });

        const [random, related, otd, images, videos] = await Promise.all([
          // Ask for extra: some results are filtered out or are repeats.
          safe(fetchRandom(slots - nPersonal + 4)),
          Promise.all(seeds.map((title) => safe(fetchRelated(title, perSeed)))).then((lists) => lists.flat()),
          safe(fetchOnThisDay(4, exclude)),
          safe(fetchCommonsImages(1, topicFor(0))),
          safe(fetchCommonsVideos(1, topicFor(1))),
        ]);

        const everything = [random, related, otd, images, videos].every((list) => list.length === 0);
        if (everything && errors.length > 0) throw errors[0];

        page = buildBatch({ random, related, otd, images, videos }, p, exclude);
      }

      if (page.length > 0) {
        const ids = page.map((c) => c.id);
        ids.forEach((id) => sessionIds.current.add(id));
        setProfile((p) => markSeen(p, ids));
        setCards((prev) => [...prev, ...page]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [setProfile]);

  return { cards, loading, error, loadMore };
}

import { scoreCard } from './profile.js';

export const BATCH = 10;
export const OTD_SLOTS = 1; // "On this day" cards per batch
export const MEDIA_SLOTS = 2; // one Commons image and one Commons video
export const NEARBY_SLOTS = 1; // a place near the user, when location is on

export const PART_KEYS = ['random', 'related', 'otd', 'nearby', 'images', 'videos'];

// Cards chosen because they resemble something the user liked get a head start.
const RELATED_BONUS = 3;
// Articles with a picture outrank ones without. The bonus is bigger than the
// random jitter (up to 2), so a picture nearly always wins a tie, but a strong
// interest match can still beat a plain article.
export const IMAGE_BONUS = 4;

/** Spread `specials` evenly through `base` instead of clumping them together. */
export function interleave(base, specials) {
  const out = [...base];
  const step = Math.floor(out.length / (specials.length + 1)) || 1;
  specials.forEach((card, i) => {
    out.splice(Math.min((i + 1) * step + i, out.length), 0, card);
  });
  return out;
}

export const emptyParts = () => Object.fromEntries(PART_KEYS.map((k) => [k, []]));

export const isEmptyParts = (parts) => PART_KEYS.every((k) => (parts[k] ?? []).length === 0);

export function mergeParts(a, b) {
  return Object.fromEntries(PART_KEYS.map((k) => [k, [...(a[k] ?? []), ...(b[k] ?? [])]]));
}

/** What was fetched but not shown and is still worth keeping for the next batch. */
export function leftovers(parts, page, exclude) {
  const shown = new Set(page.map((c) => c.id));
  return Object.fromEntries(
    PART_KEYS.map((k) => [k, (parts[k] ?? []).filter((c) => !shown.has(c.id) && !exclude.has(c.id))])
  );
}

/**
 * Turns the raw results of every source into one batch of at most BATCH cards:
 * no repeats; articles ranked by media, then interest; and "On this day",
 * nearby and Commons media cards mixed in evenly.
 *
 * With `keepOrder` the articles stay in the order given (nearest first).
 */
export function buildBatch(parts, profile, exclude, { keepOrder = false } = {}) {
  const { random = [], related = [], otd = [], nearby = [], images = [], videos = [] } = parts;

  const taken = new Set(exclude);
  const take = (list, n) => {
    const out = [];
    for (const card of list) {
      if (out.length >= n) break;
      if (taken.has(card.id)) continue;
      taken.add(card.id);
      out.push(card);
    }
    return out;
  };

  const specials = [
    ...take(otd, OTD_SLOTS),
    ...take(nearby, NEARBY_SLOTS),
    ...take(images, 1),
    ...take(videos, 1),
  ];

  const relatedIds = new Set(related.map((c) => c.id));
  const candidates = take([...related, ...random], Infinity);
  const room = BATCH - specials.length;

  let articles;
  if (keepOrder) {
    articles = candidates.slice(0, room);
  } else {
    articles = candidates
      .map((card) => ({
        card,
        key:
          scoreCard(card, profile.weights) +
          (relatedIds.has(card.id) ? RELATED_BONUS : 0) +
          (card.image ? IMAGE_BONUS : 0) +
          Math.random() * 2, // a little noise so it never feels rigid
      }))
      .sort((a, b) => b.key - a.key)
      .slice(0, room)
      .map((x) => x.card);
  }

  // Not enough articles to fill the batch (a small tag, say)? Top up with more media.
  const gap = room - articles.length;
  const extra = gap > 0 ? [...take(images, Math.ceil(gap / 2)), ...take(videos, Math.floor(gap / 2))] : [];

  return interleave(articles, [...specials, ...extra]);
}

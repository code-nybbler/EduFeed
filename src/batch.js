import { scoreCard } from './profile.js';

export const BATCH = 10;
export const OTD_SLOTS = 1; // "On this day" cards per batch
export const SPECIAL_SLOTS = OTD_SLOTS + 2; // plus one Commons image and one Commons video

// Cards chosen because they resemble something the user liked get a head start in the ranking.
const RELATED_BONUS = 3;

/** Spread `specials` evenly through `base` instead of clumping them together. */
export function interleave(base, specials) {
  const out = [...base];
  const step = Math.floor(out.length / (specials.length + 1)) || 1;
  specials.forEach((card, i) => {
    out.splice(Math.min((i + 1) * step + i, out.length), 0, card);
  });
  return out;
}

/**
 * Turns the raw results of every source into one batch of at most BATCH cards:
 * no repeats, articles ranked by interest, and "On this day" / Commons media
 * cards mixed in evenly.
 */
export function buildBatch({ random = [], related = [], otd = [], images = [], videos = [] }, profile, exclude) {
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

  const specials = [...take(otd, OTD_SLOTS), ...take(images, 1), ...take(videos, 1)];

  const relatedIds = new Set(related.map((c) => c.id));
  const candidates = take([...related, ...random], Infinity);
  const articles = candidates
    .map((card) => ({
      card,
      key:
        scoreCard(card, profile.weights) +
        (relatedIds.has(card.id) ? RELATED_BONUS : 0) +
        Math.random() * 2, // a little noise so it never feels rigid
    }))
    .sort((a, b) => b.key - a.key)
    .slice(0, BATCH - specials.length)
    .map((x) => x.card);

  return interleave(articles, specials);
}

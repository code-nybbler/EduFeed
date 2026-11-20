// Fetches the raw material for one batch of the feed. What to fetch depends on
// the active filter (see filters.js):
//   all       random articles + articles like the user's likes + On this day
//             + a Commons image and video (+ a nearby place, if the user opted in)
//   category  articles on one topic + Commons media for that topic
//   tag       everything carrying one tag, paged from the start (sequential)
//   nearby    places and photos around the user, nearest first (sequential)
// Every source is independent: one failing never blocks the others.

import { fetchCategoryPage, fetchNearby, fetchNearbyPicked, fetchRandom, fetchRelated, fetchTopic } from './wiki.js';
import { fetchOnThisDay } from './onThisDay.js';
import {
  fetchCommonsCategory,
  fetchCommonsImages,
  fetchCommonsNearby,
  fetchCommonsVideos,
} from './commons.js';
import { BATCH, MEDIA_SLOTS, NEARBY_SLOTS, OTD_SLOTS, emptyParts } from './batch.js';
import { personalRatio, pickSeeds } from './profile.js';
import { categoryById, keywordsOf, topicsOf } from './filters.js';
import { pick } from './random.js';

// Ask for more articles than slots: some get filtered out, and a larger pool
// gives the media-first ranking something to choose from.
const EXTRA = 8;

/** Sequential feeds keep a cursor per source: a number (next offset) or null (exhausted). */
export function initialCursor(filter) {
  if (filter.type === 'tag') return { articles: 0, images: 0, videos: 0 };
  if (filter.type === 'nearby') return { articles: 0, media: 0 };
  return {};
}

async function pageOf(cursor, key, fetcher) {
  if (cursor[key] === null) return [];
  const { cards, next } = await fetcher(cursor[key]);
  cursor[key] = next; // only advances if the request succeeded
  return cards;
}

function collector() {
  const errors = [];
  const safe = (promise) =>
    promise.catch((e) => {
      errors.push(e);
      return [];
    });
  return { errors, safe };
}

async function forYou({ profile, exclude, coords }) {
  const { errors, safe } = collector();
  const nearbyOn = Boolean(coords && profile.settings?.nearby);
  const slots = BATCH - OTD_SLOTS - MEDIA_SLOTS - (nearbyOn ? NEARBY_SLOTS : 0);

  const ratio = personalRatio(profile);
  const seeds = ratio > 0 ? pickSeeds(profile, 3) : [];
  const nPersonal = seeds.length ? Math.round(slots * ratio) : 0;
  const perSeed = seeds.length ? Math.ceil(nPersonal / seeds.length) + 3 : 0;

  // With some probability, fetch media about a topic the user liked instead of a featured one.
  const topicFor = (i) => (seeds.length && Math.random() < ratio ? seeds[i % seeds.length] : undefined);

  const [random, related, otd, images, videos, nearby] = await Promise.all([
    safe(fetchRandom(slots - nPersonal + EXTRA)),
    Promise.all(seeds.map((title) => safe(fetchRelated(title, perSeed)))).then((lists) => lists.flat()),
    safe(fetchOnThisDay(4, exclude)),
    safe(fetchCommonsImages(1, topicFor(0))),
    safe(fetchCommonsVideos(1, topicFor(1))),
    nearbyOn ? safe(fetchNearbyPicked(coords, 3, exclude)) : [],
  ]);
  return { parts: { random, related, otd, images, videos, nearby }, errors };
}

async function byCategory(filter, { exclude }) {
  const category = categoryById(filter.id);
  if (!category) throw new Error('Unknown category.');
  const { errors, safe } = collector();
  const slots = BATCH - MEDIA_SLOTS - (category.otd ? OTD_SLOTS : 0);

  const [random, otd, images, videos] = await Promise.all([
    safe(fetchTopic(pick(topicsOf(category)), slots + EXTRA)),
    category.otd ? safe(fetchOnThisDay(4, exclude)) : [],
    safe(fetchCommonsImages(1, pick(keywordsOf(category)))),
    safe(fetchCommonsVideos(1, pick(keywordsOf(category)))),
  ]);
  return { parts: { random, otd, images, videos }, errors };
}

async function byTag(filter, { cursor }) {
  const { errors, safe } = collector();
  const tag = filter.tag;
  const [random, images, videos] = await Promise.all([
    safe(pageOf(cursor, 'articles', (offset) => fetchCategoryPage(tag, 12, offset))),
    safe(pageOf(cursor, 'images', (offset) => fetchCommonsCategory({ video: false, category: tag, n: 6, offset }))),
    safe(pageOf(cursor, 'videos', (offset) => fetchCommonsCategory({ video: true, category: tag, n: 4, offset }))),
  ]);
  return { parts: { random, images, videos }, errors };
}

async function nearby({ cursor, coords }) {
  if (!coords) throw new Error('Your location is not available yet.');
  const { errors, safe } = collector();
  const [random, media] = await Promise.all([
    safe(pageOf(cursor, 'articles', (offset) => fetchNearby(coords, 10, offset))),
    safe(pageOf(cursor, 'media', (offset) => fetchCommonsNearby(coords, 12, offset))),
  ]);
  return {
    parts: {
      random,
      images: media.filter((c) => c.mediaType === 'image'),
      videos: media.filter((c) => c.mediaType === 'video'),
    },
    errors,
  };
}

/**
 * Fetches one round of source results for `filter`.
 * Returns { parts, errors }: parts keyed like emptyParts(), errors from any source that failed.
 */
export async function fetchParts(filter, ctx) {
  const result =
    filter.type === 'category'
      ? await byCategory(filter, ctx)
      : filter.type === 'tag'
        ? await byTag(filter, ctx)
        : filter.type === 'nearby'
          ? await nearby(ctx)
          : await forYou(ctx);
  return { parts: { ...emptyParts(), ...result.parts }, errors: result.errors };
}

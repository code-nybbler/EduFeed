// Thin client for Wikipedia's public Action API. The API supports CORS via
// `origin=*`, so the browser can call it directly: no scraper or backend needed.

import { rand, shuffle } from './random.js';

const API = 'https://en.wikipedia.org/w/api.php';

const COMMON = { action: 'query', format: 'json', formatversion: '2', origin: '*' };

const ARTICLE_PARAMS = {
  ...COMMON,
  prop: 'extracts|pageimages|info|categories',
  // Intro extract, plain text, first few sentences.
  exintro: '1',
  explaintext: '1',
  exsentences: '4',
  exlimit: 'max',
  // Lead image thumbnail.
  piprop: 'thumbnail',
  pithumbsize: '800',
  // Canonical URL.
  inprop: 'url',
  // Visible (non-maintenance) categories only: these become tags and interest signals.
  cllimit: 'max',
  clshow: '!hidden',
};

// Categories that describe the page's upkeep rather than its subject.
const NOISE = /^(articles?|all articles|wikipedia|pages|cs1|use |short description|webarchive|commons|wikidata|.*\bstubs?$)/i;

async function call(params) {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  return res.json();
}

const articleCall = (extra) => call({ ...ARTICLE_PARAMS, ...extra });

const pagesOf = (data) => data?.query?.pages ?? [];

export function toCard(page) {
  const categories = (page.categories ?? [])
    .map((c) => c.title.replace(/^Category:/, ''))
    .filter((c) => !NOISE.test(c));

  return {
    id: page.pageid,
    kind: 'article',
    seedTitle: page.title,
    title: page.title,
    extract: (page.extract ?? '').trim(),
    image: page.thumbnail?.source ?? null,
    url: page.fullurl,
    categories,
  };
}

// Drop stubs, disambiguation pages and list articles: they make dull cards.
export function isGoodCard(card) {
  if (card.extract.length < 120) return false;
  if (/^list of /i.test(card.title)) return false;
  if (card.categories.some((c) => /disambiguation/i.test(c))) return false;
  if (/may refer to:?$/i.test(card.extract.split('\n')[0])) return false;
  return true;
}

function toCards(pages) {
  // `generator=search` returns an `index` that preserves relevance order.
  return [...pages]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(toCard)
    .filter(isGoodCard);
}

/** `n` random articles: the exploration half of the feed. */
export async function fetchRandom(n) {
  const data = await articleCall({
    generator: 'random',
    grnnamespace: '0',
    grnlimit: String(Math.min(n, 20)),
  });
  return toCards(pagesOf(data));
}

/** Up to `n` articles similar to `title`: the personalised half of the feed. */
export async function fetchRelated(title, n) {
  const data = await articleCall({
    generator: 'search',
    gsrsearch: `morelike:${title}`,
    gsrnamespace: '0',
    gsrlimit: String(Math.min(n, 20)),
  });
  return toCards(pagesOf(data));
}

/**
 * One page of search results. `next` is the offset to pass for the following
 * page, or null when there are no more.
 */
export async function searchPage(search, n, offset = 0) {
  const data = await articleCall({
    generator: 'search',
    gsrsearch: search,
    gsrnamespace: '0',
    gsrlimit: String(Math.min(n, 20)),
    gsroffset: String(offset),
  });
  return { cards: toCards(pagesOf(data)), next: data?.continue?.gsroffset ?? null };
}

/** Random articles about a topic (a Wikipedia "articletopic" value such as "history"). */
export async function fetchTopic(topic, n) {
  const search = `articletopic:${topic}`;
  const offset = rand(3000); // random start, so every call shows something different
  let { cards } = await searchPage(search, n, offset);
  if (cards.length === 0 && offset > 0) ({ cards } = await searchPage(search, n, 0));
  return cards;
}

const cleanTag = (tag) => String(tag).replace(/"/g, '');

/** Articles in one Wikipedia category (a card's tag), paged. */
export const fetchCategoryPage = (tag, n, offset = 0) => searchPage(`incategory:"${cleanTag(tag)}"`, n, offset);

// ---------- nearby ----------

const nearbyCache = new Map(); // 'lat|lon' -> Promise<{ pageid, title, dist }[]>, nearest first

const coordKey = ({ lat, lon }) => `${lat.toFixed(3)}|${lon.toFixed(3)}`;

/** Articles about places within 10 km (the API's maximum radius), nearest first. Cached per location. */
export function nearbyIndex(coords) {
  const key = coordKey(coords);
  if (!nearbyCache.has(key)) {
    const request = call({
      ...COMMON,
      list: 'geosearch',
      gscoord: `${coords.lat}|${coords.lon}`,
      gsradius: '10000',
      gslimit: '100',
      gsnamespace: '0',
    }).then((data) => data?.query?.geosearch ?? []);
    request.catch(() => nearbyCache.delete(key)); // let the next call retry
    nearbyCache.set(key, request);
  }
  return nearbyCache.get(key);
}

async function cardsForEntries(entries) {
  if (entries.length === 0) return [];
  const data = await articleCall({ pageids: entries.map((e) => e.pageid).join('|') });
  const order = new Map(entries.map((e, i) => [e.pageid, { i, dist: e.dist }]));
  return pagesOf(data)
    .filter((p) => order.has(p.pageid))
    .sort((a, b) => order.get(a.pageid).i - order.get(b.pageid).i)
    .map((p) => ({ ...toCard(p), distanceM: order.get(p.pageid).dist }))
    .filter(isGoodCard);
}

/** A page of nearby articles in distance order. */
export async function fetchNearby(coords, n, offset = 0) {
  const index = await nearbyIndex(coords);
  const slice = index.slice(offset, offset + Math.min(n, 20));
  const end = offset + slice.length;
  return { cards: await cardsForEntries(slice), next: end < index.length ? end : null };
}

/** `n` random articles from the closest 60 places, skipping ids in `exclude`: for mixing into the main feed. */
export async function fetchNearbyPicked(coords, n, exclude = new Set()) {
  const index = await nearbyIndex(coords);
  const pool = index.slice(0, 60).filter((e) => !exclude.has(e.pageid));
  return cardsForEntries(shuffle(pool).slice(0, Math.min(n, 20)));
}

/**
 * Full cards for these page ids: how saved posts are brought back. Pages that no
 * longer exist are left out of the result. Unlike the feed, nothing is filtered:
 * the user saved these on purpose, even if the article has since become short.
 * Callers send at most 20 ids at a time (the limit for extracts).
 */
export async function fetchArticlesByIds(ids) {
  const data = await articleCall({ pageids: ids.join('|') });
  return new Map(
    pagesOf(data)
      .filter((p) => !p.missing && !p.invalid)
      .map((p) => [p.pageid, toCard(p)])
  );
}

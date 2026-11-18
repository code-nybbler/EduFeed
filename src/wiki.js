// Thin client for Wikipedia's public Action API. The API supports CORS via
// `origin=*`, so the browser can call it directly: no scraper or backend needed.

const API = 'https://en.wikipedia.org/w/api.php';

const BASE_PARAMS = {
  action: 'query',
  format: 'json',
  formatversion: '2',
  origin: '*',
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
  // Visible (non-maintenance) categories only: these become interest signals.
  cllimit: 'max',
  clshow: '!hidden',
};

// Categories that describe the page's upkeep rather than its subject.
const NOISE = /^(articles?|all articles|wikipedia|pages|cs1|use |short description|webarchive|commons|wikidata|.*\bstubs?$)/i;

async function query(extra) {
  const url = `${API}?${new URLSearchParams({ ...BASE_PARAMS, ...extra })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikipedia API error ${res.status}`);
  const data = await res.json();
  return data?.query?.pages ?? [];
}

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
  const pages = await query({
    generator: 'random',
    grnnamespace: '0',
    grnlimit: String(Math.min(n, 20)),
  });
  return toCards(pages);
}

/** Up to `n` articles similar to `title`: the personalised half of the feed. */
export async function fetchRelated(title, n) {
  const pages = await query({
    generator: 'search',
    gsrsearch: `morelike:${title}`,
    gsrnamespace: '0',
    gsrlimit: String(Math.min(n, 20)),
  });
  return toCards(pages);
}

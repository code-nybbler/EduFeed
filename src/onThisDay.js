// "On this day" events, births and deaths from Wikipedia's feed API.
// One request per calendar day returns everything; we cache it and hand out
// cards from the pool without repeating.

const FEED = 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/all';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// [response key, card section, curated by Wikipedia's editors?]
const SECTIONS = [
  ['selected', 'event', true],
  ['events', 'event', false],
  ['births', 'birth', false],
  ['deaths', 'death', false],
];

const cache = new Map(); // 'MM/DD' -> Promise<{ card, featured }[]>

export function formatYear(year) {
  return year < 0 ? `${-year} BC` : String(year);
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// The feed's thumbnails are small (usually 320px). Ask for a 640px version
// when the original is big enough: Wikimedia refuses to upscale.
function sharpen(page, width = 640) {
  const src = page.thumbnail?.source;
  if (!src) return null;
  if ((page.originalimage?.width ?? 0) < width) return src;
  return src.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`);
}

const readable = (title) => String(title ?? '').replace(/_/g, ' ');

export function toCard(item, section, now) {
  const pages = (item.pages ?? []).filter(Boolean);
  const first = pages[0];
  const lead = pages.find((p) => p.thumbnail?.source);
  const text = String(item.text).trim();
  const related = pages
    .filter((p) => p.content_urls?.desktop?.page)
    .slice(0, 3)
    .map((p) => ({ title: readable(p.title), url: p.content_urls.desktop.page }));

  return {
    id: `otd:${section}:${item.year}:${hash(text)}`,
    kind: 'otd',
    section,
    year: item.year,
    yearLabel: formatYear(item.year),
    yearsAgo: now.getFullYear() - item.year,
    dateLabel: `${MONTHS[now.getMonth()]} ${now.getDate()}`,
    title: formatYear(item.year),
    extract: text,
    image: lead ? sharpen(lead) : null,
    url: first?.content_urls?.desktop?.page ?? null,
    related,
    categories: [],
    // Liking this card makes the feed look for articles like its first topic.
    seedTitle: first ? readable(first.title) : null,
  };
}

function buildPool(data, now) {
  const seen = new Set();
  const pool = [];
  for (const [key, section, featured] of SECTIONS) {
    for (const item of data?.[key] ?? []) {
      if (!Number.isFinite(item?.year) || !item?.text) continue;
      const card = toCard(item, section, now);
      if (seen.has(card.id)) continue; // "selected" repeats entries from "events"
      seen.add(card.id);
      pool.push({ card, featured });
    }
  }
  return pool;
}

function load(now) {
  const key = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  if (!cache.has(key)) {
    const request = fetch(`${FEED}/${key}`)
      .then((res) => {
        if (!res.ok) throw new Error(`On This Day error ${res.status}`);
        return res.json();
      })
      .then((data) => buildPool(data, now));
    request.catch(() => cache.delete(key)); // let the next batch retry
    cache.set(key, request);
  }
  return cache.get(key);
}

/** Up to `n` cards for today's date that aren't in `exclude`. Curated entries and ones with pictures come first, with some shuffling. */
export async function fetchOnThisDay(n, exclude = new Set(), now = new Date()) {
  const pool = await load(now);
  return pool
    .filter(({ card }) => !exclude.has(card.id))
    .map(({ card, featured }) => ({
      card,
      key: Math.random() - (featured ? 0.5 : 0) - (card.image ? 0.2 : 0),
    }))
    .sort((a, b) => a.key - b.key)
    .slice(0, n)
    .map((x) => x.card);
}

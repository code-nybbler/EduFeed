// Images and videos from Wikimedia Commons, via its search API (CORS-enabled
// with `origin=*`). Exploration uses Commons' curated collections; topical
// requests search by a topic; tag requests list one Commons category; nearby
// requests use Commons' geotagged files.

const API = 'https://commons.wikimedia.org/w/api.php';

const FEATURED_PICTURES = 'incategory:"Featured pictures on Wikimedia Commons"';
// "Featured media" is mostly videos (.webm/.ogv) plus some audio; filetype:video narrows it.
const FEATURED_VIDEOS = 'incategory:"Featured media" filetype:video';

const COMMON = { action: 'query', format: 'json', formatversion: '2', origin: '*' };

const INFO_PARAMS = {
  ...COMMON,
  prop: 'imageinfo',
  iiprop: 'url|mime|mediatype|size|extmetadata',
  iiurlwidth: '800', // thumbnail (or video poster frame) width
  iiextmetadatalanguage: 'en',
  iiextmetadatafilter: 'ImageDescription|Artist|LicenseShortName|LicenseUrl|Categories',
};

// Commons categories that describe housekeeping, licensing or authorship rather than the subject.
const NOISE =
  /featured|quality images|valued image|picture of the day|media of the day|^cc-|^pd-|^gfdl|self-published|uploaded|^files? |^images? |photographs? (by|taken)| by |wikimedia|commons|\d{4}/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Commons metadata is HTML. We show plain text, so tags are removed and entities decoded. */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, e) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[e.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`;
}

/**
 * Turns a Commons file page into a card, or null if it doesn't suit the feed.
 * With `titleFallback`, a file with no real description uses its title instead
 * (nearby photos are often captioned only by their filename).
 */
export function toMediaCard(page, { titleFallback = false } = {}) {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl) return null;

  const mediaType =
    info.mediatype === 'VIDEO' ? 'video' : info.mediatype === 'BITMAP' || info.mediatype === 'DRAWING' ? 'image' : null;
  if (!mediaType) return null; // audio, PDFs, 3D models, etc. don't suit the feed
  if (mediaType === 'image' && (info.width ?? 0) < 600) return null;

  const meta = info.extmetadata ?? {};
  const value = (key) => meta[key]?.value ?? '';

  const title = page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
  let description = clip(stripHtml(value('ImageDescription')).replace(/^English\s*:\s*/i, ''), 420);
  if (description.length < 25) {
    if (!titleFallback || title.length < 8) return null; // a bare filename makes a dull card
    description = title;
  }

  const categories = value('Categories')
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c && !NOISE.test(c))
    .slice(0, 6);

  return {
    id: `commons:${page.pageid}`,
    kind: 'media',
    mediaType,
    mime: info.mime,
    title,
    extract: description,
    image: info.thumburl,
    mediaUrl: mediaType === 'video' ? info.url : null,
    url: info.descriptionurl,
    credit: {
      artist: clip(stripHtml(value('Artist')), 80),
      license: stripHtml(value('LicenseShortName')),
      licenseUrl: stripHtml(value('LicenseUrl')),
    },
    categories,
    seedTitle: categories[0] ?? null,
  };
}

async function call(params) {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`Commons API error ${res.status}`);
  return res.json();
}

const pagesOf = (data) => data?.query?.pages ?? [];

async function run(search, limit, offset) {
  const data = await call({
    ...INFO_PARAMS,
    generator: 'search',
    gsrnamespace: '6', // the File: namespace
    gsrsearch: search,
    gsrlimit: String(limit),
    gsroffset: String(offset),
  });
  return { pages: pagesOf(data), next: data?.continue?.gsroffset ?? null };
}

const byIndex = (pages) => [...pages].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

const cleanTerm = (s) => String(s).replace(/"/g, '');

async function fetchMedia({ video, topic, n }) {
  const filter = video ? 'filetype:video' : 'filetype:bitmap';
  const search = topic
    ? `"${cleanTerm(topic)}" ${filter}`
    : video
      ? FEATURED_VIDEOS
      : FEATURED_PICTURES;
  // Random starting point so every batch shows something different.
  const maxOffset = topic ? 30 : video ? 150 : 8000;
  const offset = Math.floor(Math.random() * maxOffset);

  const limit = Math.min(Math.max(n * 4, 12), 20); // over-fetch: many files get filtered out
  let { pages } = await run(search, limit, offset);
  if (pages.length === 0 && offset > 0) ({ pages } = await run(search, limit, 0));

  return byIndex(pages).map((p) => toMediaCard(p)).filter(Boolean);
}

export const fetchCommonsImages = (n, topic) => fetchMedia({ video: false, topic, n });
export const fetchCommonsVideos = (n, topic) => fetchMedia({ video: true, topic, n });

/** One page of images or videos in a Commons category (a card's tag). `next` is the following offset, or null. */
export async function fetchCommonsCategory({ video, category, n, offset = 0 }) {
  const filter = video ? 'filetype:video' : 'filetype:bitmap';
  const { pages, next } = await run(`incategory:"${cleanTerm(category)}" ${filter}`, Math.min(n, 20), offset);
  return { cards: byIndex(pages).map((p) => toMediaCard(p)).filter(Boolean), next };
}

// ---------- nearby ----------

const nearbyCache = new Map(); // 'lat|lon' -> Promise<{ pageid, dist }[]>, nearest first

/** Geotagged files within 10 km (the API's maximum radius), nearest first. Cached per location. */
function nearbyIndex(coords) {
  const key = `${coords.lat.toFixed(3)}|${coords.lon.toFixed(3)}`;
  if (!nearbyCache.has(key)) {
    const request = call({
      ...COMMON,
      list: 'geosearch',
      gscoord: `${coords.lat}|${coords.lon}`,
      gsradius: '10000',
      gslimit: '100',
      gsnamespace: '6',
    }).then((data) => data?.query?.geosearch ?? []);
    request.catch(() => nearbyCache.delete(key));
    nearbyCache.set(key, request);
  }
  return nearbyCache.get(key);
}

/** A page of photos and videos taken near `coords`, nearest first. */
export async function fetchCommonsNearby(coords, n, offset = 0) {
  const index = await nearbyIndex(coords);
  const slice = index.slice(offset, offset + Math.min(n, 20));
  const end = offset + slice.length;
  const next = end < index.length ? end : null;
  if (slice.length === 0) return { cards: [], next };

  const data = await call({ ...INFO_PARAMS, pageids: slice.map((e) => e.pageid).join('|') });
  const order = new Map(slice.map((e, i) => [e.pageid, { i, dist: e.dist }]));
  const cards = pagesOf(data)
    .filter((p) => order.has(p.pageid))
    .sort((a, b) => order.get(a.pageid).i - order.get(b.pageid).i)
    .map((p) => {
      const card = toMediaCard(p, { titleFallback: true });
      return card && { ...card, distanceM: order.get(p.pageid).dist };
    })
    .filter(Boolean);
  return { cards, next };
}

/** Full cards for saved Commons files, by card id ("commons:123"). Missing or unsuitable files are left out of the result. */
export async function fetchCommonsByIds(ids) {
  const pageIds = ids.map((id) => String(id).replace(/^commons:/, ''));
  const data = await call({ ...INFO_PARAMS, pageids: pageIds.join('|') });
  const found = new Map();
  for (const page of pagesOf(data)) {
    if (page.missing || page.invalid) continue;
    const card = toMediaCard(page, { titleFallback: true });
    if (card) found.set(card.id, card);
  }
  return found;
}

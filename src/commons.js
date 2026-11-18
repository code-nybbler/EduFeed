// Images and videos from Wikimedia Commons, via its search API (CORS-enabled
// with `origin=*`). Exploration uses Commons' curated collections; topical
// requests search by a topic the user has shown interest in.

const API = 'https://commons.wikimedia.org/w/api.php';

const FEATURED_PICTURES = 'incategory:"Featured pictures on Wikimedia Commons"';
// "Featured media" is mostly videos (.webm/.ogv) plus some audio; filetype:video narrows it.
const FEATURED_VIDEOS = 'incategory:"Featured media" filetype:video';

const PARAMS = {
  action: 'query',
  format: 'json',
  formatversion: '2',
  origin: '*',
  generator: 'search',
  gsrnamespace: '6', // the File: namespace
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

export function toMediaCard(page) {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl) return null;

  const mediaType =
    info.mediatype === 'VIDEO' ? 'video' : info.mediatype === 'BITMAP' || info.mediatype === 'DRAWING' ? 'image' : null;
  if (!mediaType) return null; // audio, PDFs, 3D models, etc. don't suit the feed
  if (mediaType === 'image' && (info.width ?? 0) < 600) return null;

  const meta = info.extmetadata ?? {};
  const value = (key) => meta[key]?.value ?? '';

  const description = clip(stripHtml(value('ImageDescription')).replace(/^English\s*:\s*/i, ''), 420);
  if (description.length < 25) return null; // a bare filename makes a dull card

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
    title: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
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

async function run(search, limit, offset) {
  const params = new URLSearchParams({
    ...PARAMS,
    gsrsearch: search,
    gsrlimit: String(limit),
    gsroffset: String(offset),
  });
  const res = await fetch(`${API}?${params}`);
  if (!res.ok) throw new Error(`Commons API error ${res.status}`);
  const data = await res.json();
  return data?.query?.pages ?? [];
}

async function fetchMedia({ video, topic, n }) {
  const filter = video ? 'filetype:video' : 'filetype:bitmap';
  const search = topic
    ? `"${topic.replace(/"/g, '')}" ${filter}`
    : video
      ? FEATURED_VIDEOS
      : FEATURED_PICTURES;
  // Random starting point so every batch shows something different.
  const maxOffset = topic ? 30 : video ? 150 : 8000;
  const offset = Math.floor(Math.random() * maxOffset);

  const limit = Math.min(Math.max(n * 4, 12), 20); // over-fetch: many files get filtered out
  let pages = await run(search, limit, offset);
  if (pages.length === 0 && offset > 0) pages = await run(search, limit, 0);

  return [...pages]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(toMediaCard)
    .filter(Boolean);
}

export const fetchCommonsImages = (n, topic) => fetchMedia({ video: false, topic, n });
export const fetchCommonsVideos = (n, topic) => fetchMedia({ video: true, topic, n });

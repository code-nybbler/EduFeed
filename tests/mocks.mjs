// Shared mock of the Wikipedia + Commons + On This Day APIs.
export const log = [];
export const state = { fail: false };

const long = (t) => `${t} is a sufficiently long introductory paragraph about the subject. `.repeat(3);
export const wpPage = (id, title, { image = true, cats = ['Ancient Rome'], index } = {}) => ({
  pageid: id, title, index, fullurl: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`,
  extract: long(title), thumbnail: image ? { source: `https://upload.wikimedia.org/${id}.jpg` } : undefined,
  categories: cats.map((c) => ({ title: `Category:${c}` })),
});
export const cmPage = (id, title, { video = false, index } = {}) => ({
  pageid: id, title: `File:${title}`, index,
  imageinfo: [{ thumburl: `https://upload.wikimedia.org/t${id}.jpg`, url: `https://upload.wikimedia.org/f${id}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`,
    mime: video ? 'video/webm' : 'image/jpeg', mediatype: video ? 'VIDEO' : 'BITMAP', width: 1200,
    extmetadata: { ImageDescription: { value: long(title) }, Artist: { value: 'Someone' }, LicenseShortName: { value: 'CC BY 4.0' }, LicenseUrl: { value: 'https://x/y' }, Categories: { value: 'Ancient Rome|Roman Forum' } } }],
});

// 14 articles carry the tag "Ancient Rome"; 7 Commons images and 2 videos too.
const TAGGED = Array.from({ length: 14 }, (_, i) => wpPage(100 + i, `Rome article ${i}`));
const TAG_IMGS = Array.from({ length: 7 }, (_, i) => cmPage(300 + i, `Rome image ${i}.jpg`));
const TAG_VIDS = Array.from({ length: 2 }, (_, i) => cmPage(400 + i, `Rome video ${i}.webm`, { video: true }));
const NEAR_N = 25, NEAR_FILES = 15;

const slicePage = (list, offset, limit) => {
  const pages = list.slice(offset, offset + limit).map((p, i) => ({ ...p, index: i + 1 }));
  const end = offset + limit;
  return { query: { pages }, ...(end < list.length ? { continue: { gsroffset: end, continue: 'gsroffset||' } } : {}) };
};

export function install() {
  globalThis.fetch = async (url) => {
    const u = new URL(url); const q = u.searchParams; log.push(u);
    const json = (obj) => ({ ok: !state.fail, status: state.fail ? 503 : 200, json: async () => obj });
    if (state.fail) return json({});

    if (u.pathname.includes('/feed/onthisday/')) {
      return json({ selected: [{ year: 1969, text: 'Humans land on the Moon in a historic first for exploration.', pages: [{ title: 'Apollo_11', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Apollo_11' } } }] }],
        events: [], births: [], deaths: [] });
    }

    if (u.host === 'commons.wikimedia.org') {
      if (q.get('list') === 'geosearch') {
        return json({ query: { geosearch: Array.from({ length: NEAR_FILES }, (_, i) => ({ pageid: 5000 + i, dist: 50 * (i + 1) })) } });
      }
      if (q.get('pageids')) {
        const ids = q.get('pageids').split('|').map(Number);
        return json({ query: { pages: ids.map((id) => (id >= 9e6 ? { pageid: id, missing: true } : cmPage(id, `Local photo ${id}.jpg`, { video: id % 5 === 0 }))) } });
      }
      const s = q.get('gsrsearch'); const off = Number(q.get('gsroffset') ?? 0); const lim = Number(q.get('gsrlimit'));
      if (s.startsWith('incategory:"Ancient Rome"')) {
        return json(slicePage(s.includes('filetype:video') ? TAG_VIDS : TAG_IMGS, off, lim));
      }
      const generic = [cmPage(600 + off, `Generic image ${off}.jpg`), cmPage(700 + off, `Generic video ${off}.webm`, { video: true })];
      return json({ query: { pages: generic.map((p, i) => ({ ...p, index: i + 1 })) } });
    }

    // en.wikipedia.org
    if (q.get('list') === 'geosearch') {
      return json({ query: { geosearch: Array.from({ length: NEAR_N }, (_, i) => ({ pageid: 1000 + i, title: `Place ${i}`, dist: 100 * (i + 1) })) } });
    }
    if (q.get('pageids')) {
      const ids = q.get('pageids').split('|').map(Number);
      return json({ query: { pages: [...ids].reverse().map((id) => (id >= 9e6 ? { pageid: id, missing: true } : wpPage(id, `Place ${id - 1000}`, { cats: ['Landmarks'] }))) } }); // reversed: code must re-sort. Ids from 9,000,000 up are deleted pages
    }
    if (q.get('generator') === 'random') {
      return json({ query: { pages: Array.from({ length: 8 }, (_, i) => wpPage(2000 + Math.floor(Math.random() * 1e6), `Random ${i}`, { image: i % 2 === 0, cats: ['Misc'] })) } });
    }
    if (q.get('generator') === 'search') {
      const s = q.get('gsrsearch'); const off = Number(q.get('gsroffset') ?? 0); const lim = Number(q.get('gsrlimit'));
      if (s === 'incategory:"Ancient Rome"') return json(slicePage(TAGGED, off, lim));
      if (s.startsWith('incategory:')) return json({ batchcomplete: true });
      if (s.startsWith('articletopic:')) {
        return json({ query: { pages: Array.from({ length: 6 }, (_, i) => wpPage(3000 + off + i, `${s.slice(13)} topic ${off}-${i}`, { cats: [s.slice(13)] })) } });
      }
      return json({ query: { pages: [wpPage(4000 + off, `Similar to ${s.slice(9)}`, { cats: ['Related'] })] } });
    }
    return json({ query: { pages: [] } });
  };
}
export const TAG_ARTICLE_COUNT = TAGGED.length;

// End-to-end test: runs the real app in a simulated browser (jsdom) with a mocked
// network, and clicks through the feed, categories, tags, collections, streak and
// nearby posts. Run with `npm test`.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const scratch = new URL('./', import.meta.url).href;
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- vite (loads the app's JSX) must start before the fake browser globals exist ----
const { createServer } = await import('vite');
const server = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' });

// ---- fake browser ----
const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.org/', pretendToBeVisual: true });
const { window } = dom;
globalThis.window = window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
for (const k of ['localStorage', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle']) globalThis[k] = window[k];
window.scrollTo = () => {};
window.confirm = () => true;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const io = { budget: 0 }; // how many more times the infinite-scroll sentinel may "scroll into view"
class FakeIO {
  constructor(cb, opts = {}) { this.cb = cb; this.timers = []; this.sentinel = Boolean(opts.rootMargin); }
  observe(el) {
    if (this.sentinel) { if (io.budget <= 0) return; io.budget--; }
    this.timers.push(setTimeout(() => this.cb([{ isIntersecting: true, target: el }]), 0));
  }
  unobserve() {} takeRecords() { return []; }
  disconnect() { this.timers.forEach(clearTimeout); this.timers = []; }
}
window.IntersectionObserver = FakeIO; globalThis.IntersectionObserver = FakeIO;
let geoMode = 'grant'; let geoCalls = 0;
Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition: (ok, bad) => (geoCalls++, geoMode === 'grant') ? ok({ coords: { latitude: 42.9012, longitude: -73.9456 } }) : bad({ code: 1 }) } });

const errors = [];
const origError = console.error; console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); };

const mocks = await import(scratch + 'mocks.mjs'); mocks.install(); const { log } = mocks;
const req = createRequire(root + '/package.json');
const React = req('react'); const { createRoot } = req('react-dom/client'); const { act } = React;
const App = (await server.ssrLoadModule('/src/App.jsx')).default;

// ---- helpers ----
const $$ = (sel) => [...document.querySelectorAll(sel)];
const $ = (sel) => document.querySelector(sel);
const txt = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const flush = (ms = 150) => act(async () => { await sleep(ms); });
const until = async (pred, max = 30) => { for (let i = 0; i < max; i++) { if (pred()) return true; await flush(80); } return pred(); };
const click = (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); await sleep(0); });
const button = (label, scope = document) => [...scope.querySelectorAll('button')].find((b) => txt(b).includes(label));
const typeInto = (input, value) => act(async () => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
});
const submit = (form) => act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await sleep(0); });
const stored = () => JSON.parse(window.localStorage.getItem('learnfeed:v1') ?? '{}');
const activeCat = () => $$('.cat.active').map(txt);

let root1 = createRoot(document.getElementById('root'));
io.budget = 1;
await act(async () => { root1.render(React.createElement(App, { syncAdapter: null })); });
await flush(300);

// ---------- 1. first load ----------
const { topLevelCategories } = await server.ssrLoadModule('/src/filters.js');
check('one main-row button per top-level category, plus For you and Near me', $$('.cat').length === topLevelCategories().length + 2, `${$$('.cat').length} vs ${topLevelCategories().length + 2}`);
check('no second row until a category with sub-categories is chosen', $$('.subcat').length === 0);
check('brand is EduFeed', txt($('.brand')) === 'EduFeed', txt($('.brand')));
check('"For you" highlighted by default', eq(activeCat(), ['For you']));
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
const cards = $$('.card');
check('first batch has 10 cards', cards.length === 10, String(cards.length));
check('mixed kinds: 1 On this day, 2 Commons media', $$('.card-otd').length === 1 && $$('.card-media').length === 2);
const articles = $$('.card-article');
check('media-first: every article that has a picture made the batch (4 of 4)', articles.filter((a) => a.querySelector('img.card-image')).length === 4 && articles.length === 7, `${articles.filter((a) => a.querySelector('img.card-image')).length}/${articles.length}`);
check('streak badge starts at 0/5', txt($('.streak')).includes('0/5'), txt($('.streak')));
check('header holds the category bar (fixed nav)', Boolean($('.header .catbar')));

// ---------- 2. streak ----------
await flush(1600);
check('reading 5+ cards completes the day: badge shows done + 1-day streak', $('.streak.done') && $('.streak').getAttribute('aria-label').startsWith('1-day streak'), $('.streak')?.getAttribute('aria-label'));
check('streak persisted', stored().streak.current === 1 && stored().streak.todayCount >= 5);

// ---------- 3. like + collect ----------
const firstArticle = $('.card-article');
await click(button('Like', firstArticle));
check('like toggles', button('Liked', firstArticle)?.getAttribute('aria-pressed') === 'true');
await click(button('Collect', firstArticle));
check('picker opens with empty hint', Boolean(firstArticle.querySelector('.picker-panel')) && txt(firstArticle).includes('No collections yet'));
await typeInto(firstArticle.querySelector('.picker-new input'), 'Rome stuff');
await submit(firstArticle.querySelector('.picker-new'));
const prof = stored(); const colId = Object.keys(prof.collections)[0];
check('collection created with the card, card auto-saved', prof.collections[colId]?.name === 'Rome stuff' && prof.collections[colId].cardIds.length === 1 && prof.saved.length === 1 && !('extract' in prof.saved[0]) && !('image' in prof.saved[0]), JSON.stringify(prof.saved));
check('button now says "In 1" and Save shows saved', txt(firstArticle).includes('In 1') && txt(firstArticle).includes('★ Saved'));
// second collection via the picker, then tick/untick
await typeInto(firstArticle.querySelector('.picker-new input'), 'Second');
await submit(firstArticle.querySelector('.picker-new'));
check('card in two collections', txt(firstArticle).includes('In 2'));
await act(async () => { firstArticle.querySelectorAll('.picker-row input')[1].click(); });
check('unticking removes it from that collection only', txt(firstArticle).includes('In 1'));

// ---------- 4. Saved tab + collection management ----------
log.length = 0;
await click(button('Saved (1)'));
check('Saved tab shows a post saved this session without fetching it again', !log.some((u) => u.searchParams.get('pageids')));
check('Saved view shows pills: All saved, both collections, + New', eq($$('.pill').map(txt), ['All saved (1)', 'Rome stuff (1)', 'Second (0)', '＋ New collection']), JSON.stringify($$('.pill').map(txt)));
await click(button('Second (0)'));
check('empty collection message', txt($('.status')).includes('This collection is empty'));
await click(button('Rename'));
await typeInto($('.collection-form input'), 'Renamed');
await submit($('.collection-form'));
check('rename', Boolean(button('Renamed (0)')));
await click(button('＋ New collection'));
await typeInto($('.collection-form input'), 'Brand new');
await submit($('.collection-form'));
check('create from bar selects the new collection', Boolean($('.pill.active')) && txt($('.pill.active')).startsWith('Brand new'));
await click(button('Delete collection'));
check('delete collection (cards stay saved)', !button('Brand new') && txt($('.pill.active')).startsWith('All saved') && stored().saved.length === 1);
await click(button('Rome stuff'));
check('collection view shows its card', $$('main > .feed .card').length === 1, String($$('main > .feed .card').length));
// unsaving a card from Saved removes it from collections
await click(button('Saved', $('main > .feed .card')));
check('unsaving empties collections', $$('main > .feed .card').length === 0 && stored().collections[colId].cardIds.length === 0);
await click(button('Feed'));

// ---------- 5. clicking a tag ----------
io.budget = 8; log.length = 0;
const romeChip = $$('.chip').find((c) => txt(c) === 'Ancient Rome');
check('Commons cards carry clickable tag buttons', Boolean(romeChip));
await click(romeChip);
await until(() => txt($('.status')).includes('every post'));
check('tag banner shown, no category highlighted', txt($('.banner')).includes('Posts tagged Ancient Rome') && activeCat().length === 0, txt($('.banner')));
const q = log.map((u) => u.searchParams.get('gsrsearch')).filter(Boolean);
check('searched both Wikipedia and Commons by that category', q.includes('incategory:"Ancient Rome"') && q.includes('incategory:"Ancient Rome" filetype:bitmap') && q.includes('incategory:"Ancient Rome" filetype:video'), q.join(' | '));
const tagCards = $$('main > div > .feed .card');
const titles = tagCards.map((c) => txt(c.querySelector('.card-title')));
check('every tagged post shown exactly once (14 articles + 7 images + 2 videos)', tagCards.length === 23 && new Set(titles).size === 23, `${tagCards.length} cards, ${new Set(titles).size} unique`);
check('end-of-feed message', txt($('.status')).includes('every post we found tagged "Ancient Rome"'), txt($('.status')));
await click(button('Back to For you'));
check('back to For you', eq(activeCat(), ['For you']) && !$('.banner'));

// ---------- 6. category buttons ----------
io.budget = 1; log.length = 0;
await click(button('History', $('.catbar')));
await flush(400);
check('History highlighted, feed switched', eq(activeCat(), ['History']));
check('History used an articletopic search', log.some((u) => /^articletopic:(history|military-and-warfare)$/.test(u.searchParams.get('gsrsearch') ?? '')));
check('History feed includes an On this day card', $$('.card-otd').length === 1);
io.budget = 1;
await click(button('Science', $('.catbar')));
await flush(400);
check('Science: no On this day, topic cards present', eq(activeCat(), ['Science']) && $$('.card-otd').length === 0 && $$('.card-article').length > 0);

// ---------- 6b. regions: a second row under World ----------
io.budget = 1; log.length = 0;
await click(button('World', $('.catbar')));
await flush(400);
check('World highlighted; its row of regions appears', eq(activeCat(), ['World']) && eq($$('.subcat').map(txt), ['Worldwide', 'Africa', 'Asia', 'Europe', 'Americas', 'Oceania']), JSON.stringify($$('.subcat').map(txt)));
check('"Worldwide" is selected in the second row', eq($$('.subcat.active').map(txt), ['Worldwide']));
check('the main row has no region buttons', !$$('.cat').some((b) => ['Africa', 'Asia', 'Europe', 'Americas', 'Oceania'].includes(txt(b))));
io.budget = 1; log.length = 0;
await click($$('.subcat').find((b) => txt(b) === 'Asia'));
await flush(400);
check('picking a region keeps World highlighted and marks the region', eq(activeCat(), ['World']) && eq($$('.subcat.active').map(txt), ['Asia']));
const asiaTopics = ['asia', 'central-asia', 'east-asia', 'north-asia', 'south-asia', 'southeast-asia', 'west-asia'];
const topicSearches = log.map((u) => u.searchParams.get('gsrsearch') ?? '').filter((q) => q.startsWith('articletopic:'));
check("the region's feed searches that region's topics", topicSearches.length > 0 && topicSearches.every((q) => asiaTopics.includes(q.slice(13))), topicSearches.join());
await click(button('Health', $('.catbar')));
await flush(300);
check('leaving World hides the region row', $$('.subcat').length === 0 && eq(activeCat(), ['Health']));

// ---------- 6c. the other groups work the same way ----------
const searchesSince = () => log.map((u) => u.searchParams.get('gsrsearch') ?? '').filter((q) => q.startsWith('articletopic:'));
io.budget = 1; log.length = 0;
await click(button('Arts', $('.catbar')));
await flush(400);
check('Arts opens its own row of sub-categories', eq(activeCat(), ['Arts']) && eq($$('.subcat').map(txt), ['All Arts', 'Visual arts', 'Music', 'Stage', 'Architecture', 'Fashion', 'Books']), JSON.stringify($$('.subcat').map(txt)));
const artsTopics = ['visual-arts', 'music', 'performing-arts', 'architecture', 'fashion', 'books', 'literature'];
check('"All Arts" draws from every kind of art', searchesSince().length > 0 && searchesSince().every((q) => artsTopics.includes(q.slice(13))), searchesSince().join());
io.budget = 1; log.length = 0;
await click($$('.subcat').find((b) => txt(b) === 'Music'));
await flush(400);
check('a sub-category searches only its own topic; the parent stays highlighted', eq(activeCat(), ['Arts']) && eq($$('.subcat.active').map(txt), ['Music']) && searchesSince().length > 0 && searchesSince().every((q) => q === 'articletopic:music'), searchesSince().join());
await click(button('Entertainment', $('.catbar')));
await flush(300);
check('switching groups swaps the second row', eq($$('.subcat').map(txt), ['All Entertainment', 'Film & TV', 'Games', 'Comics & anime', 'Internet', 'Media']), JSON.stringify($$('.subcat').map(txt)));
await click(button('Health', $('.catbar')));
await flush(200);

// ---------- 7. Near me ----------
io.budget = 6; log.length = 0; geoMode = 'grant';
await click(button('Near me', $('.catbar')));
await until(() => txt($('.status')).includes('everything within 10 km'));
check('Near me highlighted after permission', eq(activeCat(), ['📍 Near me']), JSON.stringify(activeCat()));
check('nearby banner + opt-in checkbox', txt($('.banner')).includes('within 10 km') && Boolean($('.banner input[type=checkbox]')));
const geoReqs = log.filter((u) => u.searchParams.get('list') === 'geosearch');
check('geosearch on Wikipedia and Commons, coordinates rounded to ~110 m', geoReqs.length === 2 && geoReqs.every((u) => u.searchParams.get('gscoord') === '42.901|-73.946'), geoReqs.map((u) => u.searchParams.get('gscoord')).join());
const nearCards = $$('main > div > .feed .card');
check('nearest place first, with a distance label', txt(nearCards[0].querySelector('.card-title')) === 'Place 0' && /📍 \d+ ft away/.test(txt(nearCards[0])), txt(nearCards[0]).slice(0, 80));
check('everything nearby shown once (25 articles + 15 photos)', nearCards.length === 40 && new Set(nearCards.map((c) => txt(c.querySelector('.card-title')))).size === 40, String(nearCards.length));
check('nearby end message', txt($('.status')).includes("everything within 10 km"));
await act(async () => { $('.banner input[type=checkbox]').click(); });
check('opt-in to mix nearby into For you is saved', stored().settings.nearby === true);

// ---------- 8. reload keeps everything ----------
await act(async () => { root1.unmount(); });
root1 = createRoot(document.getElementById('root'));
io.budget = 0;
await act(async () => { root1.render(React.createElement(App, { syncAdapter: null })); });
await flush(200);
check('after reload: streak badge still done', Boolean($('.streak.done')));
check('after reload: collections, saved count and settings kept', Boolean(button('Saved (0)')) && Object.keys(stored().collections).length === 2 && stored().settings.nearby === true, JSON.stringify(Object.values(stored().collections).map((c) => c.name)));

// ---------- 8b. opted-in user in a fresh session ----------
const setPermission = (state) => Object.defineProperty(window.navigator, 'permissions', { configurable: true, value: { query: async () => ({ state }) } });
await act(async () => { root1.unmount(); });
window.localStorage.clear();
window.localStorage.setItem('learnfeed:v1', JSON.stringify({ settings: { nearby: true } }));
setPermission('prompt'); geoCalls = 0; io.budget = 2;
root1 = createRoot(document.getElementById('root'));
await act(async () => { root1.render(React.createElement(App, { syncAdapter: null })); });
await flush(400);
check('permission not yet granted: no location prompt on load', geoCalls === 0, String(geoCalls));
await act(async () => { root1.unmount(); });
setPermission('granted'); geoCalls = 0; io.budget = 4;
root1 = createRoot(document.getElementById('root'));
await act(async () => { root1.render(React.createElement(App, { syncAdapter: null })); });
await until(() => $$('.kicker').some((k) => k.textContent.includes('📍')), 40);
check('permission already granted: location restored silently', geoCalls === 1, String(geoCalls));
check('opted-in user sees nearby places mixed into For you', $$('.kicker').some((k) => k.textContent.includes('📍')), $$('.kicker').map(txt).join(' / '));

// ---------- 8c. saved posts come back from their ids ----------
const resetApp = async (profileJson, props = { syncAdapter: null }) => {
  await act(async () => { root1.unmount(); });
  window.localStorage.clear();
  if (profileJson) window.localStorage.setItem('learnfeed:v1', JSON.stringify(profileJson));
  io.budget = 0; log.length = 0;
  root1 = createRoot(document.getElementById('root'));
  await act(async () => { root1.render(React.createElement(App, props)); });
  await flush(200);
};
const moon = { id: 'otd:event:1969:abc', kind: 'otd', section: 'event', year: 1969, yearLabel: '1969', yearsAgo: 57, dateLabel: 'July 20', title: '1969', extract: 'Humans land on the Moon.', related: [], categories: [] };
await resetApp({ saved: [
  { id: 1201, kind: 'article', title: 'Saved article', at: 1 },
  { id: 'commons:5002', kind: 'media', title: 'Saved picture', at: 2 },
  { id: moon.id, kind: 'otd', title: '1969', at: 3, snapshot: moon },
  { id: 9000009, kind: 'article', title: 'Deleted page', at: 4 },
] });
check('nothing is fetched until the Saved tab is opened', !log.some((u) => u.searchParams.get('pageids')));
await click(button('Saved (4)'));
await until(() => $$('main > .feed .card').length === 4 && !txt($('main > .feed')).includes('Loading…'));
const byIdReqs = log.filter((u) => u.searchParams.get('pageids'));
const wpReq = byIdReqs.filter((u) => u.host === 'en.wikipedia.org');
const cmReq = byIdReqs.filter((u) => u.host === 'commons.wikimedia.org');
check('one batched request per site', wpReq.length === 1 && cmReq.length === 1 && wpReq[0].searchParams.get('pageids').split('|').sort().join() === '1201,9000009' && cmReq[0].searchParams.get('pageids') === '5002', byIdReqs.map((u) => u.searchParams.get('pageids')).join(' / '));
const savedText = txt($('main > .feed'));
check('article, picture and "On this day" post are all restored', savedText.includes('Place 201') && savedText.includes('Local photo 5002') && savedText.includes('Humans land on the Moon.'));
check('a deleted page shows a clear placeholder, with a link out', $$('.card-stub').length === 1 && txt($('.card-stub')).includes('Deleted page') && txt($('.card-stub')).includes('no longer available') && Boolean($('.card-stub a[href*="curid=9000009"]')));
await click(button('★ Saved', $('.card-stub')));
check('removing the placeholder unsaves it', stored().saved.length === 3 && $$('.card-stub').length === 0, String(stored().saved.length));

await resetApp({ saved: [{ id: 1301, kind: 'article', title: 'Offline article', at: 1 }] });
mocks.state.fail = true;
await click(button('Saved (1)'));
await until(() => Boolean($('.notice')));
check('offline: the post stays saved, shown as not loaded, with a retry', txt($('.card-stub')).includes("Couldn't load") && txt($('.notice')).includes("couldn't be loaded") && stored().saved.length === 1);
mocks.state.fail = false;
await click(button('Try again', $('.notice')));
await until(() => $$('main > .feed .card-stub').length === 0);
check('retry brings the card back', txt($('main > .feed')).includes('Place 301') && !$('.notice'));

await resetApp({ likes: {}, seen: [1401], weights: {}, saved: { 1401: { id: 1401, kind: 'article', title: 'Old full card', extract: 'old text '.repeat(40), image: null, url: 'https://x', categories: ['Old'] } } });
check('old-format saves are converted to records on first load', Array.isArray(stored().saved) && stored().saved.length === 1 && stored().saved[0].id === 1401 && !('extract' in stored().saved[0]), JSON.stringify(stored().saved));
await click(button('Saved (1)'));
await until(() => $$('main > .feed .card').length === 1 && !txt($('main > .feed')).includes('Loading…'));
check('and they still appear in Saved (fetched by id)', txt($('main > .feed')).includes('Place 401'));

// ---------- 8d. cloud sync ----------
check('sync off: no sync icon', !$('.sync'));
const fakeCloud = () => {
  const c = { docs: new Map(), writes: [], reads: 0 };
  c.signIn = async () => 'u1';
  c.load = async (uid) => { c.reads++; return c.docs.get(uid) ?? null; };
  c.save = async (uid, json, rev) => { const cur = c.docs.get(uid)?.rev ?? 0; if (cur !== rev) return { ok: false }; c.docs.set(uid, { json, rev: cur + 1 }); c.writes.push(json); return { ok: true, rev: cur + 1 }; };
  return c;
};
const cloud = fakeCloud();
cloud.docs.set('u1', { rev: 4, json: JSON.stringify({ saved: [{ id: 1201, kind: 'article', title: 'From the cloud', at: 5 }], collections: {}, likes: {}, weights: {}, seen: [], streak: {}, settings: {} }) });
await resetApp(null, { syncAdapter: cloud, syncDebounceMs: 50 });
await until(() => Boolean(button('Saved (1)')));
check('a profile that lives in the cloud appears on a fresh device', Boolean(button('Saved (1)')) && stored().saved[0].id === 1201 && cloud.writes.length === 0);
check('the header shows it is synced', $('.sync')?.classList.contains('sync-synced') && $('.sync').getAttribute('aria-label').includes('Saved to your account'), $('.sync')?.className);
await click(button('Saved (1)'));
await click(button('＋ New collection'));
await typeInto($('.collection-form input'), 'Synced collection');
await submit($('.collection-form'));
check('a change is not uploaded the instant it is made', cloud.writes.length === 0 && stored().collections && Object.keys(stored().collections).length === 1);
await until(() => cloud.writes.length === 1);
const uploaded = JSON.parse(cloud.writes[0]);
check('...it is uploaded after a quiet moment, with everything in it', cloud.writes.length === 1 && Object.values(uploaded.collections).some((c) => c.name === 'Synced collection') && uploaded.saved.length === 1);
check('sync bookkeeping is stored on the device', JSON.parse(window.localStorage.getItem('learnfeed:sync:v1')).rev === 5 && JSON.parse(window.localStorage.getItem('learnfeed:sync:v1')).dirty === false);

const broken = { async signIn() { throw Object.assign(new Error('nope'), { code: 'auth/operation-not-allowed' }); }, async load() { return null; }, async save() { return { ok: false }; } };
await resetApp({ saved: [{ id: 1301, kind: 'article', title: 'Local only', at: 1 }] }, { syncAdapter: broken });
await until(() => Boolean($('.sync-error')));
check('a sync problem shows a warning with its code, and the app keeps working', $('.sync-error').getAttribute('title').includes('auth/operation-not-allowed') && $('.sync-error').getAttribute('title').includes('still saved on this device') && Boolean(button('Saved (1)')));

// ---------- 8e. Google sign-in ----------
check('an adapter without sign-in shows no sign-in button', !$('.signin') && !$('.avatar'));
const fakeAccounts = () => {
  const c = fakeCloud();
  c.n = 0; c.user = null; c.listeners = new Set(); c.mode = 'link'; c.failSave = false; c.signedOut = 0;
  const google = { uid: 'g1', isAnonymous: false, name: 'Ada Lovelace', email: 'ada@example.com', photo: '' };
  const set = (u) => { c.user = u; c.listeners.forEach((f) => f(u)); };
  c.signIn = async () => { if (!c.user) set({ uid: `anon-${++c.n}`, isAnonymous: true, name: '', email: '', photo: '' }); return c.user.uid; };
  const save = c.save;
  c.save = async (...a) => { if (c.failSave) throw Object.assign(new Error('offline'), { code: 'unavailable' }); return save(...a); };
  c.getUser = () => c.user;
  c.onUser = (cb) => { c.listeners.add(cb); cb(c.user); return () => c.listeners.delete(cb); };
  c.signInWithGoogle = async () => {
    if (c.mode === 'cancel') throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' });
    if (c.mode === 'blocked') throw Object.assign(new Error('blocked'), { code: 'auth/popup-blocked' });
    if (c.mode === 'link') set({ ...google, uid: c.user.uid });
    else set(google); // an account that already exists
  };
  c.signOut = async () => { c.signedOut++; set(null); };
  return c;
};
const acc = fakeAccounts();
await resetApp({ saved: [{ id: 1201, kind: 'article', title: 'Mine', at: 1 }] }, { syncAdapter: acc, syncDebounceMs: 50 });
await until(() => Boolean($('.signin')));
check('signed out (anonymous): a "Sign in" button is shown', Boolean($('.signin')) && !$('.avatar'));

acc.mode = 'cancel';
await click($('.signin')); await flush(100);
check('closing the Google window is silent: no notice, still signed out', !$('.notice') && Boolean($('.signin')));

acc.mode = 'blocked';
await click($('.signin')); await until(() => Boolean($('.notice')));
check('a blocked pop-up explains itself', txt($('.notice')).includes('pop-up'), txt($('.notice')));
await click(button('Dismiss', $('.notice')));
check('...and the message can be dismissed', !$('.notice'));

acc.mode = 'link';
const anonUid = acc.user.uid;
await click($('.signin')); await until(() => Boolean($('.avatar')));
check('signing in keeps the same account and the data: avatar shown, button gone', acc.user.uid === anonUid && !$('.signin') && $('.avatar').getAttribute('aria-label').includes('ada@example.com') && Boolean(button('Saved (1)')), $('.avatar')?.getAttribute('aria-label'));
check('the first letter of the name is the avatar', txt($('.avatar')) === 'A');
await click($('.avatar'));
check('the avatar opens a panel with name, email and sign out', txt($('.account-panel')).includes('Ada Lovelace') && txt($('.account-panel')).includes('ada@example.com') && Boolean(button('Sign out', $('.account-panel'))));
await act(async () => { document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
check('Escape closes the panel', !$('.account-panel'));

// Sign out: refused while the latest changes can't be saved to the account.
await click(button('Saved (1)')); await click(button('＋ New collection'));
await typeInto($('.collection-form input'), 'Unsaved work'); await submit($('.collection-form'));
acc.failSave = true;
await click($('.avatar')); await click(button('Sign out', $('.account-panel')));
await until(() => Boolean($('.notice')));
check('sign-out is refused when the latest changes could not be saved', txt($('.notice')).includes("weren't signed out") && acc.signedOut === 0 && acc.user.uid === anonUid && Object.keys(stored().collections).length === 1, txt($('.notice')));
await click(button('Dismiss', $('.notice')));

acc.failSave = false;
await click($('.avatar')); await click(button('Sign out', $('.account-panel')));
await until(() => acc.signedOut === 1 && Boolean($('.signin')));
const savedInCloud = JSON.parse(acc.docs.get(anonUid).json);
check('sign-out first uploads the changes, then clears this device', Object.values(savedInCloud.collections).some((c) => c.name === 'Unsaved work') && savedInCloud.saved.length === 1);
check('...the device is empty and has a new anonymous account', Boolean(button('Saved (0)')) && acc.user.isAnonymous && acc.user.uid !== anonUid && stored().saved.length === 0, acc.user?.uid);
check('...and the old account document is left alone', acc.docs.get(anonUid) && JSON.parse(acc.docs.get(anonUid).json).saved.length === 1);

// Signing in to an account that already exists merges this device into it.
acc.docs.clear(); acc.docs.set('g1', { rev: 2, json: JSON.stringify({ saved: [{ id: 1301, kind: 'article', title: 'From my other device', at: 9 }], collections: {}, likes: {}, weights: {}, seen: [], streak: {}, settings: {} }) });
const acc2 = fakeAccounts(); acc2.docs = acc.docs; acc2.mode = 'existing';
await resetApp({ saved: [{ id: 1201, kind: 'article', title: 'Mine', at: 1 }] }, { syncAdapter: acc2, syncDebounceMs: 50 });
await until(() => Boolean($('.signin')));
await click($('.signin')); await until(() => Boolean($('.avatar')));
await until(() => Boolean(button('Saved (2)')));
check('signing in to an existing account merges this device with it', Boolean(button('Saved (2)')) && acc2.user.uid === 'g1' && stored().saved.map((r) => r.id).sort().join() === '1201,1301', stored().saved.map((r) => r.id).join());
await until(() => JSON.parse(acc.docs.get('g1').json).saved.length === 2);
check('...and the merged result is uploaded to that account', JSON.parse(acc.docs.get('g1').json).saved.length === 2);

// ---------- 9. location denied ----------
await act(async () => { root1.unmount(); });
window.localStorage.clear(); geoMode = 'deny';
root1 = createRoot(document.getElementById('root'));
await act(async () => { root1.render(React.createElement(App, { syncAdapter: null })); });
await flush(200);
await click(button('Near me', $('.catbar')));
await flush(100);
check('denied: explains how to allow it, stays on For you', txt($('.notice')).includes('blocked') && eq(activeCat(), ['For you']), txt($('.notice')));
await click(button('Dismiss'));
check('notice can be dismissed', !$('.notice'));

console.error = origError;
const real = errors.filter((e) => !/not wrapped in act|ReactDOMTestUtils/i.test(e));
check('no React errors or warnings during the whole run', real.length === 0, real.slice(0, 3).join(' || '));
await server.close();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);

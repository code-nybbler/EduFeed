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
await act(async () => { root1.render(React.createElement(App)); });
await flush(300);

// ---------- 1. first load ----------
check('12 category buttons (For you, Near me, 10 topics)', $$('.cat').length === 12, String($$('.cat').length));
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
check('collection created with the card, card auto-saved', prof.collections[colId]?.name === 'Rome stuff' && prof.collections[colId].cardIds.length === 1 && Object.keys(prof.saved).length === 1);
check('button now says "In 1" and Save shows saved', txt(firstArticle).includes('In 1') && txt(firstArticle).includes('★ Saved'));
// second collection via the picker, then tick/untick
await typeInto(firstArticle.querySelector('.picker-new input'), 'Second');
await submit(firstArticle.querySelector('.picker-new'));
check('card in two collections', txt(firstArticle).includes('In 2'));
await act(async () => { firstArticle.querySelectorAll('.picker-row input')[1].click(); });
check('unticking removes it from that collection only', txt(firstArticle).includes('In 1'));

// ---------- 4. Saved tab + collection management ----------
await click(button('Saved (1)'));
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
check('delete collection (cards stay saved)', !button('Brand new') && txt($('.pill.active')).startsWith('All saved') && Object.keys(stored().saved).length === 1);
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
await act(async () => { root1.render(React.createElement(App)); });
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
await act(async () => { root1.render(React.createElement(App)); });
await flush(400);
check('permission not yet granted: no location prompt on load', geoCalls === 0, String(geoCalls));
await act(async () => { root1.unmount(); });
setPermission('granted'); geoCalls = 0; io.budget = 4;
root1 = createRoot(document.getElementById('root'));
await act(async () => { root1.render(React.createElement(App)); });
await until(() => $$('.kicker').some((k) => k.textContent.includes('📍')), 40);
check('permission already granted: location restored silently', geoCalls === 1, String(geoCalls));
check('opted-in user sees nearby places mixed into For you', $$('.kicker').some((k) => k.textContent.includes('📍')), $$('.kicker').map(txt).join(' / '));

// ---------- 9. location denied ----------
await act(async () => { root1.unmount(); });
window.localStorage.clear(); geoMode = 'deny';
root1 = createRoot(document.getElementById('root'));
await act(async () => { root1.render(React.createElement(App)); });
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

// Logic and data-layer tests. No dependencies: run with `npm test`.
// The network is mocked (see mocks.mjs), so these never touch Wikipedia or Commons.
const src = new URL('../src/', import.meta.url).href;
const scratch = new URL('./', import.meta.url).href;
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const mocks = await import(scratch + 'mocks.mjs'); mocks.install();
const { log } = mocks;
const streak = await import(src + 'streak.js');
const prof = await import(src + 'profile.js');
const { formatDistance } = await import(src + 'format.js');
const filters = await import(src + 'filters.js');
const batch = await import(src + 'batch.js');
const wiki = await import(src + 'wiki.js');
const commons = await import(src + 'commons.js');
const sources = await import(src + 'sources.js');

// ---------- streak ----------
const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
let s = streak.emptyStreak();
for (let i = 0; i < 4; i++) s = streak.recordView(s, D(2026, 11, 10));
check('4 views: goal not reached', s.current === 0 && s.todayCount === 4);
check('status shows progress, no streak yet', streak.streakStatus(s, D(2026, 11, 10)).todayCount === 4 && streak.streakStatus(s, D(2026, 11, 10)).count === 0);
s = streak.recordView(s, D(2026, 11, 10));
check('5th view starts streak at 1', s.current === 1 && s.lastDay === '2026-11-10' && s.best === 1);
for (let i = 0; i < 20; i++) s = streak.recordView(s, D(2026, 11, 10));
check('extra views same day do not double count', s.current === 1);
for (let i = 0; i < 5; i++) s = streak.recordView(s, D(2026, 11, 11));
check('next day extends to 2', s.current === 2 && s.best === 2);
check('today done flag', streak.streakStatus(s, D(2026, 11, 11)).doneToday === true && streak.streakStatus(s, D(2026, 11, 11)).atRisk === false);
check('next morning: streak alive, at risk', (() => { const t = streak.streakStatus(s, D(2026, 11, 12, 8)); return t.count === 2 && t.atRisk && t.todayCount === 0; })());
check('two days later: streak shows 0', streak.streakStatus(s, D(2026, 11, 13)).count === 0);
for (let i = 0; i < 5; i++) s = streak.recordView(s, D(2026, 11, 13));
check('gap resets to 1, best kept', s.current === 1 && s.best === 2);
let y = streak.emptyStreak();
for (const day of [[2026, 12, 31], [2027, 1, 1]]) for (let i = 0; i < 5; i++) y = streak.recordView(y, D(...day));
check('year rollover counts as consecutive', y.current === 2);
let m = streak.emptyStreak();
for (const day of [[2026, 2, 28], [2026, 3, 1]]) for (let i = 0; i < 5; i++) m = streak.recordView(m, D(...day));
check('month rollover counts as consecutive', m.current === 2);
let dst = streak.emptyStreak();
for (const day of [[2026, 3, 7], [2026, 3, 8], [2026, 3, 9]]) for (let i = 0; i < 5; i++) dst = streak.recordView(dst, D(...day, 0));
check('across US DST change (Mar 8 2026) still consecutive', dst.current === 3, String(dst.current));

// ---------- collections ----------
const card = (id, cats = ['A']) => ({ id, kind: 'article', title: `T${id}`, extract: 'x', categories: cats, image: null });
let p = prof.emptyProfile();
check('blank name rejected', prof.createCollection(p, '   ').id === null);
let r = prof.createCollection(p, '  Rome  ', 'c1'); p = r.profile;
check('create trims', r.id === 'c1' && p.collections.c1.name === 'Rome');
check('duplicate name (any case) reuses', prof.createCollection(p, 'rOME').id === 'c1' && Object.keys(prof.createCollection(p, 'rOME').profile.collections).length === 1);
p = prof.addToCollection(p, 'c1', card(1, ['Rome']));
check('adding a card saves it too', p.saved[1] && eq(p.collections.c1.cardIds, [1]) && p.weights.Rome === 1);
p = prof.addToCollection(p, 'c1', card(1, ['Rome']));
check('adding twice does not duplicate', eq(p.collections.c1.cardIds, [1]));
p = prof.addToCollection(p, 'c1', card(2)); p = prof.addToCollection(p, 'c1', card(3));
check('collectionCards newest first', eq(prof.collectionCards(p, 'c1').map((c) => c.id), [3, 2, 1]));
p = prof.removeFromCollection(p, 'c1', 2);
check('remove from collection keeps it saved', p.saved[2] && eq(p.collections.c1.cardIds, [1, 3]));
r = prof.createCollection(p, 'Space', 'c2'); p = r.profile;
check('rename to existing name rejected', prof.renameCollection(p, 'c2', 'rome').collections.c2.name === 'Space');
check('rename works', prof.renameCollection(p, 'c2', 'Cosmos').collections.c2.name === 'Cosmos');
p = prof.addToCollection(p, 'c2', card(3));
p = prof.toggleSave(p, card(3));
check('unsaving removes card from every collection', !p.saved[3] && !p.collections.c1.cardIds.includes(3) && !p.collections.c2.cardIds.includes(3));
const afterDelete = prof.deleteCollection(p, 'c1');
check('delete collection keeps saved cards', !afterDelete.collections.c1 && afterDelete.saved[1]);
check('add to missing collection is a no-op', prof.addToCollection(p, 'nope', card(9)) === p);
let many = prof.emptyProfile();
for (let i = 0; i < prof.MAX_COLLECTIONS + 5; i++) many = prof.createCollection(many, `c${i}`).profile;
check('collection cap', Object.keys(many.collections).length === prof.MAX_COLLECTIONS);
const legacy = prof.normalizeProfile({ likes: { 5: { title: 'Old', at: 1 } }, saved: {}, seen: [1], weights: {} });
check('legacy profile gains collections/streak/settings', eq(legacy.collections, {}) && legacy.streak.current === 0 && legacy.settings.nearby === false && legacy.seen[0] === 1);
check('normalize survives junk', prof.normalizeProfile(null).settings.nearby === false);
check('touchStreak wires through', prof.touchStreak(prof.emptyProfile(), D(2026, 5, 5)).streak.todayCount === 1);
check('setSetting', prof.setSetting(prof.emptyProfile(), 'nearby', true).settings.nearby === true);

// ---------- format + filters ----------
check('metric distances', formatDistance(640) === '640 m' && formatDistance(2340) === '2.3 km' && formatDistance(15200) === '15 km' && formatDistance(4) === '10 m');
check('imperial distances', formatDistance(1609.344, true) === '1.0 mi' && formatDistance(50, true) === '160 ft' && formatDistance(40000, true) === '25 mi');
check('bad distance -> empty', formatDistance(NaN) === '' && formatDistance(-5) === '');
check('filterKey distinct', new Set([filters.filterKey(filters.ALL), filters.filterKey(filters.NEARBY), filters.filterKey(filters.tagFilter('X')), filters.filterKey(filters.tagFilter('Y')), filters.filterKey(filters.categoryFilter('history'))]).size === 5);
check('sequential only tag/nearby', filters.isSequential(filters.NEARBY) && filters.isSequential(filters.tagFilter('x')) && !filters.isSequential(filters.ALL) && !filters.isSequential(filters.categoryFilter('space')));
check('categories well-formed + unique', new Set(filters.CATEGORIES.map((c) => c.id)).size === filters.CATEGORIES.length && filters.CATEGORIES.every((c) => c.topics.length && c.keywords.length && c.label));
const VALID_TOPICS = new Set('biography women food-and-drink internet-culture linguistics literature books entertainment films media music radio software television video-games performing-arts philosophy-and-religion sports architecture comics-and-anime fashion visual-arts geographical africa central-africa eastern-africa northern-africa southern-africa western-africa central-america north-america south-america asia central-asia east-asia north-asia south-asia southeast-asia west-asia eastern-europe europe northern-europe southern-europe western-europe oceania business-and-economics education history military-and-warfare politics-and-government society transportation biology chemistry computing earth-and-environment engineering libraries-and-information mathematics medicine-and-health physics stem space technology'.split(' '));
check('every category topic is a documented articletopic value', filters.CATEGORIES.every((c) => c.topics.every((t) => VALID_TOPICS.has(t))), filters.CATEGORIES.flatMap((c) => c.topics).filter((t) => !VALID_TOPICS.has(t)).join());

// ---------- batch: media-first, order, top-up, nearby ----------
const art = (id, image, cats = ['A']) => ({ id, kind: 'article', title: `A${id}`, extract: 'x', image: image ? 'i.jpg' : null, categories: cats });
const noImg = [1, 2, 3].map((i) => art(i, false)), withImg = [4, 5, 6].map((i) => art(i, true));
let allImagesFirst = true;
for (let k = 0; k < 50; k++) {
  const b = batch.buildBatch({ random: [...noImg, ...withImg] }, prof.emptyProfile(), new Set());
  if (!b.slice(0, 3).every((c) => c.image) || !b.slice(3).every((c) => !c.image)) allImagesFirst = false;
}
check('articles with images always rank above ones without (50 runs)', allImagesFirst);
let interestWins = true;
for (let k = 0; k < 50; k++) {
  const b = batch.buildBatch({ random: [art(1, false, ['Loved']), art(2, true, ['Meh'])] }, { ...prof.emptyProfile(), weights: { Loved: 10 } }, new Set());
  if (b[0].id !== 1) interestWins = false;
}
check('a strong interest match still beats a picture', interestWins);
const ordered = [9, 8, 7, 6, 5].map((i) => art(i, i % 2 === 0));
check('keepOrder preserves order', eq(batch.buildBatch({ random: ordered }, prof.emptyProfile(), new Set(), { keepOrder: true }).map((c) => c.id), [9, 8, 7, 6, 5]));
const media = (id, type) => ({ id: `commons:${id}`, kind: 'media', mediaType: type, title: 'm', extract: 'x', categories: [] });
const imgs5 = [1, 2, 3, 4, 5].map((i) => media(i, 'image')), vids4 = [11, 12, 13, 14].map((i) => media(i, 'video'));
const topped = batch.buildBatch({ random: [art(1, true)], images: imgs5, videos: vids4 }, prof.emptyProfile(), new Set());
check('few articles -> topped up to a full batch with media', topped.length === 10 && topped.filter((c) => c.kind === 'media').length === 9, `${topped.length}`);
const withNearby = batch.buildBatch({ random: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => art(i, true)), nearby: [{ ...art(90, true), distanceM: 120 }], otd: [{ id: 'otd:1', kind: 'otd', extract: 'x', categories: [] }], images: [media(1, 'image')], videos: [media(2, 'video')] }, prof.emptyProfile(), new Set());
check('nearby slot used alongside otd/image/video, batch full', withNearby.length === 10 && withNearby.some((c) => c.id === 90) && withNearby.filter((c) => c.kind !== 'article').length === 3 && withNearby.filter((c) => c.kind === 'article').length === 7, withNearby.map((c) => c.id + ':' + c.kind).join());
const parts = { ...batch.emptyParts(), random: [art(1, true), art(2, true), art(3, true)], images: imgs5 };
const pageNow = [parts.random[0], parts.images[0]];
const left = batch.leftovers(parts, pageNow, new Set([2]));
check('leftovers drop shown + excluded, keep the rest', eq(left.random.map((c) => c.id), [3]) && left.images.length === 4);
check('mergeParts concatenates', batch.mergeParts(parts, parts).random.length === 6 && batch.isEmptyParts(batch.emptyParts()) && !batch.isEmptyParts(parts));

// ---------- wikipedia: topic, tag paging, nearby ----------
log.length = 0;
const topic = await wiki.fetchTopic('history', 5);
check('fetchTopic uses articletopic search', log[0].searchParams.get('gsrsearch') === 'articletopic:history' && topic.length === 6, log[0].searchParams.get('gsrsearch'));
check('topic start offset is random + numeric', /^\d+$/.test(log[0].searchParams.get('gsroffset')));
log.length = 0;
let page1 = await wiki.fetchCategoryPage('Ancient "Rome"', 12, 0);
check('tag quotes stripped from query', log[0].searchParams.get('gsrsearch') === 'incategory:"Ancient Rome"', log[0].searchParams.get('gsrsearch'));
check('first tag page has a next offset', page1.cards.length === 12 && page1.next === 12);
const page2 = await wiki.fetchCategoryPage('Ancient Rome', 12, 12);
check('last tag page ends paging (next=null)', page2.cards.length === 2 && page2.next === null);
const none = await wiki.fetchCategoryPage('Nonexistent Thing', 12, 0);
check('unknown tag -> empty + null', none.cards.length === 0 && none.next === null);

log.length = 0;
const near1 = await wiki.fetchNearby({ lat: 42.9, lon: -73.9 }, 10, 0);
const geoCall = log.find((u) => u.searchParams.get('list') === 'geosearch');
check('geosearch request: coords, 10 km radius, articles namespace', geoCall.searchParams.get('gscoord') === '42.9|-73.9' && geoCall.searchParams.get('gsradius') === '10000' && geoCall.searchParams.get('gsnamespace') === '0');
check('nearby cards in distance order despite API order', eq(near1.cards.map((c) => c.distanceM), [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]), near1.cards.map((c) => c.distanceM).join());
check('nearby cursor', near1.next === 10);
const near3 = await wiki.fetchNearby({ lat: 42.9, lon: -73.9 }, 10, 20);
check('last nearby page', near3.cards.length === 5 && near3.next === null);
check('geosearch list fetched once per location (cached)', log.filter((u) => u.searchParams.get('list') === 'geosearch').length === 1);
const picked = await wiki.fetchNearbyPicked({ lat: 42.9, lon: -73.9 }, 3, new Set([1000, 1001]));
check('picked nearby respects exclude', picked.length === 3 && picked.every((c) => c.id !== 1000 && c.id !== 1001));

// ---------- commons: tag + nearby ----------
log.length = 0;
const ci = await commons.fetchCommonsCategory({ video: false, category: 'Ancient Rome', n: 6, offset: 0 });
check('commons category query', log[0].searchParams.get('gsrsearch') === 'incategory:"Ancient Rome" filetype:bitmap', log[0].searchParams.get('gsrsearch'));
check('commons category paging', ci.cards.length === 6 && ci.next === 6 && (await commons.fetchCommonsCategory({ video: false, category: 'Ancient Rome', n: 6, offset: 6 })).next === null);
const cv = await commons.fetchCommonsCategory({ video: true, category: 'Ancient Rome', n: 4, offset: 0 });
check('commons category videos', cv.cards.length === 2 && cv.cards.every((c) => c.mediaType === 'video') && cv.next === null);
log.length = 0;
const cn = await commons.fetchCommonsNearby({ lat: 42.9, lon: -73.9 }, 12, 0);
const cgeo = log.find((u) => u.searchParams.get('list') === 'geosearch');
check('commons geosearch uses File namespace', cgeo.searchParams.get('gsnamespace') === '6' && cgeo.host === 'commons.wikimedia.org');
check('nearby media: titles as fallback caption, distance, order', cn.cards.length === 12 && cn.cards[0].distanceM === 50 && cn.cards[0].extract.length > 0 && cn.next === 12);
check('nearby media includes videos', cn.cards.some((c) => c.mediaType === 'video'));

// ---------- sources: each mode ----------
log.length = 0;
const cat = await sources.fetchParts(filters.categoryFilter('history'), { profile: prof.emptyProfile(), exclude: new Set(), cursor: {}, coords: null });
const searches = log.map((u) => u.searchParams.get('gsrsearch')).filter(Boolean);
check('category: topic articles + otd + media', cat.parts.random.length === 6 && cat.parts.otd.length === 1 && cat.parts.images.length >= 1 && cat.parts.videos.length >= 1);
check('category: topic query is one of history\'s topics', /^articletopic:(history|military-and-warfare)$/.test(searches.find((s) => s.startsWith('articletopic:'))));
const sci = await sources.fetchParts(filters.categoryFilter('science'), { profile: prof.emptyProfile(), exclude: new Set(), cursor: {}, coords: null });
check('non-history category has no On This Day', sci.parts.otd.length === 0);

const tagCursor = sources.initialCursor(filters.tagFilter('Ancient Rome'));
const t1 = await sources.fetchParts(filters.tagFilter('Ancient Rome'), { profile: prof.emptyProfile(), exclude: new Set(), cursor: tagCursor, coords: null });
check('tag: first round (12 articles, 6 images, 2 videos), cursors advance', t1.parts.random.length === 12 && t1.parts.images.length === 6 && t1.parts.videos.length === 2 && tagCursor.articles === 12 && tagCursor.images === 6 && tagCursor.videos === null, JSON.stringify(tagCursor));
const t2 = await sources.fetchParts(filters.tagFilter('Ancient Rome'), { profile: prof.emptyProfile(), exclude: new Set(), cursor: tagCursor, coords: null });
check('tag: second round exhausts everything', t2.parts.random.length === 2 && t2.parts.images.length === 1 && Object.values(tagCursor).every((v) => v === null));

let threwNoCoords = false; try { await sources.fetchParts(filters.NEARBY, { profile: prof.emptyProfile(), exclude: new Set(), cursor: sources.initialCursor(filters.NEARBY), coords: null }); } catch { threwNoCoords = true; }
check('nearby without location throws a clear error', threwNoCoords);
const nc = sources.initialCursor(filters.NEARBY);
const n1 = await sources.fetchParts(filters.NEARBY, { profile: prof.emptyProfile(), exclude: new Set(), cursor: nc, coords: { lat: 42.9, lon: -73.9 } });
check('nearby: articles + split images/videos', n1.parts.random.length === 10 && n1.parts.images.length + n1.parts.videos.length === 12 && n1.parts.images.every((c) => c.mediaType === 'image'));

const withSetting = prof.setSetting(prof.emptyProfile(), 'nearby', true);
const fy = await sources.fetchParts(filters.ALL, { profile: withSetting, exclude: new Set(), cursor: {}, coords: { lat: 42.9, lon: -73.9 } });
check('For you mixes nearby only when opted in and located', fy.parts.nearby.length > 0 && fy.parts.nearby.every((c) => Number.isFinite(c.distanceM)));
const fyOff = await sources.fetchParts(filters.ALL, { profile: prof.emptyProfile(), exclude: new Set(), cursor: {}, coords: { lat: 42.9, lon: -73.9 } });
check('For you has no nearby when the setting is off', fyOff.parts.nearby.length === 0);
const fyNoLoc = await sources.fetchParts(filters.ALL, { profile: withSetting, exclude: new Set(), cursor: {}, coords: null });
check('For you has no nearby without coordinates', fyNoLoc.parts.nearby.length === 0);

mocks.state.fail = true;
const down = await sources.fetchParts(filters.categoryFilter('space'), { profile: prof.emptyProfile(), exclude: new Set(), cursor: {}, coords: null });
check('all sources down -> empty parts + errors reported, no throw', batch.isEmptyParts(down.parts) && down.errors.length >= 3);
mocks.state.fail = false;

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);

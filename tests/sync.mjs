// Tests for merging two copies of a profile and for the sync engine, using a fake cloud
// (in memory) and fake timers. No network, no Firebase. Run with `npm test`.
const src = new URL('../src/', import.meta.url).href;
let failed = 0;
const check = (name, ok, extra = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + extra}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

const prof = await import(src + 'profile.js');
const sync = await import(src + 'sync.js');
const { authMessage } = await import(src + 'authMessages.js');

const card = (id, cats = ['C']) => ({ id, kind: 'article', title: `T${id}`, extract: 'x', categories: cats });
const withSave = (p, id) => prof.toggleSave(p, card(id));
const withLike = (p, id) => prof.toggleLike(p, card(id));
const E = prof.emptyProfile;
const ids = (p) => p.saved.map((r) => r.id).sort((a, b) => a - b);

// ====================== mergeProfiles ======================
{
  const a = { ...E(), likes: { 1: { title: 'A', seed: 'A', at: 100 }, 2: { title: 'B', seed: 'B', at: 50 } } };
  const b = { ...E(), likes: { 1: { title: 'A', seed: 'A', at: 200 }, 3: { title: 'C', seed: 'C', at: 10 } } };
  const m = prof.mergeProfiles(a, b);
  check('likes: union, and the later like wins a clash', eq(Object.keys(m.likes).sort(), ['1', '2', '3']) && m.likes[1].at === 200);
}
{
  const a = { ...E(), saved: [{ id: 1, kind: 'article', title: 'One', at: 30 }, { id: 2, kind: 'article', title: 'Two', at: 10 }] };
  const b = { ...E(), saved: [{ id: 2, kind: 'article', title: 'Two (other)', at: 20 }, { id: 3, kind: 'article', title: 'Three', at: 5 }] };
  const m = prof.mergeProfiles(a, b);
  check('saved: union without duplicates, ordered by save time', eq(m.saved.map((r) => r.id), [3, 2, 1]), JSON.stringify(m.saved.map((r) => r.id)));
  check('saved: this device\'s record wins a duplicate', m.saved.find((r) => r.id === 2).title === 'Two');
}
{
  const a = withSave(withSave(E(), 1), 2);
  const aa = prof.createCollection(a, 'Rome', 'ca').profile;
  const withA = prof.addToCollection(prof.addToCollection(aa, 'ca', card(1)), 'ca', card(2));
  const b = withSave(withSave(E(), 2), 3);
  const bb = prof.createCollection(b, 'rome', 'cb').profile; // same name, different id and case
  const withB = prof.addToCollection(prof.addToCollection(bb, 'cb', card(3)), 'cb', card(2));
  const other = prof.addToCollection(prof.createCollection(withB, 'Space', 'cs').profile, 'cs', card(3));
  const m = prof.mergeProfiles(withA, other);
  check('collections: same name on two devices becomes one, with every card', Object.keys(m.collections).length === 2 && eq(m.collections.ca.cardIds.slice().sort(), [1, 2, 3]), JSON.stringify(m.collections));
  check('collections: other collections are kept', m.collections.cs?.name === 'Space');
  check('every collected post is also saved', Object.values(m.collections).every((c) => c.cardIds.every((id) => prof.isSaved(m, id))));
  const same = prof.mergeProfiles(withA, withA);
  check('merging a copy with itself changes nothing important', eq(ids(same), ids(withA)) && eq(same.collections.ca.cardIds, withA.collections.ca.cardIds));
}
{
  const a = { ...E(), weights: { X: 3, Y: 1 }, seen: [1, 2, 3], settings: { nearby: true } };
  const b = { ...E(), weights: { X: 2, Z: 4 }, seen: [3, 4], settings: { nearby: false, other: 1 } };
  const m = prof.mergeProfiles(a, b);
  check('weights: larger value per topic', eq(m.weights, { X: 3, Z: 4, Y: 1 }) || (m.weights.X === 3 && m.weights.Y === 1 && m.weights.Z === 4));
  check('seen: union without repeats', eq(m.seen.slice().sort(), [1, 2, 3, 4]));
  check('settings: this device wins, the other\'s extras are kept', m.settings.nearby === true && m.settings.other === 1);
  const longA = { ...E(), seen: Array.from({ length: 900 }, (_, i) => i) };
  const longB = { ...E(), seen: Array.from({ length: 900 }, (_, i) => 1000 + i) };
  check('seen stays capped at 1000', prof.mergeProfiles(longA, longB).seen.length === 1000);
}
{
  const s = (current, best, lastDay, todayDay, todayCount) => ({ current, best, lastDay, todayDay, todayCount });
  const merge = (x, y) => prof.mergeProfiles({ ...E(), streak: x }, { ...E(), streak: y }).streak;
  check('streak: the more recent day wins', merge(s(3, 5, '2026-11-10', '2026-11-10', 5), s(1, 2, '2026-11-12', '2026-11-12', 5)).current === 1 && merge(s(3, 5, '2026-11-10', '', 0), s(1, 2, '2026-11-12', '', 0)).lastDay === '2026-11-12');
  check('streak: best is never lost', merge(s(3, 9, '2026-11-10', '', 0), s(1, 2, '2026-11-12', '', 0)).best === 9);
  check('streak: same day, take the larger run and larger count', (() => { const r = merge(s(4, 4, '2026-11-12', '2026-11-12', 2), s(3, 4, '2026-11-12', '2026-11-12', 5)); return r.current === 4 && r.todayCount === 5; })());
  check('streak: an empty streak never beats a real one', merge(s(0, 0, null, null, 0), s(2, 2, '2026-11-12', '2026-11-12', 5)).current === 2);
}
{
  const long = 20;
  const a = E(); const b = E();
  for (let i = 0; i < long; i++) { a.collections[`a${i}`] = { id: `a${i}`, name: `A${i}`, createdAt: i, cardIds: [] }; b.collections[`b${i}`] = { id: `b${i}`, name: `B${i}`, createdAt: 100 + i, cardIds: [] }; }
  check('collection cap holds after a merge', Object.keys(prof.mergeProfiles(a, b).collections).length === Math.min(40, prof.MAX_COLLECTIONS));
}
check('isEmptyProfile: new user is empty, any real data is not', prof.isEmptyProfile(E()) && !prof.isEmptyProfile(withSave(E(), 1)) && !prof.isEmptyProfile(withLike(E(), 1)) && prof.isEmptyProfile(prof.markSeen(E(), [1, 2, 3])) && !prof.isEmptyProfile({ ...E(), streak: { ...E().streak, todayCount: 2 } }));
check('worthSyncing ignores `seen` and daily progress, notices the rest', (() => {
  const p = E();
  return !sync.worthSyncing(p, prof.markSeen(p, [1])) && !sync.worthSyncing(p, prof.touchStreak(p, new Date(2026, 10, 3))) && sync.worthSyncing(p, withSave(p, 1)) && sync.worthSyncing(p, withLike(p, 1)) && sync.worthSyncing(p, prof.setSetting(p, 'nearby', true));
})());
{
  let p = E(); const t0 = new Date(2026, 10, 3);
  const flags = [];
  for (let i = 0; i < 5; i++) { const n = prof.touchStreak(p, t0); flags.push(sync.worthSyncing(p, n)); p = n; }
  check('reaching the daily goal (the 5th view) is worth syncing, the first four are not', eq(flags, [false, false, false, false, true]), JSON.stringify(flags));
}

// ====================== sync engine ======================
const mkTimers = () => {
  let now = 0; let n = 0; const q = new Map();
  return {
    set(fn, ms) { const id = ++n; q.set(id, { at: now + ms, fn }); return id; },
    clear(id) { q.delete(id); },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
        if (!next) break;
        q.delete(next[0]); now = next[1].at; next[1].fn(); await settle();
      }
      now = end;
    },
    pending: () => q.size,
    now: () => now,
  };
};
const mkAdapter = (uid = 'u1') => {
  const a = {
    uid, reads: 0, writes: 0, failSignIn: null, beforeSave: null, docs: new Map(),
    async signIn() { if (a.failSignIn) throw a.failSignIn; return a.uid; },
    async load(u) { a.reads++; const d = a.docs.get(u); return d ? { ...d } : null; },
    async save(u, json, expected) {
      if (a.beforeSave) await a.beforeSave();
      const cur = a.docs.get(u)?.rev ?? 0;
      if (cur !== expected) return { ok: false };
      a.writes++; a.docs.set(u, { json, rev: cur + 1 });
      return { ok: true, rev: cur + 1 };
    },
  };
  return a;
};
const seed = (adapter, uid, profile, rev) => adapter.docs.set(uid, { json: JSON.stringify(profile), rev });
const remoteOf = (adapter, uid) => prof.normalizeProfile(JSON.parse(adapter.docs.get(uid).json));

function setup({ profile = E(), adapter = mkAdapter(), meta = null, debounceMs = 1000 } = {}) {
  const t = mkTimers();
  const h = { profile, statuses: [], meta, online: true, t, adapter };
  const store = { load: () => h.meta, save: (m) => { h.meta = { ...m }; } };
  h.engine = sync.createSync({
    adapter, getProfile: () => h.profile, store, debounceMs, timers: t, isOnline: () => h.online,
    replaceProfile: (p) => { const prev = h.profile; h.profile = p; h.engine.notifyChange(prev, p); }, // like the app's effect: the engine must ignore this
    onStatus: (s) => h.statuses.push(s),
  });
  h.change = (fn) => { const prev = h.profile; h.profile = fn(prev); h.engine.notifyChange(prev, h.profile); };
  h.last = () => h.statuses[h.statuses.length - 1];
  return h;
}

{ // first run
  const h = setup(); h.engine.start(); await settle();
  check('first run, nothing anywhere: one read, no writes, "synced"', h.adapter.reads === 1 && h.adapter.writes === 0 && h.last().state === 'synced' && h.statuses[0].state === 'syncing' && h.meta.uid === 'u1');
}
{
  const h = setup({ profile: withSave(E(), 1) }); h.engine.start(); await settle();
  check('data on this device, empty cloud: uploads it', h.adapter.writes === 1 && eq(ids(remoteOf(h.adapter, 'u1')), [1]) && h.meta.rev === 1 && h.meta.dirty === false);
}
{
  const ad = mkAdapter(); seed(ad, 'u1', withSave(E(), 5), 3);
  const h = setup({ adapter: ad }); h.engine.start(); await settle();
  check('a new device takes the cloud copy', eq(ids(h.profile), [5]) && ad.writes === 0 && h.meta.rev === 3 && !h.meta.dirty);
  check('taking the cloud copy does not count as a local change (nothing queued)', h.t.pending() === 0);
}
{
  const ad = mkAdapter(); seed(ad, 'u1', withSave(E(), 5), 2);
  const h = setup({ adapter: ad, profile: withSave(E(), 6) }); h.engine.start(); await settle();
  check('data on both sides, never synced: merged, nothing lost, uploaded', eq(ids(h.profile), [5, 6]) && eq(ids(remoteOf(ad, 'u1')), [5, 6]) && ad.writes === 1 && h.meta.rev === 3);
}
{ // batching
  const h = setup({ debounceMs: 1000 }); h.engine.start(); await settle();
  h.change((p) => withLike(p, 1)); h.change((p) => withLike(p, 2)); h.change((p) => withLike(p, 3));
  check('changes are held back during the quiet period', h.adapter.writes === 0 && h.meta.dirty === true && h.t.pending() === 1);
  await h.t.advance(999);
  check('still nothing just before it ends', h.adapter.writes === 0);
  await h.t.advance(2);
  check('three changes become ONE write', h.adapter.writes === 1 && Object.keys(remoteOf(h.adapter, 'u1').likes).length === 3 && h.meta.dirty === false);
  h.change((p) => prof.markSeen(p, [1, 2, 3]));
  h.change((p) => prof.touchStreak(p, new Date(2026, 10, 3)));
  check('`seen` and daily progress alone never trigger a write', h.t.pending() === 0 && h.meta.dirty === false);
  h.change((p) => withSave(p, 9));
  await h.t.advance(1000);
  check('they ride along with the next real change', h.adapter.writes === 2 && remoteOf(h.adapter, 'u1').seen.length === 3);
}
{ // another device changed the cloud copy
  const ad = mkAdapter(); const h = setup({ adapter: ad }); h.engine.start(); await settle();
  seed(ad, 'u1', withSave(E(), 9), 1);
  await h.engine.syncNow(); await settle();
  check('cloud changed by another device, nothing local: take it, no write', eq(ids(h.profile), [9]) && ad.writes === 0 && h.meta.rev === 1);

  h.change((p) => withSave(p, 10));
  seed(ad, 'u1', withSave(withSave(E(), 9), 11), 2);
  await h.t.advance(1000);
  check('both changed: merged, and nothing from either side is lost', eq(ids(h.profile), [9, 10, 11]) && eq(ids(remoteOf(ad, 'u1')), [9, 10, 11]) && h.meta.rev === 3, JSON.stringify(ids(h.profile)));
}
{ // lost a race on the write
  const ad = mkAdapter(); seed(ad, 'u1', withSave(E(), 1), 1);
  const h = setup({ adapter: ad }); h.engine.start(); await settle();
  h.change((p) => withSave(p, 2));
  let raced = false;
  ad.beforeSave = async () => { if (!raced) { raced = true; seed(ad, 'u1', withSave(withSave(E(), 1), 12), 2); } };
  await h.t.advance(1000);
  check('someone else wrote during our upload: re-read, merge, upload again', raced && eq(ids(remoteOf(ad, 'u1')), [1, 2, 12]) && eq(ids(h.profile), [1, 2, 12]) && h.meta.rev === 3, JSON.stringify(ids(remoteOf(ad, 'u1'))));
}
{ // edit during an upload
  const ad = mkAdapter(); const h = setup({ adapter: ad, debounceMs: 1000 }); h.engine.start(); await settle();
  h.change((p) => withLike(p, 1));
  let edited = false;
  ad.beforeSave = async () => { if (!edited) { edited = true; h.change((p) => withLike(p, 2)); } };
  await h.t.advance(1000);
  check('an edit made mid-upload keeps the profile "dirty" and queues another upload', h.meta.dirty === true && h.t.pending() === 1);
  await h.t.advance(1000);
  check('...which then goes through', ad.writes === 2 && Object.keys(remoteOf(ad, 'u1').likes).length === 2 && h.meta.dirty === false);
}
{ // errors and retry
  const ad = mkAdapter(); ad.failSignIn = Object.assign(new Error('not allowed'), { code: 'auth/operation-not-allowed' });
  const h = setup({ adapter: ad, profile: withSave(E(), 1) }); h.engine.start(); await settle();
  check('sign-in failing shows an error with its code and keeps local data', h.last().state === 'error' && h.last().code === 'auth/operation-not-allowed' && eq(ids(h.profile), [1]));
  check('a retry is queued', h.t.pending() === 1);
  ad.failSignIn = null; await h.t.advance(5000);
  check('the retry succeeds once the problem is fixed', h.last().state === 'synced' && ad.writes === 1);
  ad.failSignIn = new Error('x'); const h2 = setup({ adapter: ad }); h2.engine.start(); await settle();
  const waits = []; for (const ms of [5000, 15000, 45000, 120000, 300000, 300000]) { const before = ad.reads; await h2.t.advance(ms - 1); const early = h2.statuses.length; await h2.t.advance(1); waits.push(h2.statuses.length > early); }
  check('retries back off (5s, 15s, 45s, 2m, 5m, then every 5m)', waits.every(Boolean), JSON.stringify(waits));
}
{
  const h = setup({ profile: withSave(E(), 1) }); h.online = false; h.engine.start(); await settle();
  check('offline: says so, makes no requests, keeps data', h.last().state === 'offline' && h.adapter.reads === 0 && h.t.pending() === 1);
  h.online = true; await h.t.advance(5000);
  check('back online: syncs', h.last().state === 'synced' && h.adapter.writes === 1);
}
{
  const big = prof.toggleSave(E(), { id: 'otd:x', kind: 'otd', title: 't', extract: 'x'.repeat(950000), categories: [] });
  const h = setup({ profile: big }); h.engine.start(); await settle();
  check('too large to sync: clear error, nothing uploaded', h.last().state === 'error' && h.last().code === 'too-large' && h.adapter.writes === 0);
}
{
  const ad = mkAdapter(); ad.docs.set('u1', { json: 'not json {', rev: 4 });
  const h = setup({ adapter: ad, profile: withSave(E(), 1) }); h.engine.start(); await settle();
  check('an unreadable cloud copy is never overwritten', h.last().code === 'corrupt' && ad.writes === 0 && eq(ids(h.profile), [1]) && ad.docs.get('u1').json === 'not json {');
}
{ // survives a reload
  const ad = mkAdapter(); const h = setup({ adapter: ad }); h.online = false; h.engine.start(); await settle();
  h.change((p) => withSave(p, 7));
  const h2 = setup({ adapter: ad, profile: h.profile, meta: h.meta });
  h2.engine.start(); await settle();
  check('unsynced changes are remembered across a reload and uploaded', ad.writes === 1 && eq(ids(remoteOf(ad, 'u1')), [7]));
}
{ // another account
  const ad = mkAdapter('u1'); const h = setup({ adapter: ad, profile: withSave(E(), 1) }); h.engine.start(); await settle();
  ad.uid = 'u2'; seed(ad, 'u2', withSave(E(), 2), 4);
  await h.engine.syncNow(); await settle();
  check('a different account: this device\'s data is merged in, not discarded', eq(ids(h.profile), [1, 2]) && eq(ids(remoteOf(ad, 'u2')), [1, 2]) && h.meta.uid === 'u2' && h.meta.rev === 5);
}
{ // flush and stop
  const h = setup(); h.engine.start(); await settle();
  h.change((p) => withSave(p, 3));
  h.engine.flush(); await settle();
  check('flush uploads immediately (page being hidden)', h.adapter.writes === 1 && h.t.pending() === 0);
  h.engine.flush(); await settle();
  check('flush with nothing pending does nothing', h.adapter.writes === 1);
  h.change((p) => withSave(p, 4)); h.engine.stop();
  check('after stop, timers are cleared and changes are ignored', h.t.pending() === 0);
  await h.t.advance(60000);
  check('...and nothing more is written', h.adapter.writes === 1);
}

{ // awaitable syncNow
  const ad = mkAdapter(); const h = setup({ adapter: ad, profile: withSave(E(), 1) });
  let edited = false;
  ad.beforeSave = async () => { if (!edited) { edited = true; h.change((p) => withSave(p, 2)); } }; // edited while the upload is in flight
  const done = h.engine.syncNow();
  const again = h.engine.syncNow(); // queues one more run
  await done;
  check('syncNow() resolves only after the run queued behind it has finished', ad.writes === 2 && eq(ids(remoteOf(ad, 'u1')), [1, 2]) && h.meta.dirty === false, String(ad.writes));
  await again;
  const bad = mkAdapter(); bad.failSignIn = new Error('x');
  const hb = setup({ adapter: bad });
  let rejected = false; await hb.engine.syncNow().catch(() => { rejected = true; });
  check('syncNow() never rejects; the problem goes to the status', !rejected && hb.last().state === 'error');
}
{ // refresh
  const h = setup(); h.engine.start(); await settle();
  const reads = () => h.adapter.reads;
  const r0 = reads();
  await h.engine.refresh(); await settle();
  check('refresh right after a sync does nothing', reads() === r0);
  await h.t.advance(59000); await h.engine.refresh(); await settle();
  check('...still nothing at 59 s', reads() === r0);
  await h.t.advance(2000); await h.engine.refresh(); await settle();
  check('...but after a minute it checks the cloud', reads() === r0 + 1);
  await h.engine.refresh(); await settle();
  check('and then waits another minute', reads() === r0 + 1);
}
{ // resetTo (sign out)
  const ad = mkAdapter(); const h = setup({ adapter: ad, profile: withSave(E(), 1) }); await h.engine.syncNow();
  h.engine.resetTo(E());
  check('resetTo: profile replaced, account forgotten, nothing dirty, nothing queued', prof.isEmptyProfile(h.profile) && h.meta.uid === null && h.meta.rev === 0 && h.meta.dirty === false && h.t.pending() === 0);
  ad.uid = 'u2'; await h.engine.syncNow();
  check('...the next sync starts a fresh account without touching the old document', h.meta.uid === 'u2' && ad.writes === 1 && eq(ids(remoteOf(ad, 'u1')), [1]) && !ad.docs.has('u2'), String(ad.writes));
}

// ====================== sign-in messages ======================
check('closing the sign-in window needs no message', ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].every((c) => authMessage({ code: c }) === null));
check('pop-up blocked, unauthorized domain, provider off, offline: each has its own plain message', new Set(['auth/popup-blocked', 'auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/network-request-failed'].map((c) => authMessage({ code: c }))).size === 4 && authMessage({ code: 'auth/popup-blocked' }).includes('pop-up') && authMessage({ code: 'auth/unauthorized-domain' }).includes('Authorized domains'));
check('unknown errors show their code; "unsynced" shows its own text', authMessage({ code: 'auth/weird' }).includes('auth/weird') && authMessage({ code: 'unsynced', message: 'Hold on' }) === 'Hold on');

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);

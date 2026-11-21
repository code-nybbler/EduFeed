// The user's profile: interests, saved cards, collections, streak and settings.
// All update functions are pure (profile in, new profile out) so they work
// directly with React's setState updater form, and persistence is separate
// (see storage.js).

import { emptyStreak, recordView } from './streak.js';

const MAX_SEEN = 1000;
const MAX_WEIGHTS = 300;
export const MAX_COLLECTIONS = 50;
export const MAX_NAME = 40;

export const emptyProfile = () => ({
  likes: {}, // id -> { title, seed, at, kind } (plus `snapshot` for "On this day" cards, like saves)
  saved: [], // saved posts, oldest first: { id, kind, title, at } (plus `snapshot` for "On this day" cards)
  collections: {}, // id -> { id, name, createdAt, cardIds: [] }; cards in them are always also in `saved`
  seen: [], // ids already shown, so the main feed never repeats
  weights: {}, // category -> interest score
  streak: emptyStreak(),
  settings: { nearby: false }, // mix places near the user into the main feed
});

/** Fill in anything a profile saved by an older version of the app doesn't have. */
export function normalizeProfile(stored) {
  const base = emptyProfile();
  const s = stored && typeof stored === 'object' ? stored : {};
  return {
    ...base,
    ...s,
    saved: normalizeSaved(s.saved),
    collections: s.collections ?? {},
    streak: { ...base.streak, ...s.streak },
    settings: { ...base.settings, ...s.settings },
  };
}

/**
 * A saved post is stored as a small record, not the whole card: just enough to
 * find it again and to show something if it can't be loaded. The full card is
 * fetched by `id` when the Saved tab needs it (see cardCache.js). "On this day"
 * cards are the exception: they aren't a single page that can be fetched again,
 * so they keep a snapshot of the card.
 */
export function toRecord(card, at = Date.now()) {
  const kind = card.kind ?? 'article';
  const record = { id: card.id, kind, title: card.title, at };
  if (kind === 'otd') record.snapshot = card;
  return record;
}

// Older versions kept every saved card in full, in an object keyed by id.
function normalizeSaved(saved) {
  if (Array.isArray(saved)) return saved.filter((r) => r && r.id !== undefined);
  if (saved && typeof saved === 'object') {
    return Object.values(saved)
      .filter((card) => card && card.id !== undefined)
      .map((card, i) => toRecord(card, i)); // the old format didn't record when; keep the order
  }
  return [];
}

/** What kind of post an id belongs to. Likes made before the app stored `kind` are worked out from the id's shape. */
export function kindOfId(id) {
  const s = String(id);
  if (s.startsWith('commons:')) return 'media';
  if (s.startsWith('otd:')) return 'otd';
  return 'article';
}

/**
 * The liked posts as records, newest like first: the same shape as saved records, so the Liked tab
 * can bring them back by id exactly like the Saved tab does. An old "On this day" like has no
 * snapshot of its own; if that post was also saved, the saved copy's snapshot is used.
 */
export function likedRecords(profile) {
  const savedById = new Map(profile.saved.map((r) => [String(r.id), r]));
  return Object.entries(profile.likes)
    .map(([key, like]) => {
      const kind = like.kind ?? kindOfId(key);
      const number = Number(key);
      const record = {
        id: kind === 'article' && Number.isFinite(number) ? number : key,
        kind,
        title: like.title ?? '',
        at: like.at ?? 0,
      };
      if (kind === 'otd') record.snapshot = like.snapshot ?? savedById.get(key)?.snapshot;
      return record;
    })
    .sort((a, b) => b.at - a.at);
}

export const isSaved = (profile, id) => profile.saved.some((r) => r.id === id);

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function bump(weights, categories, amount) {
  const next = { ...weights };
  for (const c of categories ?? []) next[c] = Math.max(0, (next[c] ?? 0) + amount);
  const entries = Object.entries(next).filter(([, w]) => w > 0);
  if (entries.length <= MAX_WEIGHTS) return Object.fromEntries(entries);
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_WEIGHTS));
}

// ---------- likes, saves ----------

export function toggleLike(profile, card) {
  const likes = { ...profile.likes };
  if (likes[card.id]) {
    delete likes[card.id];
    return { ...profile, likes, weights: bump(profile.weights, card.categories, -2) };
  }
  // `seed` is the topic to search for "more like this"; null when a card has no usable topic.
  // `kind` (and `snapshot` for "On this day") is what the Liked tab needs to bring the post back by id.
  const kind = card.kind ?? 'article';
  likes[card.id] = {
    title: card.title,
    seed: card.seedTitle === undefined ? card.title : card.seedTitle,
    at: Date.now(),
    kind,
    ...(kind === 'otd' ? { snapshot: card } : {}),
  };
  return { ...profile, likes, weights: bump(profile.weights, card.categories, 2) };
}

function saveCard(profile, card) {
  if (isSaved(profile, card.id)) return profile;
  return {
    ...profile,
    saved: [...profile.saved, toRecord(card)],
    weights: bump(profile.weights, card.categories, 1),
  };
}

function dropFromCollections(collections, cardId) {
  const next = {};
  for (const [id, c] of Object.entries(collections)) {
    next[id] = c.cardIds.includes(cardId) ? { ...c, cardIds: c.cardIds.filter((x) => x !== cardId) } : c;
  }
  return next;
}

export function toggleSave(profile, card) {
  if (!isSaved(profile, card.id)) return saveCard(profile, card);
  const saved = profile.saved.filter((r) => r.id !== card.id);
  return {
    ...profile,
    saved,
    // Unsaving a card takes it out of every collection too.
    collections: dropFromCollections(profile.collections, card.id),
    weights: bump(profile.weights, card.categories, -1),
  };
}

/** Clicking through to the full article is a mild interest signal. */
export function recordOpen(profile, card) {
  return { ...profile, weights: bump(profile.weights, card.categories, 0.5) };
}

export function markSeen(profile, ids) {
  return { ...profile, seen: [...profile.seen, ...ids].slice(-MAX_SEEN) };
}

// ---------- collections ----------

const cleanName = (name) => String(name ?? '').trim().slice(0, MAX_NAME);
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** Returns { profile, id }. A name that already exists reuses that collection; `id` is null if nothing could be created. */
export function createCollection(profile, name, id = newId()) {
  const clean = cleanName(name);
  if (!clean) return { profile, id: null };
  const existing = Object.values(profile.collections).find((c) => sameName(c.name, clean));
  if (existing) return { profile, id: existing.id };
  if (Object.keys(profile.collections).length >= MAX_COLLECTIONS) return { profile, id: null };
  const collection = { id, name: clean, createdAt: Date.now(), cardIds: [] };
  return { profile: { ...profile, collections: { ...profile.collections, [id]: collection } }, id };
}

/** Adds the card to the collection, saving it first if it isn't saved yet. */
export function addToCollection(profile, collectionId, card) {
  const collection = profile.collections[collectionId];
  if (!collection) return profile;
  const withCard = saveCard(profile, card);
  if (collection.cardIds.includes(card.id)) return withCard;
  return {
    ...withCard,
    collections: {
      ...withCard.collections,
      [collectionId]: { ...collection, cardIds: [...collection.cardIds, card.id] },
    },
  };
}

/** Takes the card out of the collection; it stays in Saved. */
export function removeFromCollection(profile, collectionId, cardId) {
  const collection = profile.collections[collectionId];
  if (!collection) return profile;
  return {
    ...profile,
    collections: {
      ...profile.collections,
      [collectionId]: { ...collection, cardIds: collection.cardIds.filter((x) => x !== cardId) },
    },
  };
}

export function renameCollection(profile, collectionId, name) {
  const collection = profile.collections[collectionId];
  const clean = cleanName(name);
  if (!collection || !clean) return profile;
  const taken = Object.values(profile.collections).some((c) => c.id !== collectionId && sameName(c.name, clean));
  if (taken) return profile;
  return {
    ...profile,
    collections: { ...profile.collections, [collectionId]: { ...collection, name: clean } },
  };
}

/** Deletes the collection only; its cards stay in Saved. */
export function deleteCollection(profile, collectionId) {
  if (!profile.collections[collectionId]) return profile;
  const collections = { ...profile.collections };
  delete collections[collectionId];
  return { ...profile, collections };
}

/** The saved records in a collection, most recently added first. */
export function collectionRecords(profile, collectionId) {
  const collection = profile.collections[collectionId];
  if (!collection) return [];
  const byId = new Map(profile.saved.map((r) => [r.id, r]));
  return [...collection.cardIds]
    .reverse()
    .map((id) => byId.get(id))
    .filter(Boolean);
}

// ---------- streak, settings ----------

/** Records that the user read a card. */
export function touchStreak(profile, now = new Date()) {
  return { ...profile, streak: recordView(profile.streak, now) };
}

export function setSetting(profile, key, value) {
  return { ...profile, settings: { ...profile.settings, [key]: value } };
}

// ---------- ranking inputs ----------

/** How much of each batch should come from "more like what you liked". */
export function personalRatio(profile) {
  const signals = Object.keys(profile.likes).length + profile.saved.length;
  return Math.min(0.7, signals * 0.08);
}

/** Pick up to `k` recently liked topics to use as "more like this" seeds. */
export function pickSeeds(profile, k) {
  const recent = Object.values(profile.likes)
    .sort((a, b) => b.at - a.at)
    .map((l) => (l.seed === undefined ? l.title : l.seed)) // older saved likes have no `seed`
    .filter(Boolean)
    .slice(0, 20);
  for (let i = recent.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [recent[i], recent[j]] = [recent[j], recent[i]];
  }
  return recent.slice(0, k);
}

/** How well a card's categories match the user's interests. */
export function scoreCard(card, weights) {
  let score = 0;
  for (const c of card.categories ?? []) score += Math.min(weights[c] ?? 0, 10);
  return score;
}

// ---------- combining two copies of a profile (for cloud sync) ----------

/** True for a profile with nothing worth keeping: a brand-new user. (`seen` alone doesn't count.) */
export function isEmptyProfile(p) {
  return (
    Object.keys(p.likes).length === 0 &&
    p.saved.length === 0 &&
    Object.keys(p.collections).length === 0 &&
    Object.keys(p.weights).length === 0 &&
    p.streak.best === 0 &&
    p.streak.todayCount === 0
  );
}

const unique = (list) => [...new Set(list)];

function mergeStreaks(a, b) {
  const sameLast = a.lastDay === b.lastDay;
  const later = (a.lastDay ?? '') >= (b.lastDay ?? '') ? a : b; // 'YYYY-MM-DD' sorts correctly as text
  const current = sameLast ? Math.max(a.current, b.current) : later.current;
  const sameToday = a.todayDay === b.todayDay;
  const today = (a.todayDay ?? '') >= (b.todayDay ?? '') ? a : b;
  return {
    current,
    best: Math.max(a.best, b.best, current),
    lastDay: later.lastDay,
    todayDay: today.todayDay,
    todayCount: sameToday ? Math.max(a.todayCount, b.todayCount) : today.todayCount,
  };
}

/**
 * Combines two copies of a profile without losing anything either has: likes, saves and
 * collections are unioned, interest weights take the larger value, and the streak with
 * the more recent day wins. `a` is this device's copy and wins small ties (a collection's
 * name, a setting).
 *
 * This is a union, so it cannot tell "deleted on one device" from "never had it": something
 * unsaved or unliked on one device comes back if the other device still has it. That is the
 * safe direction for a reading app, and it only happens when both copies changed since they
 * last synced.
 */
export function mergeProfiles(a, b) {
  const likes = { ...b.likes };
  for (const [id, like] of Object.entries(a.likes)) {
    likes[id] = (likes[id]?.at ?? 0) > (like.at ?? 0) ? likes[id] : like;
  }

  const savedById = new Map();
  for (const record of [...a.saved, ...b.saved]) {
    if (!savedById.has(record.id)) savedById.set(record.id, record);
  }
  const saved = [...savedById.values()].sort((x, y) => (x.at ?? 0) - (y.at ?? 0));

  const byId = new Map();
  for (const c of [...Object.values(a.collections), ...Object.values(b.collections)]) {
    const seen = byId.get(c.id);
    if (!seen) {
      byId.set(c.id, { ...c, cardIds: [...c.cardIds] });
    } else {
      seen.cardIds = unique([...seen.cardIds, ...c.cardIds]);
      seen.createdAt = Math.min(seen.createdAt, c.createdAt);
    }
  }
  // Two devices that each made a collection with the same name end up with one.
  const byName = new Map();
  const collections = {};
  for (const c of [...byId.values()].sort((x, y) => x.createdAt - y.createdAt)) {
    const home = byName.get(c.name.toLowerCase());
    if (home) {
      home.cardIds = unique([...home.cardIds, ...c.cardIds]);
    } else {
      byName.set(c.name.toLowerCase(), c);
      collections[c.id] = c;
    }
  }
  const kept = Object.values(collections).slice(0, MAX_COLLECTIONS);
  const savedIds = new Set(saved.map((r) => r.id));
  const finalCollections = Object.fromEntries(
    kept.map((c) => [c.id, { ...c, cardIds: c.cardIds.filter((id) => savedIds.has(id)) }])
  );

  const weights = { ...b.weights };
  for (const [key, w] of Object.entries(a.weights)) weights[key] = Math.max(weights[key] ?? 0, w);

  return {
    ...a,
    likes,
    saved,
    collections: finalCollections,
    weights,
    seen: unique([...b.seen, ...a.seen]).slice(-MAX_SEEN),
    streak: mergeStreaks(a.streak, b.streak),
    settings: { ...b.settings, ...a.settings },
  };
}

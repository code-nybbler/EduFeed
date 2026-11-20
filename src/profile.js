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
  likes: {}, // id -> { title, seed, at }
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
  likes[card.id] = {
    title: card.title,
    seed: card.seedTitle === undefined ? card.title : card.seedTitle,
    at: Date.now(),
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

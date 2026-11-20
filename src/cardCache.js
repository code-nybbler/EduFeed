// Saved posts are stored as small records (see profile.js). This module brings
// the full cards back: it fetches them by id from Wikipedia and Commons, in
// batches, and remembers them for the rest of the session.
//
// Each id is in one of these states:
//   - a card in the cache      ready
//   - 'pending'                being fetched right now
//   - 'failed'                 the request failed (offline, API down): can be retried
//   - 'missing'                the page no longer exists, or no longer suits the feed
// The cache is shared and observable (subscribe/getVersion), so any number of
// components can read it and re-render when it fills in.

import { fetchArticlesByIds } from './wiki.js';
import { fetchCommonsByIds } from './commons.js';

export const CHUNK = 20; // Wikipedia returns extracts for at most 20 pages per request

const cards = new Map(); // id -> card
const states = new Map(); // id -> 'pending' | 'failed' | 'missing'
const listeners = new Set();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getVersion = () => version;
export const getCard = (id) => cards.get(id);
export const getState = (id) => states.get(id);

/** Keeps a card we already have in hand (the user just saved it from the feed), so the Saved tab doesn't need to fetch it. */
export function remember(card) {
  cards.set(card.id, card);
  states.delete(card.id);
}

const chunks = (list) => {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

async function load(ids, fetcher) {
  try {
    const found = await fetcher(ids);
    for (const id of ids) {
      const card = found.get(id);
      if (card) {
        cards.set(id, card);
        states.delete(id);
      } else {
        states.set(id, 'missing');
      }
    }
  } catch {
    ids.forEach((id) => states.set(id, 'failed'));
  }
  emit();
}

/** Fetches whichever of these records aren't cached or already being fetched. */
export async function hydrate(records) {
  const todo = records.filter((r) => r.kind !== 'otd' && !cards.has(r.id) && !states.has(r.id));
  if (todo.length === 0) return;
  todo.forEach((r) => states.set(r.id, 'pending'));
  emit();

  const ids = (kind) => todo.filter((r) => r.kind === kind).map((r) => r.id);
  await Promise.all([
    ...chunks(ids('article')).map((part) => load(part, fetchArticlesByIds)),
    ...chunks(ids('media')).map((part) => load(part, fetchCommonsByIds)),
  ]);
}

/** Lets failed ids be fetched again on the next hydrate(). */
export function clearFailures() {
  let changed = false;
  for (const [id, state] of states) {
    if (state === 'failed') {
      states.delete(id);
      changed = true;
    }
  }
  if (changed) emit();
}

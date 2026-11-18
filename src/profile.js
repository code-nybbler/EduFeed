// The user's interest profile lives entirely in localStorage: no accounts, no
// server. All update functions are pure (profile in, new profile out) so they
// work directly with React's setState updater form.

const KEY = 'learnfeed:v1';
const MAX_SEEN = 1000;
const MAX_WEIGHTS = 300;

export const emptyProfile = () => ({
  likes: {}, // id -> { title, at }
  saved: {}, // id -> full card
  seen: [], // ids already shown, so the feed never repeats
  weights: {}, // category -> interest score
});

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...emptyProfile(), ...JSON.parse(raw) } : emptyProfile();
  } catch {
    return emptyProfile();
  }
}

export function persistProfile(profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private mode or quota exceeded: the feed still works, it just won't remember.
  }
}

function bump(weights, categories, amount) {
  const next = { ...weights };
  for (const c of categories) next[c] = Math.max(0, (next[c] ?? 0) + amount);
  const entries = Object.entries(next).filter(([, w]) => w > 0);
  if (entries.length <= MAX_WEIGHTS) return Object.fromEntries(entries);
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_WEIGHTS));
}

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

export function toggleSave(profile, card) {
  const saved = { ...profile.saved };
  if (saved[card.id]) {
    delete saved[card.id];
    return { ...profile, saved, weights: bump(profile.weights, card.categories, -1) };
  }
  saved[card.id] = card;
  return { ...profile, saved, weights: bump(profile.weights, card.categories, 1) };
}

/** Clicking through to the full article is a mild interest signal. */
export function recordOpen(profile, card) {
  return { ...profile, weights: bump(profile.weights, card.categories, 0.5) };
}

export function markSeen(profile, ids) {
  return { ...profile, seen: [...profile.seen, ...ids].slice(-MAX_SEEN) };
}

/** How much of each batch should come from "more like what you liked". */
export function personalRatio(profile) {
  const signals = Object.keys(profile.likes).length + Object.keys(profile.saved).length;
  return Math.min(0.7, signals * 0.08);
}

/** Pick up to `k` recently liked titles to use as "more like this" seeds. */
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
  for (const c of card.categories) score += Math.min(weights[c] ?? 0, 10);
  return score;
}

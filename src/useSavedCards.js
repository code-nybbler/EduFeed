import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { clearFailures, getCard, getState, getVersion, hydrate, subscribe } from './cardCache.js';

/**
 * Turns saved records into things the Saved tab can show.
 * Each item is { record, card, state }: state is 'ready' (card is set), 'loading', 'failed' or 'missing'.
 * Nothing is fetched until `active` (the Saved tab is open); cached cards are shown immediately.
 */
export function useSavedCards(records, active) {
  useSyncExternalStore(subscribe, getVersion); // re-render whenever the cache changes
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (active) hydrate(records);
  }, [records, active, attempt]);

  const retry = useCallback(() => {
    clearFailures();
    setAttempt((n) => n + 1);
  }, []);

  const items = records.map((record) => {
    if (record.kind === 'otd') return { record, card: record.snapshot ?? null, state: record.snapshot ? 'ready' : 'missing' };
    const card = getCard(record.id);
    if (card) return { record, card, state: 'ready' };
    const state = getState(record.id);
    return { record, card: null, state: state === 'failed' || state === 'missing' ? state : 'loading' };
  });

  return { items, retry, anyFailed: items.some((i) => i.state === 'failed') };
}

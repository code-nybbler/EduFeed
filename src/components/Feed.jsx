import { useEffect, useRef } from 'react';
import Card from './Card.jsx';
import { useFeed } from '../useFeed.js';

function endMessage(filter, hasCards) {
  if (filter.type === 'nearby') {
    return hasCards
      ? "That's everything within 10 km of you."
      : "We couldn't find any articles or photos within 10 km of you.";
  }
  return hasCards
    ? `That's every post we found tagged "${filter.tag}".`
    : `No posts found tagged "${filter.tag}". Tags that name a specific topic work best.`;
}

/** The infinite feed for one filter. Mount it with a `key` per filter so each filter starts fresh. */
export default function Feed({ filter, profile, setProfile, savedIds, coords, actions }) {
  const { cards, loading, error, done, loadMore } = useFeed(profile, setProfile, filter, coords);
  const sentinel = useRef(null);

  // Re-created whenever the card count changes, so if the sentinel is still on
  // screen after a short batch the observer fires again and keeps loading.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !error) loadMore();
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length, error, done, loadMore]);

  return (
    <>
      <div className="feed">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            liked={Boolean(profile.likes[card.id])}
            saved={savedIds.has(card.id)}
            collections={profile.collections}
            {...actions}
          />
        ))}
      </div>

      <div ref={sentinel} className="sentinel" aria-hidden="true" />

      {loading && <p className="status">Finding something interesting…</p>}
      {done && <p className="status">{endMessage(filter, cards.length > 0)}</p>}
      {error && (
        <div className="status error" role="alert">
          <p>{error}</p>
          <button type="button" className="action" onClick={loadMore}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}

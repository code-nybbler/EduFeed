import { useEffect, useRef } from 'react';
import Card from './Card.jsx';

export default function Feed({ feed, profile, onLike, onSave, onOpen }) {
  const { cards, loading, error, loadMore } = feed;
  const sentinel = useRef(null);

  // Re-created whenever the card count changes, so if the sentinel is still on
  // screen after a short batch the observer fires again and keeps loading.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !error) loadMore();
      },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cards.length, error, loadMore]);

  return (
    <>
      <div className="feed">
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            liked={Boolean(profile.likes[card.id])}
            saved={Boolean(profile.saved[card.id])}
            onLike={onLike}
            onSave={onSave}
            onOpen={onOpen}
          />
        ))}
      </div>

      <div ref={sentinel} className="sentinel" aria-hidden="true" />

      {loading && <p className="status">Finding something interesting…</p>}
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

import { memo, useEffect, useRef } from 'react';
import CollectionPicker from './CollectionPicker.jsx';
import { formatDistance } from '../format.js';

const SECTION_LABEL = {
  event: 'On this day',
  birth: 'Born on this day',
  death: 'Died on this day',
};

const VIEW_DELAY_MS = 1200; // how long a card must be on screen to count as read

function yearsAgoLabel(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n === 1 ? '1 year ago' : `${n.toLocaleString('en-US')} years ago`;
}

function distanceLabel(meters) {
  const miles = typeof navigator !== 'undefined' && /^en-US/i.test(navigator.language ?? '');
  const text = formatDistance(meters, miles);
  return text ? `📍 ${text} away` : '';
}

function canPlay(mime) {
  if (typeof document === 'undefined' || !mime) return true;
  try {
    return document.createElement('video').canPlayType(mime) !== '';
  } catch {
    return true;
  }
}

// One video plays at a time.
function pauseOthers(event) {
  document.querySelectorAll('video').forEach((v) => {
    if (v !== event.currentTarget) v.pause();
  });
}

/** Calls `onView(card)` once the card has been mostly on screen for a moment. Drives the daily streak. */
function useViewed(ref, card, onView) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !onView || typeof IntersectionObserver === 'undefined') return undefined;
    let timer = null;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => {
            onView(card);
            observer.disconnect();
          }, VIEW_DELAY_MS);
        } else {
          clearTimeout(timer);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ref, card, onView]);
}

function Media({ card }) {
  if (card.mediaType === 'video' && card.mediaUrl && canPlay(card.mime)) {
    return (
      <video
        className="card-image"
        controls
        playsInline
        preload="none"
        poster={card.image ?? undefined}
        src={card.mediaUrl}
        onPlay={pauseOthers}
      />
    );
  }
  // Images, and videos this browser can't play (shown as a still with a link to Commons).
  return <img className="card-image" src={card.image} alt={card.title} loading="lazy" decoding="async" />;
}

function Credit({ card }) {
  const { artist, license, licenseUrl } = card.credit ?? {};
  return (
    <p className="attribution">
      {card.mediaType === 'video' ? 'Video' : 'Image'}
      {artist ? ` by ${artist}` : ''}
      {license && (
        <>
          {' · '}
          {licenseUrl ? (
            <a href={licenseUrl} target="_blank" rel="noopener noreferrer">
              {license}
            </a>
          ) : (
            license
          )}
        </>
      )}
      {' · '}
      <a href={card.url} target="_blank" rel="noopener noreferrer">
        Wikimedia Commons
      </a>
    </p>
  );
}

function WikipediaCredit() {
  return (
    <p className="attribution">
      From Wikipedia, available under{' '}
      <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
        CC BY-SA 4.0
      </a>
    </p>
  );
}

function Card({
  card,
  liked,
  saved,
  collections,
  onLike,
  onSave,
  onOpen,
  onTag,
  onView,
  onToggleCollection,
  onCreateCollection,
}) {
  const ref = useRef(null);
  useViewed(ref, card, onView);

  // Cards saved by the first version of the app have no `kind`.
  const kind = card.kind ?? 'article';
  const tags = (card.categories ?? []).slice(0, 4);
  const away = Number.isFinite(card.distanceM) ? distanceLabel(card.distanceM) : '';

  return (
    <article ref={ref} className={`card card-${kind}`}>
      {kind === 'media' ? (
        <Media card={card} />
      ) : (
        card.image && <img className="card-image" src={card.image} alt="" loading="lazy" decoding="async" />
      )}

      <div className="card-body">
        {kind === 'otd' && (
          <>
            <p className="kicker">
              {SECTION_LABEL[card.section] ?? SECTION_LABEL.event} · {card.dateLabel}
            </p>
            <h2 className="card-title otd-year">
              {card.yearLabel}
              {yearsAgoLabel(card.yearsAgo) && <span className="years-ago">{yearsAgoLabel(card.yearsAgo)}</span>}
            </h2>
          </>
        )}
        {kind === 'media' && (
          <p className="kicker">
            Wikimedia Commons · {card.mediaType === 'video' ? 'Video' : 'Image'}
            {away && ` · ${away}`}
          </p>
        )}
        {kind === 'article' && away && <p className="kicker">{away}</p>}
        {kind !== 'otd' && <h2 className="card-title">{card.title}</h2>}

        <p className="card-extract">{card.extract}</p>

        {kind === 'otd' && card.related?.length > 0 && (
          <p className="related">
            Read about:{' '}
            {card.related.map((r, i) => (
              <span key={r.url}>
                {i > 0 && ', '}
                <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(card)}>
                  {r.title}
                </a>
              </span>
            ))}
          </p>
        )}

        {tags.length > 0 && (
          <ul className="chips" aria-label="Tags">
            {tags.map((t) => (
              <li key={t}>
                <button type="button" className="chip" title={`More posts tagged "${t}"`} onClick={() => onTag?.(t)}>
                  {t}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="card-actions">
          <button
            type="button"
            className={`action${liked ? ' on' : ''}`}
            aria-pressed={liked}
            onClick={() => onLike(card)}
          >
            {liked ? '♥ Liked' : '♡ Like'}
          </button>
          <button
            type="button"
            className={`action${saved ? ' on' : ''}`}
            aria-pressed={saved}
            onClick={() => onSave(card)}
          >
            {saved ? '★ Saved' : '☆ Save'}
          </button>
          {onToggleCollection && (
            <CollectionPicker
              card={card}
              collections={collections ?? {}}
              onToggle={onToggleCollection}
              onCreate={onCreateCollection}
            />
          )}
          {card.url && kind !== 'otd' && (
            <a
              className="action link"
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpen(card)}
            >
              {kind === 'media' ? 'View on Commons ↗' : 'Read more ↗'}
            </a>
          )}
        </div>

        {kind === 'media' ? <Credit card={card} /> : <WikipediaCredit />}
      </div>
    </article>
  );
}

export default memo(Card);

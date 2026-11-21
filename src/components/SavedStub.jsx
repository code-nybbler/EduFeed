const MESSAGE = {
  loading: 'Loading…',
  failed: "Couldn't load this post. It's still saved: check your connection and try again.",
  missing: 'This post is no longer available.',
};
const LIKED_FAILED = "Couldn't load this post. It's still in your likes: check your connection and try again.";

// Every Wikipedia and Commons page can be reached by its numeric id.
const linkFor = (record) =>
  record.kind === 'media'
    ? { href: `https://commons.wikimedia.org/?curid=${String(record.id).replace(/^commons:/, '')}`, label: 'Wikimedia Commons' }
    : { href: `https://en.wikipedia.org/?curid=${record.id}`, label: 'Wikipedia' };

/** Stands in for a saved (or liked) post whose full card isn't available (yet). Always offers a way to remove it. */
export default function SavedStub({ record, state, onRemove, mode = 'saved' }) {
  const liked = mode === 'liked';
  const link = linkFor(record);
  return (
    <article className="card card-stub" aria-busy={state === 'loading'}>
      <div className="card-body">
        <h2 className="card-title">{record.title}</h2>
        <p className="card-extract stub-message">{state === 'failed' && liked ? LIKED_FAILED : (MESSAGE[state] ?? MESSAGE.loading)}</p>
        <div className="card-actions">
          <button type="button" className="action on" onClick={() => onRemove(record.id)}>
            {liked ? '♥ Liked' : '★ Saved'}
          </button>
          {state !== 'loading' && (
            <a className="action link" href={link.href} target="_blank" rel="noopener noreferrer">
              Open on {link.label} ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

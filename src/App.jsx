import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './components/Card.jsx';
import CategoryBar from './components/CategoryBar.jsx';
import CollectionBar from './components/CollectionBar.jsx';
import Feed from './components/Feed.jsx';
import SavedStub from './components/SavedStub.jsx';
import StreakBadge from './components/StreakBadge.jsx';
import { remember } from './cardCache.js';
import { useSavedCards } from './useSavedCards.js';
import { ALL, filterKey, tagFilter } from './filters.js';
import { loadProfile, persistProfile } from './storage.js';
import { useGeolocation } from './useGeolocation.js';
import {
  addToCollection,
  collectionRecords,
  createCollection,
  deleteCollection,
  personalRatio,
  recordOpen,
  removeFromCollection,
  renameCollection,
  setSetting,
  toggleLike,
  toggleSave,
  touchStreak,
} from './profile.js';

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [view, setView] = useState('feed');
  const [filter, setFilter] = useState(ALL);
  const [collectionId, setCollectionId] = useState('all');
  const geo = useGeolocation();
  const viewed = useRef(new Set()); // cards already counted toward today's streak this session

  useEffect(() => persistProfile(profile), [profile]);

  // If the user opted in to nearby posts and already granted permission, pick location up again
  // quietly. This never shows a permission prompt.
  useEffect(() => {
    if (profile.settings.nearby) geo.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on first load
  }, []);

  const onLike = useCallback((card) => setProfile((p) => toggleLike(p, card)), []);
  const onSave = useCallback((card) => {
    remember(card); // we have the full card now, so the Saved tab won't need to fetch it
    setProfile((p) => toggleSave(p, card));
  }, []);
  // For saved posts that couldn't be loaded: only the id is known.
  const onUnsave = useCallback((id) => setProfile((p) => toggleSave(p, { id, categories: [] })), []);
  const onOpen = useCallback((card) => setProfile((p) => recordOpen(p, card)), []);

  const onView = useCallback((card) => {
    if (viewed.current.has(card.id)) return;
    viewed.current.add(card.id);
    setProfile((p) => touchStreak(p));
  }, []);

  const onToggleCollection = useCallback(
    (card, id) => {
      remember(card);
      setProfile((p) =>
        p.collections[id]?.cardIds.includes(card.id)
          ? removeFromCollection(p, id, card.id)
          : addToCollection(p, id, card)
      );
    },
    []
  );

  // From a card's picker: make the collection and put that card in it.
  const onCreateCollection = useCallback(
    (name, card) => {
      if (card) remember(card);
      setProfile((p) => {
        const { profile: next, id } = createCollection(p, name);
        return id && card ? addToCollection(next, id, card) : next;
      });
    },
    []
  );

  const pickFilter = useCallback(
    async (next) => {
      setView('feed');
      if (next.type === 'nearby' && !geo.coords) {
        const here = await geo.request(); // shows the browser's permission prompt the first time
        if (!here) return; // the reason is shown in the notice below the header
      }
      setFilter((prev) => (filterKey(prev) === filterKey(next) ? prev : next));
      window.scrollTo({ top: 0 });
    },
    [geo.coords, geo.request]
  );

  const onTag = useCallback((tag) => pickFilter(tagFilter(tag)), [pickFilter]);

  const actions = useMemo(
    () => ({ onLike, onSave, onOpen, onTag, onView, onToggleCollection, onCreateCollection }),
    [onLike, onSave, onOpen, onTag, onView, onToggleCollection, onCreateCollection]
  );

  // ---------- Saved tab ----------
  const activeCollection = profile.collections[collectionId] ? collectionId : 'all';
  const savedRecords = useMemo(() => [...profile.saved].reverse(), [profile.saved]); // newest first
  const savedIds = useMemo(() => new Set(profile.saved.map((r) => r.id)), [profile.saved]);
  const shownRecords = useMemo(
    () =>
      activeCollection === 'all'
        ? savedRecords
        : collectionRecords({ saved: profile.saved, collections: profile.collections }, activeCollection),
    [activeCollection, savedRecords, profile.saved, profile.collections]
  );
  const { items, retry, anyFailed } = useSavedCards(shownRecords, view === 'saved');

  const createFromBar = (name) => {
    const { profile: next, id } = createCollection(profile, name);
    setProfile(next);
    if (id) setCollectionId(id);
  };

  const tailored = Math.round(personalRatio(profile) * 100);

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1 className="brand">EduFeed</h1>
          <StreakBadge streak={profile.streak} />
          <nav className="tabs" aria-label="Views">
            <button
              type="button"
              className={`tab${view === 'feed' ? ' active' : ''}`}
              aria-current={view === 'feed' ? 'page' : undefined}
              onClick={() => setView('feed')}
            >
              Feed
            </button>
            <button
              type="button"
              className={`tab${view === 'saved' ? ' active' : ''}`}
              aria-current={view === 'saved' ? 'page' : undefined}
              onClick={() => {
                setView('saved');
                window.scrollTo({ top: 0 });
              }}
            >
              Saved ({savedRecords.length})
            </button>
          </nav>
        </div>
        <CategoryBar filter={filter} onPick={pickFilter} locating={geo.asking} />
      </header>

      <main className="main">
        {geo.error && (
          <div className="notice" role="alert">
            <span>{geo.error}</span>
            <button type="button" className="linkish" onClick={geo.clearError}>
              Dismiss
            </button>
          </div>
        )}

        {/* The feed stays mounted (just hidden) so it and its scroll position survive a visit to Saved. */}
        <div hidden={view !== 'feed'}>
          {filter.type === 'all' && (
            <p className="tailoring">
              {tailored === 0
                ? 'Like or save things you enjoy and your feed will start to follow your curiosity.'
                : `About ${tailored}% of each batch is now chosen from what you've liked.`}
            </p>
          )}

          {filter.type === 'tag' && (
            <div className="banner">
              <span>
                Posts tagged <strong>{filter.tag}</strong>
              </span>
              <button type="button" className="linkish" onClick={() => pickFilter(ALL)}>
                ✕ Back to For you
              </button>
            </div>
          )}

          {filter.type === 'nearby' && (
            <div className="banner">
              <span>Articles and photos within 10 km of you, nearest first.</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={profile.settings.nearby}
                  onChange={(e) => setProfile((p) => setSetting(p, 'nearby', e.target.checked))}
                />
                Also mix nearby places into For you
              </label>
            </div>
          )}

          <Feed
            key={filterKey(filter)}
            filter={filter}
            profile={profile}
            setProfile={setProfile}
            savedIds={savedIds}
            coords={geo.coords}
            actions={actions}
          />
        </div>

        {view === 'saved' && (
          <>
            <CollectionBar
              collections={profile.collections}
              savedCount={savedRecords.length}
              active={activeCollection}
              onSelect={setCollectionId}
              onCreate={createFromBar}
              onRename={(id, name) => setProfile((p) => renameCollection(p, id, name))}
              onDelete={(id) => {
                setProfile((p) => deleteCollection(p, id));
                setCollectionId('all');
              }}
            />
            {anyFailed && (
              <div className="notice" role="alert">
                <span>Some saved posts couldn't be loaded.</span>
                <button type="button" className="linkish" onClick={retry}>
                  Try again
                </button>
              </div>
            )}
            <div className="feed">
              {items.length === 0 && (
                <p className="status">
                  {activeCollection === 'all'
                    ? 'Nothing saved yet. Tap ☆ Save on anything you want to come back to.'
                    : 'This collection is empty. Tap 📁 Collect on any post to add it.'}
                </p>
              )}
              {items.map(({ record, card, state }) =>
                card ? (
                  <Card
                    key={record.id}
                    card={card}
                    liked={Boolean(profile.likes[record.id])}
                    saved
                    collections={profile.collections}
                    {...actions}
                  />
                ) : (
                  <SavedStub key={record.id} record={record} state={state} onRemove={onUnsave} />
                )
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

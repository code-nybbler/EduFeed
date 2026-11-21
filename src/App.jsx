import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './components/Card.jsx';
import CategoryBar from './components/CategoryBar.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import CollectionBar from './components/CollectionBar.jsx';
import Feed from './components/Feed.jsx';
import SavedStub from './components/SavedStub.jsx';
import SearchBar from './components/SearchBar.jsx';
import ShowMore from './components/ShowMore.jsx';
import StreakBadge from './components/StreakBadge.jsx';
import SyncStatus from './components/SyncStatus.jsx';
import { remember } from './cardCache.js';
import { useSavedCards } from './useSavedCards.js';
import { useSync } from './useSync.js';
import { ALL, cleanQuery, filterKey, searchFilter, tagFilter } from './filters.js';
import { loadProfile, persistProfile } from './storage.js';
import { useGeolocation } from './useGeolocation.js';
import {
  addToCollection,
  collectionRecords,
  createCollection,
  deleteCollection,
  likedRecords,
  personalRatio,
  recordOpen,
  removeFromCollection,
  renameCollection,
  setSetting,
  toggleLike,
  toggleSave,
  touchStreak,
} from './profile.js';

const PAGE_SIZE = 20; // saved or liked posts fetched and shown at a time

// `syncAdapter`: leave out for Firebase, `null` to switch syncing off, or an object to use instead (tests).
export default function App({ syncAdapter, syncDebounceMs } = {}) {
  const [profile, setProfile] = useState(loadProfile);
  const [view, setView] = useState('feed');
  const [filter, setFilter] = useState(ALL);
  const [collectionId, setCollectionId] = useState('all');
  const [savedLimit, setSavedLimit] = useState(PAGE_SIZE);
  const [likedLimit, setLikedLimit] = useState(PAGE_SIZE);
  // Posts unliked during this visit to the Liked tab stay listed (unliked) so a slip can be undone.
  const [lingering, setLingering] = useState({});
  const geo = useGeolocation();
  const cloud = useSync(profile, setProfile, { adapter: syncAdapter, debounceMs: syncDebounceMs });
  const viewed = useRef(new Set()); // cards already counted toward today's streak this session

  useEffect(() => persistProfile(profile), [profile]);

  // If the user opted in to nearby posts and already granted permission, pick location up again
  // quietly. This never shows a permission prompt.
  useEffect(() => {
    if (profile.settings.nearby) geo.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on first load
  }, []);

  const onLike = useCallback((card) => {
    remember(card); // we have the full card now, so the Liked tab won't need to fetch it
    setProfile((p) => toggleLike(p, card));
  }, []);
  const onSave = useCallback((card) => {
    remember(card); // we have the full card now, so the Saved tab won't need to fetch it
    setProfile((p) => toggleSave(p, card));
  }, []);
  // For saved posts that couldn't be loaded: only the id is known.
  const onUnsave = useCallback((id) => setProfile((p) => toggleSave(p, { id, categories: [] })), []);
  // For liked posts that couldn't be loaded: only the id is known. Never turns a like ON by accident.
  const onUnlikeId = useCallback((id) => setProfile((p) => (p.likes[id] ? toggleLike(p, { id, categories: [] }) : p)), []);
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

  // An empty search goes back to For you, but only if a search is what is showing.
  const onSearch = useCallback(
    (text) => {
      const query = cleanQuery(text);
      if (query) pickFilter(searchFilter(query));
      else if (filter.type === 'search') pickFilter(ALL);
    },
    [pickFilter, filter.type]
  );

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
  // Only the first page is fetched and shown; "Show more" adds the next. Starts over when the tab or collection changes.
  useEffect(() => setSavedLimit(PAGE_SIZE), [view, activeCollection]);
  const shownPage = useMemo(() => shownRecords.slice(0, savedLimit), [shownRecords, savedLimit]);
  const { items, retry, anyFailed } = useSavedCards(shownPage, view === 'saved');

  // ---------- Liked tab ----------
  useEffect(() => {
    if (view === 'liked') return;
    setLikedLimit(PAGE_SIZE);
    setLingering((l) => (Object.keys(l).length ? {} : l));
  }, [view]);

  const likedAll = useMemo(() => likedRecords(profile), [profile.likes, profile.saved]);
  const likedList = useMemo(() => {
    const present = new Set(likedAll.map((r) => String(r.id)));
    const extra = Object.values(lingering).filter((r) => !present.has(String(r.id)));
    // A post that was unliked and liked again keeps its place instead of jumping to the top.
    const base = likedAll.map((r) => (lingering[String(r.id)] ? { ...r, at: lingering[String(r.id)].at } : r));
    return extra.length || base.some((r, i) => r !== likedAll[i]) ? [...base, ...extra].sort((a, b) => b.at - a.at) : likedAll;
  }, [likedAll, lingering]);
  const likedShown = useMemo(() => likedList.slice(0, likedLimit), [likedList, likedLimit]);
  const liked = useSavedCards(likedShown, view === 'liked');
  const likedActions = useMemo(
    () => ({
      ...actions,
      onLike: (card) => {
        const record = likedList.find((r) => String(r.id) === String(card.id));
        if (record && profile.likes[card.id]) setLingering((l) => ({ ...l, [String(card.id)]: record }));
        onLike(card);
      },
    }),
    [actions, likedList, profile.likes, onLike]
  );

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
          <SyncStatus status={cloud.status} />
          <SearchBar active={filter.type === 'search' ? filter.query : ''} onSearch={onSearch} />
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
            <button
              type="button"
              className={`tab${view === 'liked' ? ' active' : ''}`}
              aria-current={view === 'liked' ? 'page' : undefined}
              onClick={() => {
                setView('liked');
                window.scrollTo({ top: 0 });
              }}
            >
              Liked ({Object.keys(profile.likes).length})
            </button>
          </nav>
          {cloud.canSignIn && cloud.account !== undefined && (
            <AccountMenu
              account={cloud.account}
              busy={cloud.busy}
              onSignIn={cloud.signIn}
              onSignOut={cloud.signOut}
            />
          )}
        </div>
        <CategoryBar filter={filter} onPick={pickFilter} locating={geo.asking} />
      </header>

      <main className="main">
        {cloud.authError && (
          <div className="notice" role="alert">
            <span>{cloud.authError}</span>
            <button type="button" className="linkish" onClick={cloud.clearAuthError}>
              Dismiss
            </button>
          </div>
        )}

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

          {filter.type === 'search' && (
            <div className="banner">
              <span>
                Results for <strong>“{filter.query}”</strong>
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
            <ShowMore left={shownRecords.length - shownPage.length} onClick={() => setSavedLimit((n) => n + PAGE_SIZE)} />
          </>
        )}

        {view === 'liked' && (
          <>
            {liked.anyFailed && (
              <div className="notice" role="alert">
                <span>Some liked posts couldn't be loaded.</span>
                <button type="button" className="linkish" onClick={liked.retry}>
                  Try again
                </button>
              </div>
            )}
            <div className="feed">
              {likedList.length === 0 && (
                <p className="status">Nothing liked yet. Tap ♡ Like on anything you enjoy: your feed learns from it.</p>
              )}
              {liked.items.map(({ record, card, state }) =>
                card ? (
                  <Card
                    key={record.id}
                    card={card}
                    liked={Boolean(profile.likes[record.id])}
                    saved={savedIds.has(record.id)}
                    collections={profile.collections}
                    {...likedActions}
                  />
                ) : (
                  <SavedStub key={record.id} record={record} state={state} mode="liked" onRemove={onUnlikeId} />
                )
              )}
            </div>
            <ShowMore left={likedList.length - likedShown.length} onClick={() => setLikedLimit((n) => n + PAGE_SIZE)} />
          </>
        )}
      </main>
    </div>
  );
}

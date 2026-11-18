import { useCallback, useEffect, useState } from 'react';
import Card from './components/Card.jsx';
import Feed from './components/Feed.jsx';
import { useFeed } from './useFeed.js';
import {
  loadProfile,
  persistProfile,
  personalRatio,
  recordOpen,
  toggleLike,
  toggleSave,
} from './profile.js';

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [view, setView] = useState('feed');
  const feed = useFeed(profile, setProfile);

  useEffect(() => persistProfile(profile), [profile]);

  const onLike = useCallback((card) => setProfile((p) => toggleLike(p, card)), []);
  const onSave = useCallback((card) => setProfile((p) => toggleSave(p, card)), []);
  const onOpen = useCallback((card) => setProfile((p) => recordOpen(p, card)), []);

  const savedCards = Object.values(profile.saved).reverse();
  const tailored = Math.round(personalRatio(profile) * 100);

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">Learning Feed</h1>
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
            Saved ({savedCards.length})
          </button>
        </nav>
      </header>

      <main className="main">
        {/* Kept mounted (just hidden) so the feed and its scroll state survive tab switches. */}
        <div hidden={view !== 'feed'}>
          <p className="tailoring">
            {tailored === 0
              ? 'Like or save things you enjoy and your feed will start to follow your curiosity.'
              : `About ${tailored}% of each batch is now chosen from what you've liked.`}
          </p>
          <Feed feed={feed} profile={profile} onLike={onLike} onSave={onSave} onOpen={onOpen} />
        </div>

        {view === 'saved' && (
          <div className="feed">
            {savedCards.length === 0 && <p className="status">Nothing saved yet. Tap ☆ Save on anything you want to come back to.</p>}
            {savedCards.map((card) => (
              <Card
                key={card.id}
                card={card}
                liked={Boolean(profile.likes[card.id])}
                saved
                onLike={onLike}
                onSave={onSave}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

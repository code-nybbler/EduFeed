import { useEffect, useState } from 'react';
import { MAX_QUERY } from '../filters.js';

/**
 * Search box for the header. `active` is the query currently being shown ('' when no search is
 * open): the box follows it, so choosing a category or going back to "For you" clears the text.
 */
export default function SearchBar({ active, onSearch }) {
  const [draft, setDraft] = useState(active);
  useEffect(() => setDraft(active), [active]);

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft);
      }}
    >
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Search Wikipedia and Commons"
        aria-label="Search"
        maxLength={MAX_QUERY}
        enterKeyHint="search"
        autoComplete="off"
      />
      <button type="submit" className="search-go" aria-label="Search" title="Search">
        <span aria-hidden="true">🔍</span>
      </button>
    </form>
  );
}

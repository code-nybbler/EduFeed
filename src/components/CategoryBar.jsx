import { ALL, CATEGORIES, NEARBY, categoryFilter } from '../filters.js';

const ITEMS = [
  { id: 'all', label: 'For you', filter: ALL },
  { id: 'nearby', label: '📍 Near me', filter: NEARBY },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, filter: categoryFilter(c.id) })),
];

/** Scrollable row of category buttons, part of the fixed header. */
export default function CategoryBar({ filter, onPick, locating }) {
  // A tag feed isn't one of the buttons, so none is highlighted for it.
  const active = filter.type === 'category' ? filter.id : filter.type;

  return (
    <nav className="catbar" aria-label="Categories">
      <ul>
        {ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`cat${active === item.id ? ' active' : ''}`}
              aria-pressed={active === item.id}
              disabled={locating && item.id === 'nearby'}
              onClick={() => onPick(item.filter)}
            >
              {item.label}
              {locating && item.id === 'nearby' ? '…' : ''}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

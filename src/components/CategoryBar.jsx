import { useEffect, useRef } from 'react';
import {
  ALL,
  NEARBY,
  categoryById,
  categoryFilter,
  childrenOf,
  topLevelCategories,
  topLevelOf,
} from '../filters.js';

const ITEMS = [
  { id: 'all', label: 'For you', filter: ALL },
  { id: 'nearby', label: '📍 Near me', filter: NEARBY },
  ...topLevelCategories().map((c) => ({ id: c.id, label: c.label, filter: categoryFilter(c.id) })),
];

/**
 * Scrollable row of category buttons, part of the fixed header. A category with
 * sub-categories (World, with its regions) shows a second row under it while it,
 * or one of its sub-categories, is selected.
 */
export default function CategoryBar({ filter, onPick, locating }) {
  const current = filter.type === 'category' ? filter.id : null;
  // A tag feed isn't one of the buttons, so none is highlighted for it.
  const active = current ? topLevelOf(current) : filter.type;
  const children = current ? childrenOf(active) : [];
  const parent = children.length > 0 ? categoryById(active) : null;
  const bar = useRef(null);

  // With this many buttons the row scrolls, so keep the selected one in view
  // (this also scrolls the row back to the start when the user returns to "For you").
  useEffect(() => {
    const row = bar.current;
    const button = row?.querySelector('.cat.active');
    if (!row || !button) return;
    const target = button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2;
    if (typeof row.scrollTo === 'function') row.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [active]);

  return (
    <>
      <nav className="catbar" aria-label="Categories" ref={bar}>
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

      {parent && (
        <nav className="catbar sub" aria-label={`${parent.label} subcategories`}>
          <ul>
            <li>
              <button
                type="button"
                className={`subcat${current === parent.id ? ' active' : ''}`}
                aria-pressed={current === parent.id}
                onClick={() => onPick(categoryFilter(parent.id))}
              >
                {parent.allLabel ?? `All ${parent.label}`}
              </button>
            </li>
            {children.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`subcat${current === c.id ? ' active' : ''}`}
                  aria-pressed={current === c.id}
                  onClick={() => onPick(categoryFilter(c.id))}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </>
  );
}

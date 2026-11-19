import { useState } from 'react';

/**
 * A "Collect" button plus, when open, a panel for ticking the collections a
 * card belongs to or making a new one. Renders into the card's action row: the
 * panel takes the full width of the next line.
 */
export default function CollectionPicker({ card, collections, onToggle, onCreate }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const list = Object.values(collections).sort((a, b) => a.createdAt - b.createdAt);
  const memberOf = list.filter((c) => c.cardIds.includes(card.id)).length;

  const submit = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name, card);
    setName('');
  };

  return (
    <>
      <button
        type="button"
        className={`action${memberOf ? ' on' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        📁 {memberOf ? `In ${memberOf}` : 'Collect'}
      </button>

      {open && (
        <div className="picker-panel" role="group" aria-label="Collections">
          {list.length === 0 && <p className="picker-empty">No collections yet. Make your first one below.</p>}
          {list.map((c) => (
            <label key={c.id} className="picker-row">
              <input type="checkbox" checked={c.cardIds.includes(card.id)} onChange={() => onToggle(card, c.id)} />
              <span>{c.name}</span>
            </label>
          ))}
          <form className="picker-new" onSubmit={submit}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New collection"
              maxLength={40}
              aria-label="New collection name"
            />
            <button type="submit" className="action">
              Add
            </button>
          </form>
        </div>
      )}
    </>
  );
}

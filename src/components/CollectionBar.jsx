import { useState } from 'react';

/** Collection chips for the Saved tab, with create, rename and delete. */
export default function CollectionBar({ collections, savedCount, active, onSelect, onCreate, onRename, onDelete }) {
  const [mode, setMode] = useState(null); // null | 'new' | 'rename'
  const [name, setName] = useState('');

  const list = Object.values(collections).sort((a, b) => a.createdAt - b.createdAt);
  const current = collections[active];

  const start = (next, initial = '') => {
    setMode(next);
    setName(initial);
  };

  const submit = (event) => {
    event.preventDefault();
    if (name.trim()) {
      if (mode === 'new') onCreate(name);
      else onRename(active, name);
    }
    setMode(null);
    setName('');
  };

  const remove = () => {
    if (window.confirm(`Delete "${current.name}"? The posts in it stay in Saved.`)) onDelete(active);
  };

  return (
    <div className="collections">
      <ul className="pills">
        <li>
          <button type="button" className={`pill${active === 'all' ? ' active' : ''}`} onClick={() => onSelect('all')}>
            All saved ({savedCount})
          </button>
        </li>
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`pill${active === c.id ? ' active' : ''}`}
              onClick={() => onSelect(c.id)}
            >
              {c.name} ({c.cardIds.length})
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="pill add" onClick={() => start('new')}>
            ＋ New collection
          </button>
        </li>
      </ul>

      {mode ? (
        <form className="collection-form" onSubmit={submit}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            maxLength={40}
            aria-label="Collection name"
          />
          <button type="submit" className="action">
            {mode === 'new' ? 'Create' : 'Save'}
          </button>
          <button type="button" className="action" onClick={() => setMode(null)}>
            Cancel
          </button>
        </form>
      ) : (
        current && (
          <div className="collection-tools">
            <button type="button" className="linkish" onClick={() => start('rename', current.name)}>
              Rename
            </button>
            <button type="button" className="linkish" onClick={remove}>
              Delete collection
            </button>
          </div>
        )
      )}
    </div>
  );
}

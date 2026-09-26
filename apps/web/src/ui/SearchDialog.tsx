/** Recherche de pays (Ctrl+K) : Entrée sélectionne le pays et cadre la carte dessus. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { toCss } from '../map/colors.ts';
import { useApp } from '../store.ts';
import { KIND_LABELS } from './labels.ts';
import { search, type Searchable } from './search.ts';

export function SearchDialog({ data }: { data: Dataset }) {
  const setOpen = useApp((s) => s.setSearchOpen);
  const select = useApp((s) => s.select);
  const focusOn = useApp((s) => s.focusOn);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () =>
      data.list.map((e) => ({
        index: e.index,
        id: e.id,
        nameFr: e.nameFr,
        name: e.name,
        weight: e.map.stats.population,
      })) satisfies Searchable[],
    [data],
  );
  const results = search(items, query);
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  useEffect(() => {
    input.current?.focus();
  }, []);

  /** Entrée : sélectionne et cadre ; Maj+Entrée : second pays (panneau bilatéral). */
  const choose = (index: number, second = false): void => {
    select(index, second);
    if (!second || useApp.getState().selected === index) focusOn(index);
    setOpen(false);
  };

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <div
        className="search panel"
        role="dialog"
        aria-label="Rechercher un pays"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          type="search"
          placeholder="Rechercher un pays, une entité ou un code (FRA, TWN…)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setCursor(Math.min(results.length - 1, active + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor(Math.max(0, active - 1));
            } else if (e.key === 'Enter' && results[active]) {
              choose(results[active].index, e.shiftKey);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          aria-label="Pays"
        />
        <ul role="listbox">
          {results.map((r, k) => {
            const e = data.byIndex[r.index];
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={k === active}
                className={k === active ? 'active' : ''}
                onMouseEnter={() => setCursor(k)}
                onClick={(e) => choose(r.index, e.shiftKey)}
              >
                {e && <span className="swatch" style={{ background: toCss(e.color) }} />}
                <span>{r.nameFr}</span>
                <span className="muted small">
                  {r.id}
                  {e ? ` · ${KIND_LABELS[e.kind]}` : ''}
                </span>
              </li>
            );
          })}
          {query.trim() !== '' && results.length === 0 && <li className="muted">Aucun résultat</li>}
        </ul>
        <p className="muted small">
          ↑ ↓ pour choisir · Entrée : aller au pays · Maj+Entrée : second pays · Échap : fermer
        </p>
      </div>
    </div>
  );
}

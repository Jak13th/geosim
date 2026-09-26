/**
 * Panneau bas (SPEC §9.1) : journal et graphiques, repliable.
 */
import type { Dataset } from '../data/dataset.ts';
import { useApp } from '../store.ts';
import { ChartsPanel } from './ChartsPanel.tsx';
import { JournalPanel } from './JournalPanel.tsx';

export function BottomPanel({ data }: { data: Dataset }) {
  const tab = useApp((s) => s.bottomTab);
  const setBottom = useApp((s) => s.setBottom);
  return (
    <section className="panel bottom" aria-label="Journal et graphiques" data-bottom-tab={tab}>
      <header className="bottom-head">
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'journal'}
            className={tab === 'journal' ? 'active' : ''}
            onClick={() => setBottom(true, 'journal')}
          >
            Journal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'charts'}
            className={tab === 'charts' ? 'active' : ''}
            onClick={() => setBottom(true, 'charts')}
          >
            Graphiques
          </button>
        </div>
        <button type="button" className="icon" title="Replier" onClick={() => setBottom(false)}>
          ×
        </button>
      </header>
      <div className="bottom-body">
        {tab === 'journal' ? <JournalPanel data={data} /> : <ChartsPanel data={data} />}
      </div>
    </section>
  );
}

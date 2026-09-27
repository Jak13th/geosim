/**
 * Panneau bilatéral A ↔ B (SPEC §9.4) : chaque paramètre bilatéral du catalogue dans les deux
 * sens, avec sa source et son année ; valeurs en direct et éditables (commande du moteur).
 */
import type { Slot } from '@geosim/engine';
import {
  CATALOG,
  CONFIDENCE_LABELS,
  componentLabel,
  enumLabel,
  type ParamDef,
  type ParamValue,
} from '@geosim/shared';
import { useMemo, useState } from 'react';
import type { Dataset, EntityView, PairLookup } from '../data/dataset.ts';
import { formatDataDate, formatNumber, formatQuantity, type ValueContext } from '../format.ts';
import type { LiveSim } from '../sim/mirror.ts';
import { useApp } from '../store.ts';
import { laterPhase, useLive } from './live.ts';
import { namesFor } from './names.ts';
import { ParamEditor } from './ParamEditor.tsx';
import { Linkified, SourceBadge } from './ParamRow.tsx';
import { PairWhy } from './WhyPanel.tsx';

const PAIR_PARAMS = CATALOG.filter((d) => d.scope === 'pair');

/** Valeur bilatérale en texte (vecteurs et listes compris). */
export function formatPairValue(def: ParamDef, v: ParamValue, names: ValueContext): string {
  if (v === null) return '—';
  if (typeof v === 'number') return formatQuantity(v, def.unit === '−100 – +100' ? '' : def.unit);
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'string') return enumLabel(def.id, v);
  if (Array.isArray(v))
    return v.length === 0 ? 'Aucune' : v.map((x) => names.itemName(x) ?? x).join(', ');
  const entries = Object.entries(v).filter(([, x]) => x !== 0);
  if (entries.length === 0) return 'Aucun';
  return entries
    .map(([k, x]) => `${componentLabel(def.id, k)} ${x < 0 ? '—' : formatNumber(x)}`)
    .join(' · ');
}

function Direction({
  def,
  from,
  to,
  lookup,
  runtime,
  names,
  open,
  live,
  data,
}: {
  def: ParamDef;
  from: EntityView;
  to: EntityView;
  lookup: PairLookup | null;
  runtime: boolean;
  names: ValueContext;
  open: boolean;
  live: LiveSim | null;
  data: Dataset;
}) {
  const p = lookup?.provenance ?? null;
  const slot: Slot = { scope: 'pair', param: def.id, from: from.id, to: to.id };
  const base = lookup?.value ?? null;
  const value = live !== null ? live.value(slot) : base;
  const overridden = (live?.layers(slot, base).override ?? null) !== null;
  const locked = live?.isLocked(slot) ?? false;
  return (
    <div className="pair-dir">
      <span className="pair-arrow muted small">
        {from.id} → {to.id}
      </span>
      <span className="param-value">
        {locked && <span title="Verrouillée">🔒 </span>}
        {formatPairValue(def, value, names)}
      </span>
      {overridden ? (
        <span className="src conf-user">modifiée</span>
      ) : p ? (
        <SourceBadge value={p} />
      ) : (
        <span className="src conf-none">
          {runtime ? `phase ${laterPhase(def)}` : lookup ? 'par défaut' : 'absent'}
        </span>
      )}
      {open && live !== null && (
        <div className="pair-editor">
          <ParamEditor def={def} slot={slot} live={live} base={base} names={names} data={data} />
        </div>
      )}
      {open && (
        <dl className="provenance">
          {p ? (
            <>
              <dt>Source</dt>
              <dd>
                <Linkified text={p.source} />
              </dd>
              <dt>Date</dt>
              <dd>{formatDataDate(p.date)}</dd>
              <dt>Confiance</dt>
              <dd>{CONFIDENCE_LABELS[p.confidence]}</dd>
              {p.note && (
                <>
                  <dt>Note</dt>
                  <dd>
                    <Linkified text={p.note} />
                  </dd>
                </>
              )}
            </>
          ) : (
            <>
              <dt>Valeur</dt>
              <dd>
                {runtime
                  ? 'Paramètre dérivé, calculé par le moteur.'
                  : (lookup?.defaultNote ?? 'Absent des données construites.')}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

function PairRow({
  data,
  def,
  a,
  b,
  names,
  live,
}: {
  data: Dataset;
  def: ParamDef;
  a: EntityView;
  b: EntityView;
  names: ValueContext;
  live: LiveSim | null;
}) {
  const [open, setOpen] = useState(false);
  const runtime = data.raw.pairs.runtimeParams.includes(def.id);
  return (
    <div className={`param pair${open ? ' open' : ''}`} data-param={def.id}>
      <button
        type="button"
        className="param-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={def.description}
      >
        <span className="param-label">{def.label}</span>
        <span className="muted small">{def.unit}</span>
      </button>
      <Direction
        def={def}
        from={a}
        to={b}
        lookup={data.pair(def.id, a.id, b.id)}
        runtime={runtime}
        names={names}
        open={open}
        live={live}
        data={data}
      />
      <Direction
        def={def}
        from={b}
        to={a}
        lookup={data.pair(def.id, b.id, a.id)}
        runtime={runtime}
        names={names}
        open={open}
        live={live}
        data={data}
      />
      {open && <p className="muted small">{def.description}</p>}
    </div>
  );
}

export function PairPanel({ data, a, b }: { data: Dataset; a: EntityView; b: EntityView }) {
  const names = useMemo(() => namesFor(data), [data]);
  const swap = useApp((s) => s.swapPair);
  const live = useLive();
  return (
    <div className="params">
      <p className="muted small">
        Paramètres de i vers j, dans les deux sens.{' '}
        <button type="button" className="link" onClick={swap}>
          Inverser A et B
        </button>
      </p>
      {live !== null && <PairWhy a={a} b={b} />}
      {PAIR_PARAMS.map((def) => (
        <PairRow key={def.id} data={data} def={def} a={a} b={b} names={names} live={live} />
      ))}
    </div>
  );
}

/**
 * Ligne de paramètre générée depuis le catalogue : libellé, valeur, badge de source (nom et
 * année, couleur selon la confiance) ; un clic déplie la provenance complète.
 */
import {
  CONFIDENCE_LABELS,
  METHOD_LABELS,
  componentLabel,
  type ParamDef,
  type ParamValue,
  type ResolvedValue,
  type SystemId,
} from '@geosim/shared';
import { useState } from 'react';
import type { ParamLookup } from '../data/dataset.ts';
import { formatDataDate, formatNumber, formatValue, type ValueContext } from '../format.ts';
import { laterPhase } from './live.ts';
import { CONFIDENCE_CLASS, dataYear, sourceName, splitLinks } from './provenance.ts';

const KIND_LABELS: Record<ParamDef['kind'], string> = {
  input: 'levier ou hypothèse',
  state: 'état',
  derived: 'dérivé',
};

const SYSTEM_LABELS: Record<SystemId, string> = {
  map: 'carte',
  demography: 'démographie',
  economy: 'économie',
  budget: 'budget',
  trade: 'commerce',
  markets: 'marchés',
  energy: 'énergie',
  resources: 'ressources',
  politics: 'politique',
  diplomacy: 'diplomatie',
  military: 'forces armées',
  combat: 'combats',
  nuclear: 'nucléaire',
  cyber: 'cyber',
  space: 'espace',
  events: 'événements',
  ai: 'IA',
  health: 'santé',
  climate: 'climat',
  technology: 'technologie',
};

export function Linkified({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, k) =>
        part.href ? (
          <a key={k} href={part.href} target="_blank" rel="noreferrer">
            {part.text}
          </a>
        ) : (
          <span key={k}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function isEstimate(v: Pick<ResolvedValue, 'confidence' | 'method'>): boolean {
  return (
    v.confidence === 'low' ||
    v.confidence === 'assumption' ||
    v.method === 'regional_median' ||
    v.method === 'default'
  );
}

/** Badge de source : nom court et année ; la couleur suit la confiance. */
export function SourceBadge({
  value,
  runtime = false,
}: {
  value: Pick<ResolvedValue, 'source' | 'date' | 'confidence' | 'stale'> | null;
  runtime?: boolean;
}) {
  if (value === null) {
    return <span className="src conf-none">{runtime ? 'moteur' : 'absent'}</span>;
  }
  return (
    <span
      className={`src ${CONFIDENCE_CLASS[value.confidence]}`}
      title={`${value.source} — ${formatDataDate(value.date)} — confiance ${CONFIDENCE_LABELS[value.confidence]}`}
    >
      {sourceName(value.source)} · {dataYear(value.date)}
      {value.stale ? ' ⚠' : ''}
    </span>
  );
}

function vectorUnit(unit: string): string {
  return unit.replace(/ par (domaine|poste|minerai|produit|volet|théâtre|type|zone)$/, '');
}

/** Détail d'une valeur non scalaire (vecteur ou liste longue). */
export function ValueDetail({
  def,
  value,
  names,
}: {
  def: ParamDef;
  value: ParamValue;
  names: ValueContext;
}) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return null;
    const unit = vectorUnit(def.unit);
    const percent = unit.startsWith('%');
    return (
      <ul className="vector">
        {entries.map(([k, v]) => (
          <li key={k}>
            <span className="vector-key">{componentLabel(def.id, k)}</span>
            {percent && (
              <span className="vector-bar" style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
            )}
            <span className="vector-value">
              {formatNumber(v)}
              {percent ? ' %' : ''}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(value) && value.length > 3) {
    return (
      <ul className="list">
        {value.map((item) => (
          <li key={item}>{names.itemName(item) ?? item}</li>
        ))}
      </ul>
    );
  }
  return null;
}

export function inlineValue(def: ParamDef, value: ParamValue, names: ValueContext): string {
  if (Array.isArray(value) && value.length > 3) return `${value.length} éléments`;
  return formatValue(value, def, names);
}

export function ProvenanceDetails({
  def,
  lookup,
  computed,
}: {
  def: ParamDef;
  lookup: ParamLookup;
  /** Le moteur calcule déjà ce paramètre (sinon : phase ultérieure). */
  computed?: boolean;
}) {
  const v = lookup.state === 'value' ? lookup.value : null;
  return (
    <dl className="provenance">
      <dt>Définition</dt>
      <dd>{def.description}</dd>
      {v && (
        <>
          <dt>Source</dt>
          <dd>
            <Linkified text={v.source} />
          </dd>
          <dt>Date</dt>
          <dd>
            {formatDataDate(v.date)}
            {v.stale ? ' — donnée de plus de trois ans' : ''}
          </dd>
          <dt>Confiance</dt>
          <dd>
            <span className={`dot ${CONFIDENCE_CLASS[v.confidence]}`} />{' '}
            {CONFIDENCE_LABELS[v.confidence]}
          </dd>
          <dt>Méthode</dt>
          <dd>{METHOD_LABELS[v.method]}</dd>
          {v.note && (
            <>
              <dt>Note</dt>
              <dd>
                <Linkified text={v.note} />
              </dd>
            </>
          )}
          {v.clampedFrom !== undefined && (
            <>
              <dt>Écrêtage</dt>
              <dd>
                Valeur de la source {formatNumber(v.clampedFrom)}, ramenée à la plage du catalogue
              </dd>
            </>
          )}
        </>
      )}
      {lookup.state === 'runtime' && (
        <>
          <dt>Valeur</dt>
          <dd>
            {computed
              ? 'Calculée par le moteur : valeur initiale calée sur les données, puis simulée.'
              : `Calculée par le moteur à partir de la phase ${laterPhase(def)}.`}
          </dd>
        </>
      )}
      {lookup.state === 'absent' && (
        <>
          <dt>Valeur</dt>
          <dd>Absente des données construites (relance « npm run data »).</dd>
        </>
      )}
      <dt>Catalogue</dt>
      <dd>
        <code>{def.id}</code> · {KIND_LABELS[def.kind]}
        {def.unit ? ` · ${def.unit}` : ''}
        {def.min !== undefined && def.max !== undefined
          ? ` · plage ${formatNumber(def.min)} à ${formatNumber(def.max)}`
          : ''}
        {def.source ? ` · source prévue ${def.source}` : ''}
      </dd>
      <dt>Utilisé par</dt>
      <dd>{def.usedBy.map((s) => SYSTEM_LABELS[s]).join(', ')}</dd>
    </dl>
  );
}

export function ParamRow({
  def,
  lookup,
  names,
}: {
  def: ParamDef;
  lookup: ParamLookup;
  names: ValueContext;
}) {
  const [open, setOpen] = useState(false);
  const v = lookup.state === 'value' ? lookup.value : null;
  const estimate = v !== null && isEstimate(v);
  return (
    <div
      className={`param${open ? ' open' : ''}${estimate ? ' estimate' : ''}`}
      data-param={def.id}
    >
      <button
        type="button"
        className="param-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={def.description}
      >
        <span className="param-label">{def.label}</span>
        <span className="param-value">{v ? inlineValue(def, v.value, names) : '—'}</span>
        <SourceBadge value={v} runtime={lookup.state === 'runtime'} />
      </button>
      {v && <ValueDetail def={def} value={v.value} names={names} />}
      {open && <ProvenanceDetails def={def} lookup={lookup} />}
    </div>
  );
}

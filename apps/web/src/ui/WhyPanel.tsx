/**
 * « Pourquoi ? » d'un pays (SPEC §9.4) : décomposition de la stabilité, du soutien au
 * gouvernement et du risque de coup d'État, et liens avec le monde (gains à l'échange, pressions
 * des sanctions, approvisionnement en énergie, pression de départ des réfugiés), calculés par le
 * moteur à la demande. Appartenances aux blocs en direct, avec adhésion et retrait.
 */
import type { CountryExplanation, Decomposition, Factor, PairExplanation } from '@geosim/engine';
import { useEffect, useMemo, useState } from 'react';
import type { Dataset, EntityView } from '../data/dataset.ts';
import { formatNumber, formatQuantity } from '../format.ts';
import { command, run } from '../sim/client.ts';
import type { LiveSim } from '../sim/mirror.ts';
import { useSim } from '../sim/store.ts';

/** Explication d'un pays, recalculée quand l'état change (5 fois par seconde au plus). */
function useCountryExplanation(entity: string): CountryExplanation | null {
  const version = useSim((s) => s.stateVersion);
  const ready = useSim((s) => s.status.state === 'ready');
  const [result, setResult] = useState<CountryExplanation | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void run((api) => api.explainCountry(entity)).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, entity, version]);
  return result?.entity === entity ? result : null;
}

function signed(x: number): string {
  return `${x >= 0 ? '+' : ''}${formatNumber(x)}`;
}

/** Libellé en minuscule initiale, sauf s'il commence par un sigle (« PIB par habitant »). */
function lowerFirst(label: string): string {
  const second = label.charAt(1);
  return second !== '' && second === second.toUpperCase() && second !== second.toLowerCase()
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Facteurs dont la contribution compte, du plus fort au plus faible. */
function mainFactors(factors: Factor[], threshold = 0.05, max = 8): Factor[] {
  return factors
    .filter((f) => Math.abs(f.contribution ?? 0) >= threshold)
    .sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0))
    .slice(0, max);
}

function DecompositionTable({ d, unit }: { d: Decomposition; unit: string }) {
  const shown = mainFactors(d.factors);
  return (
    <>
      <p className="small">
        {formatQuantity(d.value, unit)} · visée {formatQuantity(d.target, unit)} · départ{' '}
        {formatQuantity(d.anchor, unit)}
        {Math.abs(d.shocks) > 0.05 ? ` · chocs temporaires ${signed(d.shocks)}` : ''}
      </p>
      {shown.length === 0 ? (
        <p className="muted small">Aucun facteur n’a bougé depuis le départ.</p>
      ) : (
        <table className="factors">
          <tbody>
            {shown.map((f) => (
              <tr key={f.id}>
                <th title={f.id}>{f.label}</th>
                <td>{formatQuantity(f.value, f.unit)}</td>
                <td>{signed(f.contribution ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export function CountryWhy({ data, entity }: { data: Dataset; entity: EntityView }) {
  const x = useCountryExplanation(entity.id);
  if (x === null) return null;
  const name = (id: string): string => data.byId.get(id)?.nameFr ?? id;
  const s = x.sanctions;
  const sanctioned = s.finance > 0 || s.tech > 0 || s.elite > 0;
  const departure = x.departure.total - x.departure.start;
  return (
    <section className="why" data-why={entity.id}>
      <h3>Pourquoi ? Stabilité</h3>
      <DecompositionTable d={x.stability} unit="indice" />
      <h3>Soutien au gouvernement</h3>
      <DecompositionTable d={x.approval} unit="%" />
      <h3>Risque de coup d’État</h3>
      <p className="small">
        {formatQuantity(x.coup.risk, '%/an')} ={' '}
        {x.coup.factors
          .map((f) =>
            f.contribution === undefined
              ? `${formatNumber(f.value)} (${lowerFirst(f.label)})`
              : `× ${formatNumber(f.contribution)} (${lowerFirst(f.label)})`,
          )
          .join(' ')}
      </p>
      <h3>Liens avec le monde</h3>
      <table className="factors">
        <tbody>
          <tr>
            <th title="trade.level">Niveau du PIB dû aux échanges (gains à l’échange)</th>
            <td>{signed(100 * (x.tradeLevel - 1))} %</td>
          </tr>
          <tr>
            <th title="energy.shortfall">Importations d’énergie perdues · déjà remplacées</th>
            <td>
              {formatNumber(100 * x.energy.shortfall)} % · {formatNumber(100 * x.energy.replaced)} %
            </td>
          </tr>
          {x.energy.lost.map((l) => (
            <tr key={l.supplier}>
              <th>— approvisionnement perdu : {name(l.supplier)}</th>
              <td>{formatNumber(100 * l.share)} %</td>
            </tr>
          ))}
          {sanctioned && (
            <tr>
              <th title="sanctions">Pressions des sanctions (finance · technologie · élites)</th>
              <td>
                {formatNumber(s.finance)} · {formatNumber(s.tech)} · {formatNumber(s.elite)}
                {s.finance0 + s.tech0 + s.elite0 > 0
                  ? ` (départ ${formatNumber(s.finance0)} · ${formatNumber(s.tech0)} · ${formatNumber(s.elite0)})`
                  : ''}
              </td>
            </tr>
          )}
          {sanctioned && (
            <tr>
              <th title="sanctions.evasion">
                Contournement (réduit par les sanctions secondaires)
              </th>
              <td>{formatNumber(100 * s.evasion)} %</td>
            </tr>
          )}
          <tr>
            <th title="refugees.pressure">Pression de départ des réfugiés (écart au départ)</th>
            <td>{signed(departure)}</td>
          </tr>
          {x.departure.parts
            .filter((p) => p.value > 0.005)
            .map((p) => (
              <tr key={p.id}>
                <th>— {p.label}</th>
                <td>{formatNumber(p.value)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

/** Appartenances en direct ; adhésion et retrait par la commande `bloc` (traités et sanctions communes suivent). */
export function LiveMemberships({
  data,
  entity,
  live,
}: {
  data: Dataset;
  entity: EntityView;
  live: LiveSim;
}) {
  const [choice, setChoice] = useState('');
  const current = live.genericValue(entity.id, 'dip.memberships');
  const list = useMemo(() => (Array.isArray(current) ? current : []), [current]);
  const blocs = data.raw.world.blocs;
  const nameOf = (id: string): string => blocs.find((b) => b.id === id)?.nameFr ?? id;
  const available = blocs.filter((b) => !list.includes(b.id));
  return (
    <div className="memberships" data-memberships={entity.id}>
      {list.length === 0 ? (
        <p className="muted small">Aucune</p>
      ) : (
        <p className="chips">
          {list.map((id) => (
            <span key={id} className="chip">
              {nameOf(id)}{' '}
              <button
                type="button"
                className="icon small"
                title={`Quitter : ${nameOf(id)}`}
                onClick={() =>
                  void command({ type: 'bloc', action: 'leave', entity: entity.id, bloc: id })
                }
              >
                ×
              </button>
            </span>
          ))}
        </p>
      )}
      <p className="small">
        <select
          value={choice}
          aria-label="Adhérer à un bloc"
          onChange={(e) => setChoice(e.target.value)}
        >
          <option value="">Adhérer à…</option>
          {available.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameFr}
            </option>
          ))}
        </select>{' '}
        <button
          type="button"
          disabled={choice === ''}
          onClick={() => {
            if (choice === '') return;
            void command({ type: 'bloc', action: 'join', entity: entity.id, bloc: choice });
            setChoice('');
          }}
        >
          Adhérer
        </button>
      </p>
    </div>
  );
}

/** Affinité de i envers j décomposée (recalculée quand les relations changent). */
function usePairExplanation(from: string, to: string): PairExplanation | null {
  const version = useSim((s) => s.pairVersion);
  const ready = useSim((s) => s.status.state === 'ready');
  const [result, setResult] = useState<{ key: string; value: PairExplanation } | null>(null);
  const key = `${from}>${to}`;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void run((api) => api.explainPair(from, to)).then((r) => {
      if (!cancelled && r !== null) setResult({ key, value: r });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, from, to, key, version]);
  return result?.key === key ? result.value : null;
}

function AffinityTable({ from, to }: { from: EntityView; to: EntityView }) {
  const x = usePairExplanation(from.id, to.id);
  if (x === null) return null;
  const shown = mainFactors(x.factors, 0.05, 14);
  return (
    <div className="affinity" data-affinity={`${from.id}>${to.id}`}>
      <p className="small">
        <strong>
          {from.nameFr} → {to.nameFr}
        </strong>{' '}
        : relation {formatNumber(x.relation)} · affinité {formatNumber(x.affinity)} · résidu de
        calage {signed(x.residual)} · mémoire des chocs {signed(x.memory)}
      </p>
      {shown.length > 0 && (
        <table className="factors">
          <tbody>
            {shown.map((f) => (
              <tr key={f.id}>
                <th title={f.id}>{f.label}</th>
                <td>{signed(f.contribution ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Sanctions larges (finance, commerce, technologie, transport, élites), comme au scénario (b). */
const BROAD_SANCTIONS = {
  trade: 0.5,
  finance: 0.8,
  technology: 0.9,
  energy: 0,
  elites: 0.5,
  transport: 0.3,
} as const;
const NO_SANCTIONS = {
  trade: 0,
  finance: 0,
  technology: 0,
  energy: 0,
  elites: 0,
  transport: 0,
} as const;

export function PairWhy({ a, b }: { a: EntityView; b: EntityView }) {
  const sanction = (from: EntityView, to: EntityView, value: Record<string, number>): void =>
    void command({
      type: 'set',
      slots: [{ scope: 'pair', param: 'pair.sanctions', from: from.id, to: to.id }],
      value,
    });
  return (
    <section className="why pair-why">
      <h3>Pourquoi ? Relation et affinité</h3>
      <p className="muted small">
        La relation converge chaque mois vers l’affinité structurelle, plus le résidu de calage
        (relation de départ − affinité de départ, qui s’efface lentement) et la mémoire des chocs
        (sanctions, guerres, traités, condamnations).
      </p>
      <AffinityTable from={a} to={b} />
      <AffinityTable from={b} to={a} />
      <p className="chips">
        <button type="button" className="chip" onClick={() => sanction(a, b, BROAD_SANCTIONS)}>
          Sanctions larges {a.id} → {b.id}
        </button>
        <button type="button" className="chip" onClick={() => sanction(b, a, BROAD_SANCTIONS)}>
          Sanctions larges {b.id} → {a.id}
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            sanction(a, b, NO_SANCTIONS);
            sanction(b, a, NO_SANCTIONS);
          }}
        >
          Lever les sanctions
        </button>
      </p>
    </section>
  );
}

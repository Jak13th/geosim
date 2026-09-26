/**
 * Ligne de paramètre en direct (SPEC §9.3), générée depuis le catalogue : valeur simulée,
 * marques (modifiée, verrouillée, effets temporaires), provenance de la donnée de départ ; un
 * clic déplie l'éditeur, l'historique et la provenance complète.
 */
import type { Slot } from '@geosim/engine';
import type { ParamDef, ParamValue } from '@geosim/shared';
import { useState } from 'react';
import type { Dataset, ParamLookup } from '../data/dataset.ts';
import { formatValue, type ValueContext } from '../format.ts';
import type { LiveSim } from '../sim/mirror.ts';
import { laterPhase } from './live.ts';
import { ParamEditor } from './ParamEditor.tsx';
import {
  ProvenanceDetails,
  SourceBadge,
  ValueDetail,
  inlineValue,
  isEstimate,
} from './ParamRow.tsx';
import { dataYear } from './provenance.ts';
import { Sparkline, useSeries } from './Sparkline.tsx';

function History({ entity, def, live }: { entity: string; def: ParamDef; live: LiveSim }) {
  const result = useSeries(entity, [def.id]);
  const series = result?.series[def.id] ?? null;
  if (series === null) {
    return (
      <p className="muted small">
        Historique : suivi dès que la simulation ou une modification fait évoluer ce paramètre.
      </p>
    );
  }
  return (
    <div className="history">
      <span className="muted small">Historique mensuel</span>
      <Sparkline values={series} current={live.number(entity, def.id)} label={def.label} />
    </div>
  );
}

/** Badge de provenance : donnée réelle, valeur simulée, modifiée, ou calculée plus tard. */
function LiveBadge({
  def,
  lookup,
  live,
  slot,
  base,
  value,
  names,
}: {
  def: ParamDef;
  lookup: ParamLookup;
  live: LiveSim | null;
  slot: Slot;
  base: ParamValue;
  value: ParamValue;
  names: ValueContext;
}) {
  const provenance = lookup.state === 'value' ? lookup.value : null;
  if (live !== null) {
    const layers = live.layers(slot, base);
    if (layers.override !== null) {
      return (
        <span
          className="src conf-user"
          title={`Modifiée (entrée n° ${layers.override.seq} du journal)`}
        >
          modifiée
        </span>
      );
    }
    if (value === null && base === null) {
      return (
        <span className="src conf-none" title="Calculé par le moteur à partir de cette phase">
          phase {laterPhase(def)}
        </span>
      );
    }
    const data = provenance
      ? ` · donnée : ${formatValue(base, def, names)} (${provenance.source}, ${dataYear(provenance.date)})`
      : '';
    if (live.changed(slot, base)) {
      return (
        <span className="src conf-sim" title={`Valeur simulée${data}`}>
          simulée
        </span>
      );
    }
    if (live.computedAtStart(slot, base)) {
      return (
        <span className="src conf-sim" title={`Valeur calculée par le moteur au départ${data}`}>
          calcul
        </span>
      );
    }
    if (provenance === null) {
      return (
        <span className="src conf-sim" title="Valeur initiale calculée par le moteur">
          calcul
        </span>
      );
    }
  }
  return <SourceBadge value={provenance} runtime={lookup.state === 'runtime'} />;
}

export function LiveRow({
  def,
  slot,
  lookup,
  live,
  data,
  names,
  favorite,
  onToggleFavorite,
}: {
  def: ParamDef;
  slot: Slot;
  /** Donnée de départ et sa provenance. */
  lookup: ParamLookup;
  live: LiveSim | null;
  data: Dataset;
  names: ValueContext;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dataValue = lookup.state === 'value' ? lookup.value.value : null;
  const liveValue = live?.value(slot) ?? null;
  const base = live !== null && slot.scope !== 'pair' ? live.baseValue(slot) : dataValue;
  const value = live !== null ? liveValue : dataValue;
  const estimate = lookup.state === 'value' && isEstimate(lookup.value);
  const locked = live?.isLocked(slot) ?? false;
  const modifiers = live?.layers(slot, base).modifiers.length ?? 0;
  const modified = live?.isModified(slot) ?? false;
  return (
    <div
      className={`param${open ? ' open' : ''}${estimate ? ' estimate' : ''}${modified ? ' modified' : ''}`}
      data-param={def.id}
    >
      <div className="param-line">
        <button
          type="button"
          className="param-head"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          title={def.description}
        >
          <span className="param-label">{def.label}</span>
          {(locked || modifiers > 0) && (
            <span className="param-marks" aria-label="Marques">
              {locked && <span title="Verrouillée : la simulation ne la modifie plus">🔒</span>}
              {modifiers > 0 && (
                <span
                  title={`${modifiers} effet${modifiers > 1 ? 's' : ''} temporaire${modifiers > 1 ? 's' : ''}`}
                >
                  ⏱{modifiers > 1 ? modifiers : ''}
                </span>
              )}
            </span>
          )}
          <span className="param-value">
            {value === null ? '—' : inlineValue(def, value, names)}
          </span>
          <LiveBadge
            def={def}
            lookup={lookup}
            live={live}
            slot={slot}
            base={base}
            value={value}
            names={names}
          />
        </button>
        {onToggleFavorite && (
          <button
            type="button"
            className={`star${favorite ? ' on' : ''}`}
            title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            aria-pressed={favorite ?? false}
            onClick={onToggleFavorite}
          >
            {favorite ? '★' : '☆'}
          </button>
        )}
      </div>
      {value !== null && <ValueDetail def={def} value={value} names={names} />}
      {open && (
        <>
          {live !== null && (
            <ParamEditor def={def} slot={slot} live={live} base={base} names={names} data={data} />
          )}
          {live !== null && slot.scope === 'country' && def.valueType === 'number' && (
            <History entity={slot.entity} def={def} live={live} />
          )}
          <ProvenanceDetails def={def} lookup={lookup} computed={value !== null} />
        </>
      )}
    </div>
  );
}

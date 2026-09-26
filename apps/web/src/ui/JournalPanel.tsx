/**
 * Journal (SPEC §9.6) : événements de la simulation et modifications de l'utilisateur, filtrés
 * par auteur, gravité et pays. Un clic sur une entrée centre la carte sur le pays concerné et
 * déplie « Pourquoi ? » (facteurs explicatifs), les effets appliqués et les coefficients changés.
 */
import type { Effect, JournalEntry, Slot } from '@geosim/engine';
import { paramById, type ParamValue } from '@geosim/shared';
import { useMemo, useState } from 'react';
import type { Dataset } from '../data/dataset.ts';
import {
  formatDate,
  formatNumber,
  formatQuantity,
  formatValue,
  type ValueContext,
} from '../format.ts';
import { useSim } from '../sim/store.ts';
import { useApp, type JournalFilter } from '../store.ts';
import { namesFor } from './names.ts';

/** Entrées affichées au plus (les plus récentes). */
const SHOWN = 400;

const EVENT_LABELS: Record<string, string> = {
  default: 'Défaut souverain',
  default_exit: 'Sortie du défaut (restructuration)',
  bop_crisis: 'Crise de balance des paiements',
  energy_shortage: 'Pénurie d’énergie',
  energy_shortage_end: 'Fin de la pénurie d’énergie',
  famine: 'Famine',
  famine_end: 'Fin de la famine',
  refugee_crisis: 'Crise des réfugiés',
  refugee_crisis_end: 'Fin de la crise des réfugiés',
  protests: 'Manifestations de masse',
  political_crisis: 'Crise politique',
  uprising: 'Soulèvement',
  calm_restored: 'Retour au calme',
  civil_war: 'Guerre civile',
  civil_war_end: 'Fin de la guerre civile',
  early_election: 'Élections anticipées',
  election_alternance: 'Élection : alternance',
  election_continuity: 'Élection : gouvernement reconduit',
  coup: 'Coup d’État',
  junta_transition: 'Transition civile d’une junte',
  succession: 'Succession non planifiée',
  revolution: 'Révolution',
};

const UN_LABELS: Record<string, string> = {
  condemnation: 'condamnation',
  sanctions: 'sanctions',
  ceasefire: 'cessez-le-feu',
  peacekeeping: 'maintien de la paix',
};

const SEVERITY_LABELS = ['information', 'notable', 'important', 'majeur'] as const;

export function slotText(slot: Slot, data: Dataset): string {
  const label = paramById(slot.param)?.label ?? slot.param;
  const name = (id: string): string => data.byId.get(id)?.nameFr ?? id;
  switch (slot.scope) {
    case 'country':
      return `${label} (${name(slot.entity)})`;
    case 'pair':
      return `${label} (${name(slot.from)} → ${name(slot.to)})`;
    case 'zone': {
      const target =
        data.raw.world.chokepoints.find((c) => c.id === slot.target)?.nameFr ?? slot.target;
      return `${label} (${target})`;
    }
    case 'world':
    case 'sim':
      return label;
  }
}

function valueText(slot: Slot, v: ParamValue, names: ValueContext): string {
  const def = paramById(slot.param);
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v)
      .map(([k, x]) => `${k} ${formatNumber(x)}`)
      .join(', ');
  }
  return formatValue(v, def, names);
}

/** Résumé d'une entrée en une ligne. */
export function entrySummary(e: JournalEntry, data: Dataset, names: ValueContext): string {
  if (e.author === 'event') return EVENT_LABELS[e.kind] ?? e.kind;
  const cmd = e.command;
  const slots = cmd && 'slots' in cmd ? cmd.slots : [];
  const target =
    slots.length === 0
      ? ''
      : slots.length === 1 && slots[0]
        ? slotText(slots[0], data)
        : `${paramById(slots[0]?.param ?? '')?.label ?? ''} (${slots.length} emplacements)`;
  switch (cmd?.type) {
    case 'set':
      return `${target} → ${slots[0] ? valueText(slots[0], cmd.value, names) : ''}`;
    case 'adjust':
      return `${target} ${cmd.op === 'add' ? (cmd.amount >= 0 ? '+' : '') : '× '}${formatNumber(cmd.amount)}`;
    case 'reset':
      return `Réinitialisation : ${target}`;
    case 'lock':
      return `${cmd.locked ? 'Verrou' : 'Déverrouillage'} : ${target}`;
    case 'addModifier': {
      const m = cmd.modifier;
      const name = m.label === 'Effet temporaire' ? '' : ` « ${m.label} »`;
      return `Effet temporaire${name} : ${target} ${m.op === 'add' ? (m.amount >= 0 ? '+' : '') : '× '}${formatNumber(m.amount)} pendant ${m.durationDays} j`;
    }
    case 'removeModifier':
      return `Effet temporaire retiré (${cmd.ids.length})`;
    case 'setCoefficient': {
      const c = e.coefficients?.[0];
      return `Coefficient ${cmd.path} : ${c ? `${formatNumber(c.from)} → ` : ''}${formatNumber(cmd.value)}`;
    }
    case 'setModel':
      return `Modèle rechargé : ${e.coefficients?.length ?? 0} coefficient(s) modifié(s)`;
    case 'bloc': {
      const bloc = data.raw.world.blocs.find((b) => b.id === cmd.bloc)?.nameFr ?? cmd.bloc;
      const who = data.byId.get(cmd.entity)?.nameFr ?? cmd.entity;
      return `${who} ${cmd.action === 'join' ? 'adhère à' : 'quitte'} ${bloc}`;
    }
    case 'unResolution': {
      const who = data.byId.get(cmd.target)?.nameFr ?? cmd.target;
      return `ONU : résolution (${UN_LABELS[cmd.kind] ?? cmd.kind}) visant ${who}${e.note ? ` — ${e.note}` : ''}`;
    }
    case 'undo':
      return `Annulation de l’entrée n° ${e.target ?? '?'}`;
    case 'redo':
      return `Rétablissement de l’entrée n° ${e.target ?? '?'}`;
    default:
      return e.kind;
  }
}

function Effects({
  effects,
  data,
  names,
}: {
  effects: Effect[];
  data: Dataset;
  names: ValueContext;
}) {
  return (
    <ul className="effects">
      {effects.map((f, k) => (
        <li key={k}>
          {slotText(f.slot, data)} :{' '}
          {f.modifier !== undefined
            ? 'effet temporaire'
            : `${valueText(f.slot, f.from, names)} → ${valueText(f.slot, f.to, names)}`}
        </li>
      ))}
    </ul>
  );
}

function Details({ e, data, names }: { e: JournalEntry; data: Dataset; names: ValueContext }) {
  return (
    <div className="journal-details">
      {e.factors && e.factors.length > 0 && (
        <>
          <h4>Pourquoi ?</h4>
          <table className="factors">
            <tbody>
              {e.factors.map((f) => (
                <tr key={f.id}>
                  <th title={f.id}>{f.label}</th>
                  <td>{formatQuantity(f.value, f.unit)}</td>
                  {f.contribution !== undefined && <td>{formatNumber(f.contribution)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {e.note && <p className="small">{e.note}</p>}
      {e.effects && e.effects.length > 0 && (
        <>
          <h4>Effets</h4>
          <Effects effects={e.effects} data={data} names={names} />
        </>
      )}
      {e.coefficients && e.coefficients.length > 0 && (
        <>
          <h4>Coefficients</h4>
          <ul className="effects">
            {e.coefficients.slice(0, 30).map((c) => (
              <li key={c.path}>
                <code>{c.path}</code> : {formatNumber(c.from)} → {formatNumber(c.to)}
              </li>
            ))}
            {e.coefficients.length > 30 && <li>… et {e.coefficients.length - 30} autres</li>}
          </ul>
        </>
      )}
    </div>
  );
}

function matches(e: JournalEntry, filter: JournalFilter, selectedId: string | null): boolean {
  if (filter.author === 'user' && e.author !== 'user') return false;
  if (filter.author === 'event' && e.author !== 'event') return false;
  if (e.severity < filter.severity) return false;
  if (filter.selectedOnly && (selectedId === null || !e.entities.includes(selectedId)))
    return false;
  return true;
}

export function JournalPanel({ data }: { data: Dataset }) {
  useSim((s) => s.journalVersion);
  const live = useSim((s) => s.live);
  const names = useMemo(() => namesFor(data), [data]);
  const filter = useApp((s) => s.journalFilter);
  const setFilter = useApp((s) => s.setJournalFilter);
  const selected = useApp((s) => s.selected);
  const select = useApp((s) => s.select);
  const focusOn = useApp((s) => s.focusOn);
  const [open, setOpen] = useState<number | null>(null);
  const selectedId = selected ? (data.byIndex[selected]?.id ?? null) : null;
  const journal = live?.journal ?? [];
  const filtered: JournalEntry[] = [];
  for (let k = journal.length - 1; k >= 0 && filtered.length < SHOWN; k--) {
    const e = journal[k] as JournalEntry;
    if (matches(e, filter, selectedId)) filtered.push(e);
  }
  const events = journal.filter((e) => e.author === 'event').length;
  return (
    <div className="journal">
      <div className="journal-tools">
        <div className="segmented" role="group" aria-label="Auteur">
          {(
            [
              ['all', 'Tout'],
              ['event', 'Événements'],
              ['user', 'Mes modifications'],
            ] as const
          ).map(([a, label]) => (
            <button
              type="button"
              key={a}
              className={filter.author === a ? 'active' : ''}
              onClick={() => setFilter({ author: a })}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={filter.severity}
          onChange={(e) =>
            setFilter({ severity: Number(e.target.value) as JournalFilter['severity'] })
          }
          aria-label="Gravité minimale"
        >
          <option value={0}>Toutes gravités</option>
          <option value={1}>Notables et plus</option>
          <option value={2}>Importants et plus</option>
          <option value={3}>Majeurs</option>
        </select>
        <label className="small">
          <input
            type="checkbox"
            checked={filter.selectedOnly}
            onChange={(e) => setFilter({ selectedOnly: e.target.checked })}
          />{' '}
          Pays sélectionné
          {selectedId ? ` (${data.byId.get(selectedId)?.nameFr ?? selectedId})` : ''}
        </label>
        <span className="muted small">
          {journal.length} entrée{journal.length > 1 ? 's' : ''} dont {events} événement
          {events > 1 ? 's' : ''}
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="muted small journal-empty">
          Rien pour l’instant : les événements (défauts souverains, crises de balance des
          paiements…) et tes modifications s’afficheront ici.
        </p>
      ) : (
        <ul className="journal-list">
          {filtered.map((e) => (
            <li
              key={e.seq}
              className={`sev-${e.severity} author-${e.author}${e.undone ? ' undone' : ''}${open === e.seq ? ' open' : ''}`}
              data-journal-seq={e.seq}
            >
              <button
                type="button"
                className="journal-head"
                onClick={() => {
                  setOpen(open === e.seq ? null : e.seq);
                  const first = e.entities[0];
                  const view = first ? data.byId.get(first) : undefined;
                  if (view) {
                    select(view.index);
                    focusOn(view.index);
                  }
                }}
              >
                <span className="journal-date">{formatDate(e.date)}</span>
                <span className="dot" title={`Gravité : ${SEVERITY_LABELS[e.severity]}`} />
                <span className="journal-who muted small">
                  {e.author === 'user'
                    ? 'toi'
                    : e.entities.map((id) => data.byId.get(id)?.nameFr ?? id).join(', ')}
                </span>
                <span className="journal-text">{entrySummary(e, data, names)}</span>
                {e.undone && <span className="muted small">annulée</span>}
              </button>
              {open === e.seq && <Details e={e} data={data} names={names} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

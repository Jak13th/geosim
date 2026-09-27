/**
 * Éditeur d'un paramètre, généré depuis le catalogue (SPEC §6.3, §9.3) : curseur et champ
 * numérique (échelle logarithmique si le catalogue la demande), liste, case à cocher, vecteur ;
 * réinitialisation à la donnée réelle, verrou, effets temporaires (modificateurs avec durée et
 * décroissance) et édition groupée. Chaque modification est une commande journalisée du moteur.
 */
import {
  modifierWeight,
  slotKey,
  slotLockedReason,
  type Command,
  type Modifier,
  type ModifierDecay,
  type Slot,
} from '@geosim/engine';
import { componentLabel, enumLabel, type ParamDef, type ParamValue } from '@geosim/shared';
import { useState } from 'react';
import type { Dataset } from '../data/dataset.ts';
import { formatNumber, formatQuantity, formatValue, type ValueContext } from '../format.ts';
import { command } from '../sim/client.ts';
import type { LiveSim } from '../sim/mirror.ts';
import { REGION_LABELS } from './labels.ts';
import { SLIDER_STEPS, parseNumber, roundSig, roundValue, sliderScale } from './sliders.ts';

const KIND_HINTS: Record<ParamDef['kind'], string> = {
  input: 'Levier : la valeur saisie remplace la valeur courante.',
  state: 'État : la simulation repart de la valeur saisie.',
  derived:
    'Valeur calculée : la saisir la force (verrou), ce qui court-circuite le calcul ; réinitialiser rend le calcul.',
};

function isNumberVector(v: ParamValue): v is Record<string, number> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Valeur affichée dans un champ : six chiffres significatifs, virgule décimale. */
export function inputText(x: number): string {
  return String(roundSig(x, 6)).replace('.', ',');
}

/** Champ numérique validé à l'entrée ou à la sortie du champ (virgule décimale acceptée). */
export function NumberField({
  value,
  onCommit,
  disabled,
  label,
  width = 96,
}: {
  value: number | null;
  onCommit(x: number): void;
  disabled?: boolean;
  label: string;
  width?: number;
}) {
  // Texte en cours de saisie (null hors saisie : la valeur courante est affichée, arrondie).
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? '' : inputText(value);
  const commit = (): void => {
    // Un champ quitté sans changement ne crée pas de commande (valeur affichée arrondie).
    const x = draft === null || draft === shown ? null : parseNumber(draft);
    if (x !== null && x !== value) onCommit(x);
    setDraft(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className="num"
      style={{ width }}
      value={draft ?? shown}
      disabled={disabled}
      aria-label={label}
      onFocus={() => setDraft(shown)}
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(shown);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Curseur + champ d'un paramètre numérique ; la commande part au relâchement. */
function NumberControl({
  def,
  value,
  reference,
  disabled,
  onCommit,
}: {
  def: ParamDef;
  value: number | null;
  reference: number | null;
  disabled: boolean;
  onCommit(x: number): void;
}) {
  const scale = sliderScale(def, reference ?? value);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const release = (): void => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="control number-control">
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={shown === null ? 0 : scale.toPos(shown)}
        disabled={disabled}
        aria-label={`${def.label} (curseur${scale.log ? ', échelle logarithmique' : ''})`}
        onChange={(e) => setDraft(scale.fromPos(Number(e.target.value)))}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
      />
      <NumberField
        value={shown}
        disabled={disabled}
        label={def.label}
        onCommit={(x) => onCommit(roundValue(def, x))}
      />
      <span className="muted small unit">{def.unit}</span>
    </div>
  );
}

function VectorControl({
  def,
  value,
  disabled,
  onCommit,
}: {
  def: ParamDef;
  value: Record<string, number>;
  disabled: boolean;
  onCommit(v: Record<string, number>): void;
}) {
  const keys = def.components ? [...def.components] : Object.keys(value);
  return (
    <div className="control vector-control">
      {keys.map((k) => (
        <label key={k}>
          <span>{componentLabel(def.id, k)}</span>
          <NumberField
            value={value[k] ?? null}
            disabled={disabled}
            label={`${def.label} — ${componentLabel(def.id, k)}`}
            width={80}
            onCommit={(x) => onCommit({ ...value, [k]: roundValue(def, x) })}
          />
        </label>
      ))}
    </div>
  );
}

function ListControl({
  value,
  disabled,
  names,
  label,
  onCommit,
}: {
  value: string[];
  disabled: boolean;
  names: ValueContext;
  label: string;
  onCommit(v: string[]): void;
}) {
  const joined = value.join(', ');
  // Texte en cours de saisie (null hors saisie : la liste courante est affichée).
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? joined;
  const commit = (): void => {
    const next = text
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.join(', ') !== joined) onCommit(next);
    setDraft(null);
  };
  const unknown = text
    .split(/[,;\s]+/)
    .filter((c) => c && names.itemName(c) === null && !/^[a-z_]+$/.test(c));
  return (
    <div className="control list-control">
      <input
        type="text"
        value={text}
        disabled={disabled}
        aria-label={label}
        placeholder="codes séparés par des virgules (FRA, NATO…)"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      />
      {unknown.length > 0 && (
        <p className="muted small">Codes non reconnus : {unknown.join(', ')}</p>
      )}
    </div>
  );
}

/** Contrôle de saisie selon le type de valeur du paramètre. */
export function ValueControl({
  def,
  value,
  reference,
  disabled,
  names,
  onCommit,
}: {
  def: ParamDef;
  value: ParamValue;
  reference: ParamValue;
  disabled: boolean;
  names: ValueContext;
  onCommit(v: ParamValue): void;
}) {
  switch (def.valueType) {
    case 'number':
      return (
        <NumberControl
          def={def}
          value={typeof value === 'number' ? value : null}
          reference={typeof reference === 'number' ? reference : null}
          disabled={disabled}
          onCommit={onCommit}
        />
      );
    case 'enum':
      return (
        <div className="control">
          <select
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            aria-label={def.label}
            onChange={(e) => onCommit(e.target.value)}
          >
            {value === null && <option value="">—</option>}
            {(def.enumValues ?? []).map((v) => (
              <option key={v} value={v}>
                {enumLabel(def.id, v)}
              </option>
            ))}
          </select>
        </div>
      );
    case 'bool':
      return (
        <div className="control segmented" role="group" aria-label={def.label}>
          {[true, false].map((b) => (
            <button
              type="button"
              key={String(b)}
              className={value === b ? 'active' : ''}
              disabled={disabled}
              onClick={() => value !== b && onCommit(b)}
            >
              {b ? 'Oui' : 'Non'}
            </button>
          ))}
        </div>
      );
    case 'date':
      return (
        <div className="control">
          <input
            type="date"
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            aria-label={def.label}
            onChange={(e) => e.target.value && onCommit(e.target.value)}
          />
        </div>
      );
    case 'list':
      return (
        <ListControl
          value={Array.isArray(value) ? value : []}
          disabled={disabled}
          names={names}
          label={def.label}
          onCommit={onCommit}
        />
      );
    case 'vector':
      return (
        <VectorControl
          def={def}
          value={isNumberVector(value) ? value : {}}
          disabled={disabled}
          onCommit={onCommit}
        />
      );
  }
}

const DECAYS: [ModifierDecay, string][] = [
  ['none', 'constant'],
  ['linear', 'décroissance linéaire'],
  ['exponential', 'décroissance exponentielle'],
];

/** Formulaire d'effet temporaire (modificateur superposé à la valeur, SPEC §6.3). */
function ModifierForm({ slots, onDone }: { slots: Slot[]; onDone(): void }) {
  const [op, setOp] = useState<'add' | 'mul'>('add');
  const [amount, setAmount] = useState<number | null>(null);
  const [days, setDays] = useState<number | null>(90);
  const [decay, setDecay] = useState<ModifierDecay>('linear');
  const [halfLife, setHalfLife] = useState<number | null>(30);
  const [label, setLabel] = useState('');
  const submit = async (): Promise<void> => {
    if (amount === null || days === null) return;
    const entry = await command({
      type: 'addModifier',
      slots,
      modifier: {
        op,
        amount,
        durationDays: Math.round(days),
        decay,
        ...(decay === 'exponential' && halfLife !== null ? { halfLifeDays: halfLife } : {}),
        label: label.trim() || 'Effet temporaire',
      },
    });
    if (entry) onDone();
  };
  return (
    <div className="modifier-form">
      <select
        value={op}
        onChange={(e) => setOp(e.target.value as 'add' | 'mul')}
        aria-label="Opération"
      >
        <option value="add">Ajouter</option>
        <option value="mul">Multiplier par</option>
      </select>
      <NumberField value={amount} label="Montant" width={70} onCommit={setAmount} />
      <span className="muted small">pendant</span>
      <NumberField value={days} label="Durée en jours" width={60} onCommit={setDays} />
      <span className="muted small">jours,</span>
      <select
        value={decay}
        onChange={(e) => setDecay(e.target.value as ModifierDecay)}
        aria-label="Profil"
      >
        {DECAYS.map(([d, l]) => (
          <option key={d} value={d}>
            {l}
          </option>
        ))}
      </select>
      {decay === 'exponential' && (
        <>
          <span className="muted small">demi-vie</span>
          <NumberField
            value={halfLife}
            label="Demi-vie en jours"
            width={50}
            onCommit={setHalfLife}
          />
          <span className="muted small">j</span>
        </>
      )}
      <input
        type="text"
        placeholder="Libellé (ex. choc pétrolier)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        aria-label="Libellé de l'effet"
      />
      <button
        type="button"
        disabled={amount === null || days === null}
        onClick={() => void submit()}
      >
        Appliquer
      </button>
    </div>
  );
}

function modifierText(m: Modifier, tick: number, unit: string): string {
  const w = modifierWeight(m, tick);
  const left = Math.max(0, m.durationDays - (tick - m.startTick));
  const effect =
    m.op === 'add'
      ? `${m.amount >= 0 ? '+' : ''}${formatQuantity(m.amount, unit)}`
      : `× ${formatNumber(m.amount)}`;
  const decay = m.decay === 'none' ? 'constant' : m.decay === 'linear' ? 'linéaire' : 'exponentiel';
  return `${effect} (${decay}, ${Math.round(w * 100)} % aujourd’hui, reste ${left} j)`;
}

type BulkTarget = string;

/** Entités visées par l'édition groupée. */
function bulkEntities(data: Dataset, live: LiveSim, target: BulkTarget, self: string): string[] {
  const known = (ids: readonly string[]): string[] =>
    ids.filter((id) => live.index(id) !== undefined);
  if (target === 'self') return [self];
  if (target === 'all') return live.info.entities.slice();
  if (target === 'states') {
    return data.list.filter((e) => e.kind === 'state').map((e) => e.id);
  }
  if (target.startsWith('bloc:')) {
    const bloc = data.raw.world.blocs.find((b) => b.id === target.slice(5));
    return known(bloc?.members ?? []);
  }
  if (target.startsWith('region:')) {
    const region = target.slice(7);
    return data.list.filter((e) => e.record.region === region).map((e) => e.id);
  }
  return [self];
}

/** Édition groupée (SPEC §9.3) : même modification pour un bloc, une région ou tous les pays. */
function BulkEdit({
  def,
  entity,
  data,
  live,
  value,
}: {
  def: ParamDef;
  entity: string;
  data: Dataset;
  live: LiveSim;
  value: ParamValue;
}) {
  const [target, setTarget] = useState<BulkTarget>('bloc:nato');
  const [op, setOp] = useState<'set' | 'add' | 'mul'>(def.valueType === 'number' ? 'add' : 'set');
  const [amount, setAmount] = useState<number | null>(def.valueType === 'number' ? 1 : null);
  const entities = bulkEntities(data, live, target, entity);
  const slots: Slot[] = entities.map((id) => ({ scope: 'country', param: def.id, entity: id }));
  const numeric = def.valueType === 'number';
  const apply = (): void => {
    if (slots.length === 0) return;
    let cmd: Command;
    if (!numeric || op === 'set') {
      const v = numeric ? amount : value;
      if (v === null) return;
      cmd = { type: 'set', slots, value: v };
    } else {
      if (amount === null) return;
      cmd = { type: 'adjust', slots, op, amount };
    }
    void command(cmd);
  };
  const blocs = [...data.raw.world.blocs].sort((a, b) => a.nameFr.localeCompare(b.nameFr, 'fr'));
  return (
    <div className="bulk">
      <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Cible">
        <optgroup label="Ensemble">
          <option value="all">Toutes les entités</option>
          <option value="states">Tous les États</option>
        </optgroup>
        <optgroup label="Blocs et organisations">
          {blocs.map((b) => (
            <option key={b.id} value={`bloc:${b.id}`}>
              {b.nameFr}
            </option>
          ))}
        </optgroup>
        <optgroup label="Régions">
          {Object.entries(REGION_LABELS).map(([code, label]) => (
            <option key={code} value={`region:${code}`}>
              {label}
            </option>
          ))}
        </optgroup>
      </select>
      {numeric ? (
        <>
          <select
            value={op}
            onChange={(e) => setOp(e.target.value as 'set' | 'add' | 'mul')}
            aria-label="Opération"
          >
            <option value="add">ajouter</option>
            <option value="mul">multiplier par</option>
            <option value="set">fixer à</option>
          </select>
          <NumberField value={amount} label="Valeur" width={70} onCommit={setAmount} />
        </>
      ) : (
        <span className="muted small">
          recevoir la valeur « {formatValue(value, def, { itemName: () => null })} »
        </span>
      )}
      <button type="button" onClick={apply} disabled={slots.length === 0}>
        Appliquer à {slots.length} entité{slots.length > 1 ? 's' : ''}
      </button>
    </div>
  );
}

export function ParamEditor({
  def,
  slot,
  live,
  base,
  names,
  data,
}: {
  def: ParamDef;
  slot: Slot;
  live: LiveSim;
  /** Valeur de référence (donnée réelle ou valeur initiale calculée). */
  base: ParamValue;
  names: ValueContext;
  data: Dataset;
}) {
  const [panel, setPanel] = useState<'none' | 'modifier' | 'bulk'>('none');
  const reason = slotLockedReason(slot);
  const layers = live.layers(slot, base);
  const numeric = def.valueType === 'number';
  const canModify = numeric && (slot.scope === 'country' || slot.scope === 'world');
  const modified = layers.override !== null || layers.locked;
  const set = (value: ParamValue): void => {
    void command({ type: 'set', slots: [slot], value });
  };
  const tick = live.clock.tick;
  const overrideEntry =
    layers.override === null ? null : live.journal.find((e) => e.seq === layers.override?.seq);
  return (
    <div className="editor" data-slot={slotKey(slot)}>
      {reason !== null ? (
        <p className="muted small">{reason}</p>
      ) : (
        <>
          <ValueControl
            def={def}
            value={layers.current}
            reference={base}
            disabled={false}
            names={names}
            onCommit={set}
          />
          <div className="editor-actions">
            <button
              type="button"
              disabled={!modified}
              title="Revenir à la donnée réelle (et, pour une valeur calculée, au calcul)"
              onClick={() => void command({ type: 'reset', slots: [slot] })}
            >
              Réinitialiser
            </button>
            <button
              type="button"
              className={layers.locked ? 'active' : ''}
              title={
                layers.locked
                  ? 'Déverrouiller : la simulation peut de nouveau faire évoluer la valeur'
                  : 'Verrouiller : la simulation ne peut plus modifier la valeur'
              }
              onClick={() => void command({ type: 'lock', slots: [slot], locked: !layers.locked })}
            >
              {layers.locked ? '🔒 Verrouillé' : 'Verrouiller'}
            </button>
            {canModify && (
              <button
                type="button"
                className={panel === 'modifier' ? 'active' : ''}
                onClick={() => setPanel(panel === 'modifier' ? 'none' : 'modifier')}
                title="Effet temporaire superposé à la valeur, avec durée et décroissance"
              >
                Effet temporaire…
              </button>
            )}
            {slot.scope === 'country' && (
              <button
                type="button"
                className={panel === 'bulk' ? 'active' : ''}
                onClick={() => setPanel(panel === 'bulk' ? 'none' : 'bulk')}
                title="Appliquer la même modification à un bloc, une région ou tous les pays"
              >
                Édition groupée…
              </button>
            )}
          </div>
          {panel === 'modifier' && (
            <ModifierForm
              slots={[slot]}
              // La réponse du moteur arrive après l'image : ne ferme que si le formulaire est
              // encore ouvert (un autre panneau a pu être ouvert entre-temps).
              onDone={() => setPanel((p) => (p === 'modifier' ? 'none' : p))}
            />
          )}
          {panel === 'bulk' && slot.scope === 'country' && (
            <BulkEdit
              def={def}
              entity={slot.entity}
              data={data}
              live={live}
              value={layers.current}
            />
          )}
          <p className="muted small">{KIND_HINTS[def.kind]}</p>
        </>
      )}
      <dl className="layers">
        <dt>Donnée réelle</dt>
        <dd>{base === null ? '—' : formatValue(base, def, names)}</dd>
        {layers.override !== null && (
          <>
            <dt>Modifiée</dt>
            <dd>
              le {overrideEntry?.date ?? '?'} (entrée n° {layers.override.seq} du journal)
            </dd>
          </>
        )}
        {layers.locked && (
          <>
            <dt>Verrou</dt>
            <dd>la simulation ne modifie plus cette valeur</dd>
          </>
        )}
        {layers.modifiers.length > 0 && (
          <>
            <dt>Effets</dt>
            <dd>
              <ul className="modifiers">
                {layers.modifiers.map((m) => (
                  <li key={m.id}>
                    <strong>{m.label}</strong> {modifierText(m, tick, def.unit)}
                    {m.author === 'event' && <span className="muted small"> · événement</span>}
                    <button
                      type="button"
                      className="link"
                      onClick={() => void command({ type: 'removeModifier', ids: [m.id] })}
                    >
                      retirer
                    </button>
                  </li>
                ))}
              </ul>
            </dd>
            <dt>Sans effets</dt>
            <dd>{formatValue(layers.current, def, names)}</dd>
          </>
        )}
        <dt>Effective</dt>
        <dd>
          <strong>{formatValue(layers.value, def, names)}</strong>
        </dd>
      </dl>
    </div>
  );
}

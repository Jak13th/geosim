/**
 * Onglet « Modèle » (SPEC §6.4, §9.5) : coefficients de config/model.yaml avec description,
 * plage et unité, modifiables en direct (commande `setCoefficient`, appliquée au pas suivant),
 * enregistrables dans le fichier, et rechargés à chaud quand le fichier change sur le disque.
 */
import { isCoefficient, type CoefficientTree, type ModelCoefficient } from '@geosim/shared';
import { useEffect, useMemo, useState } from 'react';
import { saveModelFile } from '../api/client.ts';
import { formatNumber } from '../format.ts';
import { command, errorText, refreshModelFile, reloadModel, run } from '../sim/client.ts';
import { useSim } from '../sim/store.ts';
import { NumberField } from './ParamEditor.tsx';
import { normalize } from './search.ts';
import { SLIDER_STEPS, roundSig } from './sliders.ts';

export interface CoefficientRow {
  path: string;
  family: string;
  coef: ModelCoefficient;
}

/** Coefficients d'un arbre, par chemin pointé, dans l'ordre du fichier. */
export function flattenTree(tree: CoefficientTree, prefix = ''): CoefficientRow[] {
  const out: CoefficientRow[] = [];
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isCoefficient(node)) out.push({ path, family: path.split('.')[0] ?? path, coef: node });
    else out.push(...flattenTree(node, path));
  }
  return out;
}

const FAMILY_LABELS: Record<string, string> = {
  geo: 'Carte (pipeline de données)',
  demography: 'Démographie',
  economy: 'Économie, budget et finances',
  markets: 'Marchés mondiaux',
};

function CoefficientSlider({ row, fileValue }: { row: CoefficientRow; fileValue: number | null }) {
  const { coef, path } = row;
  const [min, max] = coef.range;
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? coef.value;
  const toPos = (x: number): number =>
    max > min ? Math.round((SLIDER_STEPS * (x - min)) / (max - min)) : 0;
  const fromPos = (t: number): number => roundSig(min + ((max - min) * t) / SLIDER_STEPS, 3);
  const commit = (x: number): void => {
    if (x === coef.value) return;
    if (x < min || x > max) {
      useSim.getState().notify('error', `${path} : ${x} hors de la plage [${min}, ${max}]`);
      return;
    }
    void command({ type: 'setCoefficient', path, value: x });
  };
  const release = (): void => {
    if (draft !== null) commit(draft);
    setDraft(null);
  };
  const unsaved = fileValue !== null && fileValue !== coef.value;
  const name = path.split('.').slice(1).join(' › ');
  return (
    <div className={`coef${unsaved ? ' unsaved' : ''}`} data-coef={path}>
      <div className="coef-head">
        <code title={path}>{name}</code>
        {unsaved && (
          <span className="src conf-user" title={`Valeur du fichier : ${formatNumber(fileValue)}`}>
            non enregistré
          </span>
        )}
      </div>
      <div className="control number-control">
        <input
          type="range"
          min={0}
          max={SLIDER_STEPS}
          value={toPos(shown)}
          aria-label={path}
          onChange={(e) => setDraft(fromPos(Number(e.target.value)))}
          onPointerUp={release}
          onKeyUp={release}
          onBlur={release}
        />
        <NumberField value={shown} label={path} width={80} onCommit={commit} />
        <span className="muted small unit">{coef.unit}</span>
      </div>
      <p className="muted small">
        {coef.description}{' '}
        <span title="Plage admise">
          [{formatNumber(min)} ; {formatNumber(max)}]
        </span>
      </p>
    </div>
  );
}

export function ModelTab() {
  const modelVersion = useSim((s) => s.modelVersion);
  const resetVersion = useSim((s) => s.resetVersion);
  const ready = useSim((s) => s.status.state === 'ready');
  const file = useSim((s) => s.modelFile);
  const notify = useSim((s) => s.notify);
  const [tree, setTree] = useState<CoefficientTree | null>(null);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void run((api) => api.model()).then((t) => {
      if (!cancelled && t !== null) setTree(t);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, modelVersion, resetVersion]);
  const rows = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);
  const fileValues = useMemo(
    () => new Map(file?.tree ? flattenTree(file.tree).map((r) => [r.path, r.coef.value]) : []),
    [file],
  );
  const changes = rows
    .filter((r) => fileValues.has(r.path) && fileValues.get(r.path) !== r.coef.value)
    .map((r) => ({ path: r.path, value: r.coef.value }));
  const q = normalize(query);
  const shown = rows.filter(
    (r) => q === '' || normalize(`${r.path} ${r.coef.description}`).includes(q),
  );
  const families = [...new Set(shown.map((r) => r.family))];
  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      const state = await saveModelFile(changes);
      useSim.setState({ modelFile: state });
      notify(
        'success',
        `${state.path} enregistré (${changes.length} coefficient${changes.length > 1 ? 's' : ''})`,
      );
    } catch (e) {
      notify('error', `Enregistrement : ${errorText(e)}`);
    } finally {
      setSaving(false);
    }
  };
  if (!ready || tree === null) {
    return <p className="params muted">Moteur en cours de chargement…</p>;
  }
  return (
    <div className="params model-tab">
      <p className="muted small">
        Coefficients des systèmes ({rows.length}), lus dans{' '}
        <code>{file?.path ?? 'config/model.yaml'}</code>. Une modification s’applique au pas suivant
        et entre au journal (annulable). Le fichier est surveillé : une modification sur le disque
        est rechargée à chaud.
      </p>
      <div className="model-actions">
        <button type="button" disabled={changes.length === 0 || saving} onClick={() => void save()}>
          Enregistrer dans le fichier{changes.length > 0 ? ` (${changes.length})` : ''}
        </button>
        <button
          type="button"
          title="Relit config/model.yaml et l’applique (les valeurs non enregistrées sont remplacées ; annulable)"
          onClick={() => void reloadModel(true)}
        >
          Recharger le fichier
        </button>
        <button type="button" className="link" onClick={() => void refreshModelFile()}>
          Comparer au fichier
        </button>
      </div>
      {file !== null && file.errors.length > 0 && (
        <div className="errors">
          <strong>{file.path} invalide :</strong>
          <ul>
            {file.errors.slice(0, 8).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <input
        type="search"
        placeholder="Chercher un coefficient…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Chercher un coefficient"
      />
      {families.map((family) => {
        const inFamily = shown.filter((r) => r.family === family);
        return (
          <details key={family} open={q !== '' || family !== 'geo'} className="family">
            <summary>
              {FAMILY_LABELS[family] ?? family}{' '}
              <span className="muted small">({inFamily.length})</span>
            </summary>
            {family === 'geo' && (
              <p className="muted small">
                Seuils du pipeline de la carte : sans effet sur la simulation en cours ; enregistrer
                puis relancer « npm run data ».
              </p>
            )}
            {inFamily.map((row) => (
              <CoefficientSlider
                key={row.path}
                row={row}
                fileValue={fileValues.get(row.path) ?? null}
              />
            ))}
          </details>
        );
      })}
    </div>
  );
}

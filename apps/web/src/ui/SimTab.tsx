/**
 * Onglet « Simulation » : paramètres de simulation, nouvelle simulation, captures (en mémoire et
 * sur le disque, dossier `captures/`), vérification de la relecture du journal (SPEC §7.2, §7.4).
 */
import type { Slot } from '@geosim/engine';
import { CATALOG } from '@geosim/shared';
import { useEffect, useMemo, useState } from 'react';
import {
  deleteCaptureFile,
  listCaptureFiles,
  readCaptureFile,
  writeCaptureFile,
} from '../api/client.ts';
import { isCaptureName, type CaptureFileInfo } from '../api/contract.ts';
import type { Dataset, ParamLookup } from '../data/dataset.ts';
import { formatDate, formatNumber } from '../format.ts';
import { DEFAULT_SEED, errorText, run } from '../sim/client.ts';
import type { CaptureInfo, ReplayCheck } from '../sim/protocol.ts';
import { useSim } from '../sim/store.ts';
import { useLive } from './live.ts';
import { LiveRow } from './LiveRow.tsx';
import { namesFor } from './names.ts';
import { NumberField } from './ParamEditor.tsx';

const SIM_PARAMS = CATALOG.filter((d) => d.scope === 'sim' && d.id !== 'sim.speed');

function fileSize(bytes: number): string {
  return bytes >= 1e6 ? `${formatNumber(bytes / 1e6)} Mo` : `${formatNumber(bytes / 1e3)} ko`;
}

/** Captures en mémoire (worker) et sur le disque (API locale). */
async function loadCaptures(): Promise<{ memory: CaptureInfo[]; files: CaptureFileInfo[] }> {
  const memory = (await run((api) => api.listCaptures())) ?? [];
  let files: CaptureFileInfo[] = [];
  try {
    files = await listCaptureFiles();
  } catch (e) {
    useSim.getState().notify('error', `Captures sur le disque : ${errorText(e)}`);
  }
  return { memory, files };
}

function Captures() {
  const notify = useSim((s) => s.notify);
  const clock = useSim((s) => s.clock);
  const resetVersion = useSim((s) => s.resetVersion);
  const [lists, setLists] = useState<{ memory: CaptureInfo[]; files: CaptureFileInfo[] }>({
    memory: [],
    files: [],
  });
  const { memory, files } = lists;
  const [refreshes, setRefreshes] = useState(0);
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void loadCaptures().then((l) => {
      if (!cancelled) setLists(l);
    });
    return () => {
      cancelled = true;
    };
  }, [resetVersion, refreshes]);
  const guard = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setRefreshes((n) => n + 1);
    }
  };
  const suggested = `capture-${clock?.date ?? 'etat'}`;
  const fileName = name.trim() || suggested;
  const validName = isCaptureName(fileName);
  const saveCurrent = (): Promise<void> =>
    guard(async () => {
      const text = await run((api) => api.exportCapture(null, label || fileName));
      if (text === null) return;
      try {
        await writeCaptureFile(fileName, text);
        notify('success', `Capture enregistrée : captures/${fileName}.json`);
      } catch (e) {
        notify('error', `Enregistrement : ${errorText(e)}`);
      }
    });
  return (
    <>
      <h3>Captures</h3>
      <p className="muted small">
        Une capture fige tout l’état (valeurs, verrous, effets, aléa, journal, historique) : la
        restaurer reprend exactement au même point.
      </p>
      <div className="capture-form">
        <input
          type="text"
          placeholder="Libellé (ex. avant la crise)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label="Libellé de la capture"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void guard(async () => {
              const info = await run((api) => api.capture(label));
              if (info) notify('success', `Capture « ${info.label} » (${formatDate(info.date)})`);
              setLabel('');
            })
          }
        >
          Capturer
        </button>
      </div>
      {memory.length > 0 && (
        <ul className="captures">
          {memory.map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong> <span className="muted small">{formatDate(c.date)}</span>
              <span className="capture-actions">
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => void (await run((api) => api.restoreCapture(c.id))))
                  }
                >
                  restaurer
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      const text = await run((api) => api.exportCapture(c.id));
                      const target =
                        c.label.replace(/[^\p{L}\p{N} _.-]/gu, '').trim() || `capture-${c.id}`;
                      if (text !== null && isCaptureName(target)) {
                        await writeCaptureFile(target, text);
                        notify('success', `Capture enregistrée : captures/${target}.json`);
                      }
                    })
                  }
                >
                  enregistrer
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => void (await run((api) => api.deleteCapture(c.id))))
                  }
                >
                  oublier
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3>Sur le disque (captures/)</h3>
      <div className="capture-form">
        <input
          type="text"
          placeholder={suggested}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nom du fichier"
          aria-invalid={!validName}
        />
        <button type="button" disabled={busy || !validName} onClick={() => void saveCurrent()}>
          Enregistrer l’état
        </button>
      </div>
      {!validName && (
        <p className="muted small">
          Nom : lettres, chiffres, espaces, « _ », « . » ou « - » (80 au plus).
        </p>
      )}
      {files.length === 0 ? (
        <p className="muted small">Aucune capture enregistrée.</p>
      ) : (
        <ul className="captures">
          {files.map((f) => (
            <li key={f.name}>
              <strong>{f.label ?? f.name}</strong>{' '}
              <span className="muted small">
                {f.name}.json · {fileSize(f.size)}
              </span>
              <span className="capture-actions">
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      try {
                        const text = await readCaptureFile(f.name);
                        const info = await run((api) => api.importCapture(text));
                        if (info)
                          notify(
                            'success',
                            `Capture chargée : ${info.label} (${formatDate(info.date)})`,
                          );
                      } catch (e) {
                        notify('error', errorText(e));
                      }
                    })
                  }
                >
                  charger
                </button>
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void guard(async () => {
                      try {
                        await deleteCaptureFile(f.name);
                      } catch (e) {
                        notify('error', errorText(e));
                      }
                    })
                  }
                >
                  supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Replay() {
  const live = useLive();
  const tick = live?.clock.tick ?? 0;
  // Résultats datés : ils ne s'affichent que tant que la simulation n'a pas avancé.
  const [checked, setResult] = useState<{ tick: number; check: ReplayCheck } | null>(null);
  const [hashed, setHash] = useState<{ tick: number; hash: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const result = checked !== null && checked.tick === tick ? checked.check : null;
  const hash = hashed !== null && hashed.tick === tick ? hashed.hash : null;
  return (
    <>
      <h3>Relecture et empreinte</h3>
      <p className="muted small">
        Rejoue le journal depuis l’état initial (même graine, mêmes commandes aux mêmes dates) et
        compare l’empreinte de l’état obtenu à celle de l’état courant.
      </p>
      <div className="capture-form">
        <button
          type="button"
          disabled={busy || live === null || !live.info.replayable}
          title={live?.info.replayable === false ? 'Capture importée : état initial inconnu' : ''}
          onClick={() => {
            setBusy(true);
            void run((api) => api.verifyReplay())
              .then((check) => setResult(check === null ? null : { tick, check }))
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Relecture…' : 'Vérifier la relecture'}
        </button>
        <button
          type="button"
          onClick={() =>
            void run((api) => api.hash()).then((h) =>
              setHash(h === null ? null : { tick, hash: h }),
            )
          }
        >
          Empreinte de l’état
        </button>
      </div>
      {result !== null && (
        <p
          className={result.identical ? 'ok' : 'error-text'}
          data-replay={result.identical ? 'identical' : 'different'}
        >
          {result.identical ? '✓ Identique' : '✗ Différente'} : {result.hash}
          {result.identical ? '' : ` ≠ ${result.replayHash}`} ({result.commands} commande
          {result.commands > 1 ? 's' : ''} rejouée{result.commands > 1 ? 's' : ''} en{' '}
          {formatNumber(result.ms / 1000)} s)
        </p>
      )}
      {hash !== null && <p className="muted small">Empreinte : {hash}</p>}
    </>
  );
}

export function SimTab({ data }: { data: Dataset }) {
  const names = useMemo(() => namesFor(data), [data]);
  const live = useLive();
  const clock = useSim((s) => s.clock);
  const [seed, setSeed] = useState<number | null>(DEFAULT_SEED);
  return (
    <div className="params">
      <h3>Paramètres de simulation</h3>
      <p className="muted small">
        Vitesse : barre de temps ({clock ? `${clock.speed} jours par seconde` : '—'}). Pas mensuel
        moyen : {clock ? `${formatNumber(clock.monthMs)} ms` : '—'}.
      </p>
      {SIM_PARAMS.map((def) => {
        const slot: Slot = { scope: 'sim', param: def.id };
        const value = live?.baseValue(slot) ?? null;
        const lookup: ParamLookup = {
          state: 'value',
          value: {
            value,
            source: 'DER',
            date: data.raw.countries.buildDate,
            confidence: 'high',
            method: 'derived',
          },
        };
        return (
          <LiveRow
            key={def.id}
            def={def}
            slot={slot}
            lookup={lookup}
            live={live}
            data={data}
            names={names}
          />
        );
      })}
      <h3>Nouvelle simulation</h3>
      <div className="capture-form">
        <span className="muted small">Graine</span>
        <NumberField
          value={seed}
          label="Graine"
          width={110}
          onCommit={(x) => setSeed(Math.round(x))}
        />
        <button
          type="button"
          disabled={seed === null}
          title="Repart des données (coefficients actuels du modèle) : journal et historique effacés"
          onClick={() => {
            if (
              seed !== null &&
              window.confirm(
                'Recommencer ? Le journal et l’historique en cours seront perdus (fais une capture avant si besoin).',
              )
            ) {
              void run((api) => api.restart(seed));
            }
          }}
        >
          Recommencer
        </button>
      </div>
      <Captures />
      <Replay />
    </div>
  );
}

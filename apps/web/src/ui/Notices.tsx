/**
 * Notifications (commande refusée, fichier enregistré, modèle rechargé…) et erreur de la
 * simulation (elle s'est mise en pause).
 */
import { useSim } from '../sim/store.ts';

export function Notices() {
  const notices = useSim((s) => s.notices);
  const dismiss = useSim((s) => s.dismiss);
  const runtimeError = useSim((s) => s.runtimeError);
  const clear = useSim((s) => s.clearRuntimeError);
  return (
    <div className="notices" aria-live="polite">
      {runtimeError && (
        <div className="notice error" role="alert">
          <span>{runtimeError}</span>
          <button type="button" className="icon" onClick={clear} aria-label="Fermer">
            ×
          </button>
        </div>
      )}
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} data-notice={n.kind}>
          <span>{n.text}</span>
          <button type="button" className="icon" onClick={() => dismiss(n.id)} aria-label="Fermer">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

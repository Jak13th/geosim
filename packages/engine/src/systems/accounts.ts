/**
 * Comptes dérivés, recalculés après chaque pas et chaque commande : définitions sans coefficient
 * (PIB par habitant, indice de misère, budget de défense, aide versée, intensité et dépendance
 * énergétiques : `derived.ts`) et croissance mondiale.
 *
 * Croissance mondiale : moyenne des croissances pondérée par le PIB en parité de pouvoir d'achat
 * (convention du FMI), hors factions (comptées dans leur pays).
 */
import { DEFINITIONAL_DERIVATIONS } from '../derived.ts';
import { col } from '../state.ts';
import type { System, SystemContext } from '../system.ts';

const DERIVATIONS = DEFINITIONAL_DERIVATIONS.map((d) => ({
  out: col(d.id),
  inputs: d.inputs.map((id) => col(id)),
  compute: d.compute,
}));

const C = { growth: col('eco.growth'), gdpPpp: col('eco.gdp_ppp') };

function derive(ctx: SystemContext): void {
  const S = ctx.state;
  const args: number[] = [];
  for (const d of DERIVATIONS) {
    for (let i = 0; i < S.n; i++) {
      args.length = 0;
      let ok = true;
      for (const p of d.inputs) {
        const x = S.effNow(p, i);
        if (!Number.isFinite(x)) ok = false;
        args.push(x);
      }
      if (ok) S.write(d.out, i, d.compute(args));
    }
  }
  let weighted = 0;
  let weights = 0;
  for (let i = 0; i < S.n; i++) {
    if (S.entities[i]?.kind === 'faction') continue;
    const w = S.effNow(C.gdpPpp, i);
    const g = S.effNow(C.growth, i);
    if (!(w > 0) || !Number.isFinite(g)) continue;
    weighted += w * g;
    weights += w;
  }
  S.writeWorld('world.growth', weights > 0 ? weighted / weights : 0);
}

export const accounts: System = {
  id: 'accounts',
  coefficients: [],
  writes: DEFINITIONAL_DERIVATIONS.map((d) => d.id),
  derive,
};

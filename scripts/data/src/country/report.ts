/**
 * Rapport de couverture des données (SPEC §5.4) : `data/build/report.md`.
 * Pour chaque paramètre : entités couvertes par une source, année médiane, replis utilisés ;
 * liste des valeurs estimées ; alertes (données anciennes, incohérences) ; lacunes.
 */
import { writeFile } from 'node:fs/promises';
import { CATALOG, paramById, type ParamDef } from '@geosim/shared';
import type { Ctx, Method, Resolved } from './context.ts';
import { median } from './series.ts';

const REAL: Method[] = ['source', 'fallback_source', 'curated', 'derived', 'map'];
const METHOD_LABELS: Record<Method, string> = {
  source: 'source',
  fallback_source: 'source de repli',
  curated: 'curé',
  derived: 'dérivé',
  map: 'carte',
  regional_median: 'médiane régionale',
  default: 'hypothèse',
  zero: 'nul documenté',
  not_applicable: 'sans objet',
  missing: 'lacune',
};

export interface ReportExtras {
  sources: { id: string; version: string; accessed: string }[];
  alerts: string[];
  zones: { id: string; nameFr: string; pixels: number }[];
  mapChecks: string[];
  pairs: Record<string, { entries: number; default: unknown; defaultNote: string }>;
  pairRuntime: string[];
}

function yearOf(r: Resolved): number | null {
  const m = /^(\d{4})/.exec(r.date);
  return m ? Number(m[1]) : null;
}

const pct = (n: number, total: number): string =>
  total === 0 ? '—' : `${Math.round((100 * n) / total)} %`;

/** Incohérences détectées dans les valeurs résolues. */
export function consistencyAlerts(ctx: Ctx): string[] {
  const alerts: string[] = [];
  const get = (id: string, code: string): Resolved | undefined => ctx.resolved.get(id)?.get(code);
  for (const e of ctx.entities) {
    const shares = ['demo.share_0_14', 'demo.share_15_64', 'demo.share_65plus'].map(
      (id) => get(id, e.id)?.value,
    );
    if (shares.every((v) => typeof v === 'number')) {
      const sum = (shares as number[]).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > 1.5)
        alerts.push(`${e.id} : parts des classes d’âge = ${sum.toFixed(1)} % (≠ 100)`);
    }
    const comp = get('trade.composition', e.id)?.value;
    if (comp && typeof comp === 'object' && !Array.isArray(comp)) {
      const sum = Object.values(comp).reduce((s, v) => s + v, 0);
      if (Math.abs(sum - 100) > 1.5)
        alerts.push(`${e.id} : structure des échanges = ${sum.toFixed(1)} % (≠ 100)`);
    }
    // Valeurs hors des plages du catalogue.
    for (const [id, table] of ctx.resolved) {
      const r = table.get(e.id);
      const def = paramById(id);
      if (
        !r ||
        !def ||
        typeof r.value !== 'number' ||
        def.min === undefined ||
        def.max === undefined
      )
        continue;
      if (r.clampedFrom !== undefined) {
        alerts.push(
          `${e.id} › ${id} : valeur source ${Number(r.clampedFrom.toPrecision(4))} écrêtée à [${def.min} ; ${def.max}]`,
        );
      }
      if (r.value < def.min || r.value > def.max) {
        alerts.push(
          `${e.id} › ${id} = ${Number(r.value.toPrecision(4))} hors de la plage du catalogue [${def.min} ; ${def.max}]`,
        );
      }
      if (!Number.isFinite(r.value)) alerts.push(`${e.id} › ${id} : valeur non finie`);
    }
  }
  // Sommes de parts mondiales.
  for (const [mineral, data] of Object.entries(ctx.topics.minerals.minerals)) {
    const sum = Object.values(data.production).reduce((s, v) => s + v, 0);
    if (sum > 100.5)
      alerts.push(
        `minerals.yaml › ${mineral} : somme des parts de production = ${sum.toFixed(1)} % (> 100)`,
      );
  }
  const fab = Object.values(ctx.topics.semiconductors.advanced_fab_share.shares).reduce(
    (s, v) => s + v,
    0,
  );
  if (fab > 100.5)
    alerts.push(
      `semiconductors.yaml : somme des parts de fabrication = ${fab.toFixed(1)} % (> 100)`,
    );
  for (const id of ['res.grain_export_share', 'res.fertilizer_export_share']) {
    let sum = 0;
    for (const r of ctx.resolved.get(id)?.values() ?? [])
      if (typeof r.value === 'number') sum += r.value;
    if (sum > 100.5) alerts.push(`${id} : somme des parts mondiales = ${sum.toFixed(1)} % (> 100)`);
  }
  return alerts;
}

export async function writeReport(path: string, ctx: Ctx, extras: ReportExtras): Promise<void> {
  const L: string[] = [];
  const entities = ctx.entities;
  const full = entities.filter((e) => e.detail === 'full');
  L.push('# Rapport de couverture des données', '');
  L.push(`Construit le ${ctx.buildDate} par \`npm run data\`. Référence : SPEC §5.4.`, '');
  L.push('## Entités', '');
  const byKind = (k: string) => entities.filter((e) => e.kind === k).length;
  L.push(
    `- ${entities.length} entités : ${byKind('state')} États, ${byKind('de_facto')} entités de facto, ${byKind('faction')} factions.`,
  );
  L.push(
    `- Niveau de détail complet (DECISIONS D6) : ${full.length} entités (${full.map((e) => e.id).join(', ')}).`,
  );
  L.push(
    `- Région et groupe de revenu curés (hors Banque mondiale) : ${
      entities
        .filter((e) => e.classification === 'curated')
        .map((e) => e.id)
        .join(', ') || 'aucune'
    }.`,
    '',
  );

  // Synthèse par méthode.
  const counts = new Map<Method, number>();
  let total = 0;
  for (const table of ctx.resolved.values()) {
    for (const r of table.values()) {
      counts.set(r.method, (counts.get(r.method) ?? 0) + 1);
      total++;
    }
  }
  L.push('## Provenance des valeurs (paramètres pays)', '');
  L.push('| Méthode | Valeurs | Part |', '| --- | ---: | ---: |');
  for (const [m, label] of Object.entries(METHOD_LABELS) as [Method, string][]) {
    const n = counts.get(m) ?? 0;
    if (n > 0) L.push(`| ${label} | ${n} | ${pct(n, total)} |`);
  }
  L.push(
    '',
    'Chaque valeur de `countries.base.json` porte sa source, son année (ou sa date), sa confiance et sa méthode.',
    '',
  );

  // Couverture par paramètre.
  L.push('## Couverture par paramètre', '');
  L.push(
    'Colonnes : entités couvertes par une donnée (source, repli, curée, dérivée, carte), année médiane de ces données, valeurs de plus de trois ans, puis replis.',
    '',
  );
  L.push(
    '| Paramètre | Source | Données | Année méd. | > 3 ans | Médiane rég. | Hypothèse | Nul | Sans objet | Lacune |',
  );
  L.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  const runtime: ParamDef[] = [];
  for (const def of CATALOG.filter((d) => d.scope === 'country')) {
    const table = ctx.resolved.get(def.id);
    if (table === undefined) {
      runtime.push(def);
      continue;
    }
    const rs = [...table.values()];
    const by = (m: Method) => rs.filter((r) => r.method === m).length;
    const real = rs.filter((r) => REAL.includes(r.method));
    const years = real.map(yearOf).filter((y): y is number => y !== null);
    const stale = real.filter((r) => r.stale).length;
    L.push(
      `| \`${def.id}\` | ${def.source ?? ''} | ${real.length} | ${years.length ? Math.round(median(years)) : '—'} | ${stale || ''} | ${by('regional_median') || ''} | ${by('default') || ''} | ${by('zero') || ''} | ${by('not_applicable') || ''} | ${by('missing') || ''} |`,
    );
  }
  L.push('');
  L.push(
    `**Calculés par le moteur** (dérivés, non stockés) : ${runtime.map((d) => `\`${d.id}\``).join(', ')}.`,
    '',
  );

  // Paires.
  L.push('## Paramètres bilatéraux (`pairs.base.json`)', '');
  L.push('| Paramètre | Paires renseignées | Paires absentes |', '| --- | ---: | --- |');
  for (const [id, p] of Object.entries(extras.pairs)) {
    L.push(`| \`${id}\` | ${p.entries} | ${JSON.stringify(p.default)} : ${p.defaultNote} |`);
  }
  L.push(
    '',
    `**Calculés par le moteur** : ${extras.pairRuntime.map((id) => `\`${id}\``).join(', ')}.`,
    '',
  );

  // Estimations pour les pays au niveau complet.
  L.push('## Valeurs estimées des pays au niveau de détail complet', '');
  L.push(
    'Médianes régionales et hypothèses restant à curer pour les pays clés (les profils IA sont des hypothèses par nature et ne sont pas listés).',
    '',
  );
  L.push('| Pays | Médianes régionales | Hypothèses |', '| --- | --- | --- |');
  for (const e of full) {
    const med: string[] = [];
    const hyp: string[] = [];
    for (const [id, table] of ctx.resolved) {
      const r = table.get(e.id);
      if (!r || id.startsWith('ai.')) continue;
      if (r.method === 'regional_median') med.push(id);
      if (r.method === 'default') hyp.push(id);
    }
    L.push(
      `| ${e.id} | ${med.join(', ') || '—'} | ${hyp.length} (${hyp.slice(0, 12).join(', ')}${hyp.length > 12 ? '…' : ''}) |`,
    );
  }
  L.push('');

  // Lacunes.
  const missing: string[] = [];
  for (const [id, table] of ctx.resolved) {
    const codes = [...table].filter(([, r]) => r.method === 'missing').map(([c]) => c);
    if (codes.length > 0)
      missing.push(
        `- \`${id}\` (${codes.length}) : ${codes.slice(0, 30).join(', ')}${codes.length > 30 ? '…' : ''}`,
      );
  }
  L.push('## Lacunes (aucune source, aucun repli)', '');
  L.push(...(missing.length ? missing : ['Aucune.']), '');

  // Données anciennes.
  L.push('## Alertes', '');
  L.push('### Données de plus de trois ans (SPEC §5.1)', '');
  for (const [id, table] of ctx.resolved) {
    const stale = [...table].filter(([, r]) => r.stale);
    if (stale.length === 0) continue;
    const years = stale.map(([, r]) => yearOf(r)).filter((y): y is number => y !== null);
    L.push(
      `- \`${id}\` : ${stale.length} entités (années ${Math.min(...years)}–${Math.max(...years)})`,
    );
  }
  L.push('', '### Incohérences et contrôles', '');
  L.push(...(extras.alerts.length ? extras.alerts.map((a) => `- ${a}`) : ['Aucune.']), '');
  L.push('### Carte', '');
  L.push(...extras.mapChecks.map((c) => `- ${c}`), '');

  L.push('## Zones de contrôle appliquées', '');
  L.push('| Zone | Pixels modifiés |', '| --- | ---: |');
  for (const z of extras.zones) L.push(`| ${z.nameFr} (\`${z.id}\`) | ${z.pixels} |`);
  L.push('');

  L.push('## Sources', '');
  L.push('| Source | Version | Consultée le |', '| --- | --- | --- |');
  for (const s of extras.sources) L.push(`| \`${s.id}\` | ${s.version} | ${s.accessed} |`);
  L.push(
    '',
    'Détails (URL, licence, empreinte) : `data/manifest.json`. Sources curées : `data/curated/SOURCES.md`.',
    '',
  );
  await writeFile(path, `${L.join('\n')}\n`);
}

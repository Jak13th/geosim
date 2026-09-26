/**
 * Rapport d'un scénario d'expérience (SPEC §12) : écarts au contrefactuel des indicateurs mis en
 * avant, événements propres au scénario avec leurs facteurs explicatifs (« Pourquoi ? »).
 */
import {
  COUNTRY_NUMERIC,
  compareCountry,
  compareWorld,
  scenarioEvents,
  type Factor,
  type JournalEntry,
  type Scenario,
  type ScenarioRun,
  type SeriesComparison,
} from '@geosim/engine';
import { paramById } from '@geosim/shared';

function fmt(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  const s = x.toFixed(digits);
  return s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s;
}

function signed(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  return `${x >= 0 ? '+' : ''}${fmt(x, digits)}`;
}

function labelOf(param: string): string {
  const def = paramById(param) ?? paramById(param.split('.').slice(0, 2).join('.'));
  const suffix = param.split('.').length > 2 && def ? ` (${param.split('.').pop()})` : '';
  return def ? `${def.label}${suffix}` : param;
}

function unitOf(param: string): string {
  const def = paramById(param) ?? paramById(param.split('.').slice(0, 2).join('.'));
  return def?.unit ?? '';
}

function comparisonRow(c: SeriesComparison, name: string, unit: string): string {
  return `| ${name} | ${unit} | ${fmt(c.peak.reference)} | ${fmt(c.peak.scenario)} | ${signed(c.peak.diff)} | ${c.peak.date} | ${signed(c.end.diff)} |`;
}

const HEADER =
  '| Indicateur | Unité | Référence | Scénario | Écart maximal | Date | Écart à la fin |\n|---|---|---|---|---|---|---|';

function factorText(f: Factor): string {
  const contribution = f.contribution !== undefined ? ` → ${signed(f.contribution)}` : '';
  return `${f.label} ${fmt(f.value)} ${f.unit}${contribution}`;
}

function eventLine(e: JournalEntry): string {
  const factors = (e.factors ?? []).slice(0, 6).map(factorText).join(' ; ');
  const note = e.note ? ` — ${e.note}` : '';
  return `- ${e.date} · **${e.kind}** · ${e.entities.slice(0, 4).join(', ')}${note}${
    factors ? `\n  - Pourquoi : ${factors}` : ''
  }`;
}

/** Relations d'un pays avec ses principaux partenaires à la fin (scénario, référence). */
function relationRows(run: ScenarioRun, entity: string, partners: string[]): string[] {
  const S = run.scenario.state;
  const R = run.reference.state;
  const i = S.byId.get(entity);
  if (i === undefined) return [];
  const rows: string[] = [];
  for (const p of partners) {
    const j = S.byId.get(p);
    if (j === undefined) continue;
    const k = i * S.n + j;
    const kr = j * S.n + i;
    const a = S.pairMatrix('pair.relation');
    const b = R.pairMatrix('pair.relation');
    rows.push(
      `| ${entity} → ${p} | ${fmt(b[k] as number, 1)} | ${fmt(a[k] as number, 1)} | ${signed((a[k] as number) - (b[k] as number), 1)} | ${fmt(b[kr] as number, 1)} | ${fmt(a[kr] as number, 1)} | ${signed((a[kr] as number) - (b[kr] as number), 1)} |`,
    );
  }
  return rows;
}

/** Profil décisionnel d'un pays à la fin (scénario, référence). */
function profileRows(run: ScenarioRun, entity: string): string[] {
  const S = run.scenario.state;
  const R = run.reference.state;
  const i = S.byId.get(entity);
  if (i === undefined) return [];
  return COUNTRY_NUMERIC.filter((d) => d.category === 'profil').map((d) => {
    const p = COUNTRY_NUMERIC.indexOf(d);
    const a = S.e(p)[i] as number;
    const b = R.e(p)[i] as number;
    return `| ${d.label} | ${fmt(b, 0)} | ${fmt(a, 0)} | ${signed(a - b, 0)} |`;
  });
}

export function scenarioReport(scenario: Scenario, run: ScenarioRun, seed: number): string {
  const lines: string[] = [];
  lines.push(`# ${scenario.label}`, '', scenario.description, '');
  lines.push(
    `Graine ${seed} ; du ${run.scenario.calendar.isoAt(0)} au ${scenario.until} ; empreinte du scénario ${run.scenario.hash()}, de la référence ${run.reference.hash()}.`,
    '',
  );
  lines.push('## Commandes', '');
  for (const s of run.steps) lines.push(`- ${s.date} (scénario) : ${s.label}`);
  for (const s of run.referenceSteps) lines.push(`- ${s.date} (référence) : ${s.label}`);
  lines.push('', '## Indicateurs mondiaux', '', HEADER);
  for (const key of scenario.focus.world) {
    const c = compareWorld(run, key);
    if (c) lines.push(comparisonRow(c, labelOf(key), unitOf(key)));
  }
  lines.push('', '## Pays', '');
  for (const param of scenario.focus.params) {
    const rows: string[] = [];
    for (const entity of scenario.focus.countries) {
      const c = compareCountry(run, param, entity);
      if (c) rows.push(comparisonRow(c, entity, unitOf(param)));
    }
    if (rows.length === 0) continue;
    lines.push(`### ${labelOf(param)}`, '', HEADER.replace('Indicateur', 'Pays'), ...rows, '');
  }
  if (scenario.id === 'election-usa') {
    lines.push('## Profil décisionnel des États-Unis à la fin', '');
    lines.push('| Paramètre | Référence | Scénario | Écart |', '|---|---|---|---|');
    lines.push(...profileRows(run, 'USA'), '');
    lines.push('## Relations à la fin (−100 à 100)', '');
    lines.push(
      '| Paire | Référence | Scénario | Écart | Sens inverse (réf.) | Sens inverse (scén.) | Écart |',
      '|---|---|---|---|---|---|---|',
    );
    lines.push(
      ...relationRows(run, 'USA', [
        'CAN',
        'MEX',
        'GBR',
        'DEU',
        'FRA',
        'DNK',
        'JPN',
        'KOR',
        'UKR',
        'CHN',
        'RUS',
        'IRN',
        'BRA',
        'IND',
      ]),
      '',
    );
  }
  const events = scenarioEvents(run);
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  lines.push('## Événements propres au scénario', '');
  lines.push(
    counts.size === 0
      ? 'Aucun.'
      : [...counts]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${k} : ${n}`)
          .join(' · '),
    '',
  );
  const major = events
    .filter((e) => e.severity >= 2)
    .slice(0, 25)
    .map(eventLine);
  if (major.length > 0) lines.push('### Principaux événements (gravité ≥ 2)', '', ...major, '');
  return `${lines.join('\n')}\n`;
}

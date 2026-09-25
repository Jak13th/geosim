import { describe, expect, it } from 'vitest';
import type { ShapeFeature } from '../io/shapefile.ts';
import { buildEntities, parseCuratedUnits, type CuratedUnits } from './entities.ts';

const prov = { source: 'test', date: '2026-09-25', confidence: 'high' as const };

function feature(props: Record<string, string | number>): ShapeFeature {
  return { geometry: null, properties: { LABEL_X: 0, LABEL_Y: 0, ...props } };
}

const features: ShapeFeature[] = [
  feature({
    ADM0_A3: 'FRA',
    SOV_A3: 'FR1',
    ADMIN: 'France',
    SOVEREIGNT: 'France',
    ISO_A3_EH: 'FRA',
    NAME_FR: 'France',
    TYPE: 'Country',
  }),
  feature({
    ADM0_A3: 'NCL',
    SOV_A3: 'FR1',
    ADMIN: 'New Caledonia',
    SOVEREIGNT: 'France',
    ISO_A3_EH: 'NCL',
    TYPE: 'Dependency',
  }),
  feature({
    ADM0_A3: 'CUB',
    SOV_A3: 'CU1',
    ADMIN: 'Cuba',
    SOVEREIGNT: 'Cuba',
    ISO_A3_EH: 'CUB',
    TYPE: 'Sovereignty',
  }),
  feature({
    ADM0_A3: 'USA',
    SOV_A3: 'US1',
    ADMIN: 'United States of America',
    SOVEREIGNT: 'United States of America',
    ISO_A3_EH: 'USA',
    TYPE: 'Country',
  }),
  feature({
    ADM0_A3: 'USG',
    SOV_A3: 'CU1',
    ADMIN: 'US Naval Base Guantanamo Bay',
    SOVEREIGNT: 'Cuba',
    ISO_A3_EH: '-99',
    TYPE: 'Lease',
  }),
  feature({
    ADM0_A3: 'KOS',
    SOV_A3: 'KOS',
    ADMIN: 'Kosovo',
    SOVEREIGNT: 'Kosovo',
    ISO_A3_EH: '-99',
    TYPE: 'Disputed',
  }),
  feature({
    ADM0_A3: 'ATA',
    SOV_A3: 'ATA',
    ADMIN: 'Antarctica',
    SOVEREIGNT: 'Antarctica',
    ISO_A3_EH: 'ATA',
    TYPE: 'Indeterminate',
  }),
  feature({
    ADM0_A3: 'PSX',
    SOV_A3: 'IS1',
    ADMIN: 'Palestine',
    SOVEREIGNT: 'Israel',
    ISO_A3_EH: 'PSE',
    TYPE: 'Indeterminate',
  }),
  feature({
    ADM0_A3: 'ISR',
    SOV_A3: 'IS1',
    ADMIN: 'Israel',
    SOVEREIGNT: 'Israel',
    ISO_A3_EH: 'ISR',
    TYPE: 'Disputed',
  }),
];

const curated: CuratedUnits = {
  codes: { KOS: { value: 'XKX', ...prov } },
  kinds: { XKX: { value: 'de_facto', ...prov } },
  promote: { PSX: { value: 'PSE', kind: 'state', ...prov } },
  units: { USG: { owner: 'USA', sovereign: 'CUB', ...prov }, ATA: { owner: null, ...prov } },
  capitals: {},
};

describe('rattachement des unités Natural Earth', () => {
  const table = buildEntities(features, curated);
  const entity = (id: string) => table.entities.find((e) => e.id === id);
  const unit = (a3: string) => table.units.find((u) => u.neA3 === a3);

  it('crée une entité par unité principale et par unité promue', () => {
    expect(table.entities.map((e) => e.id).sort()).toEqual([
      'CUB',
      'FRA',
      'ISR',
      'PSE',
      'USA',
      'XKX',
    ]);
    expect(entity('XKX')?.kind).toBe('de_facto');
    expect(entity('PSE')?.kind).toBe('state');
  });

  it('rattache un territoire dépendant à son État souverain', () => {
    expect(unit('NCL')?.role).toBe('dependency');
    expect(unit('NCL')?.owner).toBe(entity('FRA')?.index);
  });

  it('distingue contrôle et souveraineté pour une base louée, et neutralise l’Antarctique', () => {
    expect(unit('USG')?.owner).toBe(entity('USA')?.index);
    expect(unit('USG')?.sovereign).toBe(entity('CUB')?.index);
    expect(unit('ATA')?.owner).toBe(0);
  });

  it('refuse une unité principale sans code', () => {
    expect(() => buildEntities(features, { ...curated, codes: {} })).toThrow(/KOS/);
  });
});

describe('fichier curé ne_units.yaml', () => {
  it('exige la provenance de chaque entrée', () => {
    const raw = {
      version: 1,
      codes: { KOS: { value: 'XKX', source: 'x', date: '2026-09-25' } },
      kinds: {},
      promote: {},
      units: {},
      capitals: {},
    };
    expect(() => parseCuratedUnits(raw)).toThrow(/confidence/);
  });
});

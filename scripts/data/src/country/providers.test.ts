import { describe, expect, it } from 'vitest';
import {
  geoCode,
  parseImf,
  parseOwidChart,
  parseUndpHdi,
  parseUnhcr,
  parseUngaIdealPoints,
  parseWbCountries,
  parseWorldBank,
} from './providers.ts';
import { finalize, latest, meanOver, median, type Series } from './series.ts';

describe('séries annuelles', () => {
  const s: Series = new Map();
  s.set('FRA', [
    { year: 2021, value: 1 },
    { year: 2019, value: 3 },
    { year: 2021, value: 2 },
  ]);
  finalize(s);

  it('trie par année et garde la dernière observation de chaque année', () => {
    expect(s.get('FRA')).toEqual([
      { year: 2019, value: 3 },
      { year: 2021, value: 2 },
    ]);
  });

  it("renvoie l'observation la plus récente sous une année maximale", () => {
    expect(latest(s, 'FRA', 2030)).toEqual({ year: 2021, value: 2 });
    expect(latest(s, 'FRA', 2020)).toEqual({ year: 2019, value: 3 });
    expect(latest(s, 'FRA', 2000)).toBeNull();
    expect(latest(s, 'DEU', 2030)).toBeNull();
  });

  it('calcule moyennes et médianes', () => {
    expect(meanOver(s, 'FRA', 2015, 2025)).toEqual({
      value: 2.5,
      first: 2019,
      last: 2021,
      count: 2,
    });
    expect(meanOver(s, 'FRA', 2015, 2025, 3)).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
});

describe('Banque mondiale', () => {
  it('ignore les agrégats et les groupes de revenu inconnus', () => {
    const meta = parseWbCountries([
      {},
      [
        { id: 'FRA', name: 'France', region: { id: 'ECS' }, incomeLevel: { id: 'HIC' } },
        { id: 'EUU', name: 'European Union', region: { id: 'NA' }, incomeLevel: { id: 'NA' } },
        { id: 'VEN', name: 'Venezuela', region: { id: 'LCN' }, incomeLevel: { id: 'INX' } },
      ],
    ]);
    expect([...meta.keys()]).toEqual(['FRA', 'VEN']);
    expect(meta.get('VEN')?.income).toBeNull();
  });

  it('lit les valeurs, ignore les nulls et retrouve les codes WGI par nom', () => {
    const { series, lastUpdated } = parseWorldBank(
      [
        { lastupdated: '2026-07-01' },
        [
          {
            country: { id: 'FR', value: 'France' },
            countryiso3code: 'FRA',
            date: '2024',
            value: 68.4,
          },
          {
            country: { id: 'FR', value: 'France' },
            countryiso3code: 'FRA',
            date: '2025',
            value: null,
          },
          { country: { id: 'XK', value: 'Kosovo' }, countryiso3code: '', date: '2024', value: 1.7 },
          { country: { id: 'ZZ', value: 'Nowhere' }, countryiso3code: '', date: '2024', value: 9 },
        ],
      ],
      new Map([['Kosovo', 'KSV']]),
    );
    expect(lastUpdated).toBe('2026-07-01');
    expect(series.get('FRA')).toEqual([{ year: 2024, value: 68.4 }]);
    expect(series.get('XKX')).toEqual([{ year: 2024, value: 1.7 }]);
    expect(series.size).toBe(2);
  });

  it('rejette une réponse inattendue', () => {
    expect(() => parseWorldBank([{ message: 'Invalid value' }])).toThrow(/inattendue/);
  });
});

describe('autres sources', () => {
  it('FMI : convertit les codes non ISO', () => {
    const s = parseImf(
      { values: { NGDPD: { UVK: { '2026': 11.2 }, WBG: { '2025': 13 } } } },
      'NGDPD',
    );
    expect(s.get('XKX')).toEqual([{ year: 2026, value: 11.2 }]);
    expect(s.get('PSE')).toEqual([{ year: 2025, value: 13 }]);
    expect(geoCode('S19')).toBe('TWN');
    expect(() => parseImf({ values: {} }, 'NGDPD')).toThrow();
  });

  it('OWID : ignore les agrégats OWID_ sauf le Kosovo', () => {
    const s = parseOwidChart(
      'entity,code,year,score\nFrance,FRA,2024,0.8\nWorld,OWID_WRL,2024,0.5\nKosovo,OWID_KOS,2024,0.6\nAfrica,,2024,0.4\n',
    );
    expect([...s.keys()].sort()).toEqual(['FRA', 'XKX']);
  });

  it('HCR : additionne réfugiés et autres personnes à protéger ; refuse une réponse paginée', () => {
    const s = parseUnhcr(
      {
        maxPages: 1,
        items: [{ year: 2025, coa_iso: 'DEU', coo_iso: '-', refugees: 1000, oip: '50' }],
      },
      'asylum',
    );
    expect(s.get('DEU')).toEqual([{ year: 2025, value: 1050 }]);
    expect(() => parseUnhcr({ maxPages: 2, items: [] }, 'asylum')).toThrow(/paginée/);
  });

  it('AGNU et PNUD : ignore les valeurs manquantes', () => {
    const unga = parseUngaIdealPoints(
      'iso3c,year,IdealPointFP\nFRA,2024,1.2\nNA,2024,0.3\nDEU,2024,NA\n',
    );
    expect([...unga.keys()]).toEqual(['FRA']);
    const hdi = parseUndpHdi(
      'iso3,country,hdi_2022,hdi_2023\nNOR,Norway,0.96,0.97\nZZK.WORLD,World,0.7,0.7\n',
    );
    expect(hdi.get('NOR')).toEqual([
      { year: 2022, value: 0.96 },
      { year: 2023, value: 0.97 },
    ]);
    expect(hdi.size).toBe(1);
  });
});

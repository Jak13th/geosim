/**
 * Invariants de la carte construite par `npm run data` (4096 px). Ces tests sont ignorés tant
 * que data/build/map/ n'existe pas : ils ne demandent pas de réseau.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  Biome,
  MapFlag,
  Terrain,
  decodeMap,
  isLand,
  type MapGeo,
  type MapGrid,
  type MapMeta,
  type MapRoutes,
} from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import { BUILD_DIR } from '../paths.ts';

const dir = join(BUILD_DIR, 'map');
const built = existsSync(join(dir, 'map-4096.bin.gz'));

describe.skipIf(!built)('carte construite (4096 px)', () => {
  const load = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
  const buf = built ? gunzipSync(readFileSync(join(dir, 'map-4096.bin.gz'))) : Buffer.alloc(0);
  const map: MapGrid = built
    ? decodeMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
    : ({} as MapGrid);
  const meta = built ? load<MapMeta>('map-4096.json') : ({} as MapMeta);
  const geo = built ? load<MapGeo>('geo-4096.json') : ({} as MapGeo);
  const routes = built ? load<MapRoutes>('routes-4096.json') : ({} as MapRoutes);
  const entity = (id: string) => {
    const e = meta.entities.find((x) => x.id === id);
    if (!e) throw new Error(`entité ${id} absente`);
    return e;
  };

  it('porte le même identifiant de build dans tous les fichiers', () => {
    expect(meta.buildId).toBe(map.header.buildId);
    expect(geo.buildId).toBe(map.header.buildId);
    expect(routes.buildId).toBe(map.header.buildId);
  });

  it('respecte les invariants de pixels : bornes, conservation, eau sans propriétaire', () => {
    const { owner, sovereign, terrain, biome, seaZone, unit } = map.layers;
    const count = meta.entities.length;
    const owned = new Array<number>(count + 1).fill(0);
    let land = 0;
    let neutral = 0;
    let errors = 0;
    for (let p = 0; p < owner.length; p++) {
      const o = owner[p] as number;
      if (o > count || (sovereign[p] as number) > count) errors++;
      if (isLand(terrain[p] as number)) {
        land++;
        owned[o] = (owned[o] as number) + 1;
        if (o === 0) neutral++;
        if (biome[p] === Biome.None || unit[p] === 0) errors++;
      } else if (o !== 0) errors++;
      if (terrain[p] === Terrain.Lake && seaZone[p] !== 0) errors++;
    }
    expect(errors).toBe(0);
    // Conservation : la somme des pixels par entité et des pixels neutres égale la terre.
    expect(owned.reduce((s, v) => s + v, 0)).toBe(land);
    expect(meta.entities.reduce((s, e) => s + e.stats.pixels, 0) + neutral).toBe(land);
  });

  it('compte au moins 190 entités, chacune avec au moins un pixel et une capitale chez elle', () => {
    expect(meta.entities.length).toBeGreaterThanOrEqual(190);
    for (const e of meta.entities) {
      expect(e.stats.pixels, e.id).toBeGreaterThan(0);
      expect(e.capital, e.id).not.toBeNull();
      expect(map.layers.owner[e.capital?.pixel ?? -1], e.id).toBe(e.index);
      expect(
        (map.layers.flags[e.capital?.pixel ?? -1] as number) & MapFlag.Capital,
        e.id,
      ).toBeTruthy();
    }
  });

  it('donne des surfaces proches des surfaces officielles pour les grands pays', () => {
    // Surfaces totales (terres et eaux intérieures), en km² ; la carte découpe les grands lacs.
    const official: Record<string, number> = {
      RUS: 17_098_246,
      BRA: 8_515_767,
      AUS: 7_692_024,
      DZA: 2_381_741,
      ARG: 2_780_400,
      KAZ: 2_724_900,
      EGY: 1_001_450,
      DEU: 357_592,
    };
    for (const [id, area] of Object.entries(official)) {
      expect(Math.abs(entity(id).stats.areaKm2 - area) / area, id).toBeLessThan(0.05);
    }
  });

  it('identifie les pays sans accès à l’océan mondial', () => {
    for (const id of ['BOL', 'CHE', 'ETH', 'MNG', 'AZE', 'KAZ', 'AUT'])
      expect(entity(id).stats.landlocked, id).toBe(true);
    for (const id of ['FRA', 'EGY', 'CHL', 'IRN', 'RUS', 'PSE'])
      expect(entity(id).stats.landlocked, id).toBe(false);
  });

  it('trouve les frontières terrestres et maritimes attendues', () => {
    const land = (a: string, b: string) =>
      geo.landBorders.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const sea = (a: string, b: string) =>
      geo.maritimeBorders.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    for (const [a, b] of [
      ['FRA', 'ESP'],
      ['USA', 'CAN'],
      ['CHN', 'IND'],
      ['RUS', 'UKR'],
      ['BRA', 'ARG'],
    ]) {
      expect(land(a as string, b as string)?.km, `${a}–${b}`).toBeGreaterThan(100);
    }
    expect(land('FRA', 'GBR')).toBeUndefined();
    for (const [a, b] of [
      ['GBR', 'FRA'],
      ['USA', 'RUS'],
      ['CHN', 'TWN'],
      ['IRN', 'ARE'],
    ]) {
      expect(sea(a as string, b as string), `${a}–${b}`).toBeDefined();
    }
  });

  it('fait passer les routes maritimes par les bons détroits', () => {
    const route = (a: string, b: string) =>
      routes.routes.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
    const chnDeu = route('CHN', 'DEU');
    expect(chnDeu?.primary.straits).toEqual(
      expect.arrayContaining(['malacca', 'suez', 'gibraltar']),
    );
    expect(chnDeu?.alternative?.straits ?? []).not.toContain('suez');
    // Le Qatar n'a pas d'alternative au détroit d'Ormuz.
    expect(route('QAT', 'JPN')?.primary.straits).toContain('hormuz');
    expect(route('QAT', 'JPN')?.noAlternative).toBe(true);
    // Les ports ukrainiens de la mer Noire passent par les détroits turcs.
    expect(route('UKR', 'ITA')?.primary.straits).toContain('turkish_straits');
    // L'alternative évite tous les détroits de la route principale (elle peut être plus courte
    // en kilomètres réels si elle passe par les eaux polaires, pénalisées dans le choix).
    let bad = 0;
    for (const r of routes.routes) {
      if (!Number.isFinite(r.primary.km) || r.primary.km < 0) bad++;
      if (r.alternative?.straits.some((s) => r.primary.straits.includes(s))) bad++;
      if (r.alternative && r.primary.straits.length === 0) bad++;
    }
    expect(bad).toBe(0);
  });

  it('associe à chaque détroit ses riverains', () => {
    const riparians = (id: string) => meta.chokepoints.find((c) => c.id === id)?.riparians ?? [];
    expect(riparians('hormuz')).toEqual(expect.arrayContaining(['IRN', 'OMN']));
    expect(riparians('suez')).toContain('EGY');
    expect(riparians('panama')).toContain('PAN');
    expect(riparians('dover')).toEqual(expect.arrayContaining(['FRA', 'GBR']));
  });
});

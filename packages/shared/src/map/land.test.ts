import { describe, expect, it } from 'vitest';
import { Terrain } from './layers.ts';
import { decodeLand, encodeLand, landIndex } from './land.ts';

describe('couches terrestres compactées', () => {
  it('indexent les pixels terrestres dans l’ordre', () => {
    const terrain = new Uint8Array([Terrain.Sea, Terrain.Plain, Terrain.Lake, Terrain.Mountain]);
    expect([...landIndex(terrain)]).toEqual([1, 3]);
  });

  it('font l’aller-retour encodage → décodage', () => {
    const population = new Float32Array([0, 1.5, 1e6]);
    const economicValue = new Float32Array([0, 0.25, 3000]);
    const bytes = encodeLand('abc123', { population, economicValue });
    const { header, layers } = decodeLand(bytes.buffer);
    expect(header.buildId).toBe('abc123');
    expect(header.count).toBe(3);
    expect([...layers.population]).toEqual([...population]);
    expect([...layers.economicValue]).toEqual([...economicValue]);
  });
});

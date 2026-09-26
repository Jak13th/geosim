import { CATALOG, type ResolvedValue } from '@geosim/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFINITIONAL_DERIVATIONS,
  derivationOf,
  deriveValue,
  weakestConfidence,
  type Derivation,
} from './derived.ts';

function derivation(id: string): Derivation {
  const d = derivationOf(id);
  if (d === undefined) throw new Error(`Dérivation absente : ${id}`);
  return d;
}

const rv = (
  value: number,
  date: string,
  confidence: ResolvedValue['confidence'],
): ResolvedValue => ({
  value,
  source: 'TEST',
  date,
  confidence,
  method: 'source',
});

describe('paramètres dérivés par définition', () => {
  it('ne portent que sur des paramètres dérivés du catalogue', () => {
    for (const d of DEFINITIONAL_DERIVATIONS) {
      expect(CATALOG.find((p) => p.id === d.id)?.kind, d.id).toBe('derived');
      for (const input of d.inputs)
        expect(
          CATALOG.some((p) => p.id === input),
          input,
        ).toBe(true);
    }
  });

  it('calcule le PIB par habitant en dollars', () => {
    const values: Record<string, ResolvedValue> = {
      'eco.gdp_nominal': rv(3000, '2026', 'medium'),
      'demo.population': rv(60e6, '2025', 'high'),
    };
    const r = deriveValue(derivation('eco.gdp_per_capita'), (id) => values[id]);
    expect(r?.value).toBeCloseTo(50_000);
    expect(r).toMatchObject({
      source: 'DER',
      method: 'derived',
      date: '2026',
      confidence: 'medium',
    });
    expect(r?.note).toMatch(/demo\.population : TEST, 2025/);
  });

  it('ne produit ni infini ni valeur sans entrée', () => {
    const d = derivation('eco.gdp_per_capita');
    const zeroPop: Record<string, ResolvedValue> = {
      'eco.gdp_nominal': rv(1, '2026', 'high'),
      'demo.population': rv(0, '2026', 'high'),
    };
    expect(deriveValue(d, (id) => zeroPop[id])?.value).toBe(0);
    expect(deriveValue(d, () => undefined)).toBeNull();
    expect(
      deriveValue(d, (id) =>
        id === 'eco.gdp_nominal' ? zeroPop[id] : { ...rv(0, '', 'high'), value: null },
      ),
    ).toBeNull();
  });

  it('additionne inflation et chômage pour l’indice de misère', () => {
    const values: Record<string, ResolvedValue> = {
      'eco.inflation': rv(3, '2026', 'high'),
      'eco.unemployment': rv(7, '2025', 'low'),
    };
    const r = deriveValue(derivation('eco.misery_index'), (id) => values[id]);
    expect(r?.value).toBe(10);
    expect(r?.confidence).toBe('low');
  });

  it('retient la confiance la plus faible', () => {
    expect(weakestConfidence([])).toBe('high');
    expect(weakestConfidence([{ confidence: 'medium' }, { confidence: 'assumption' }])).toBe(
      'assumption',
    );
  });
});

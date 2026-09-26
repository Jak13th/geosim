/**
 * Infobulle de survol (SPEC §9.2) : nom, cinq indicateurs clés avec leur année, valeur de la
 * couche affichée, relation avec le pays sélectionné, et détail du pixel pour les couches
 * physiques.
 */
import {
  BIOME_LABELS,
  CATALOG,
  TERRAIN_LABELS,
  isLand,
  type BiomeId,
  type TerrainId,
} from '@geosim/shared';
import type { Dataset } from '../data/dataset.ts';
import { formatNumber, formatQuantity } from '../format.ts';
import { toCss } from '../map/colors.ts';
import type { LayerView } from '../map/layers.ts';
import { useApp } from '../store.ts';
import { KIND_LABELS } from './Inspector.tsx';
import { dataYear } from './provenance.ts';

const KEY_INDICATORS = [
  'demo.population',
  'eco.gdp_nominal',
  'eco.gdp_per_capita',
  'pol.stability',
  'mil.budget',
] as const;

function pixelDetail(data: Dataset, pixel: number, layer: string): string | null {
  const L = data.raw.grid.layers;
  const terrain = L.terrain[pixel] ?? 0;
  if (!isLand(terrain)) {
    if (layer !== 'sea') return null;
    const zone = L.seaZone[pixel] ?? 0;
    return (
      data.raw.meta.seaZones.find((z) => z.index === zone)?.nameFr ??
      TERRAIN_LABELS[terrain as TerrainId]
    );
  }
  if (layer === 'terrain') {
    return `${TERRAIN_LABELS[terrain as TerrainId]} · ${BIOME_LABELS[(L.biome[pixel] ?? 0) as BiomeId]} · ${formatNumber(L.elevation[pixel] ?? 0)} m`;
  }
  if (layer === 'population') {
    const { index, layers } = data.raw.land;
    // Recherche dichotomique du pixel dans la table des pixels terrestres.
    let lo = 0;
    let hi = index.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = index[mid] as number;
      if (p === pixel) {
        const density = (layers.population[mid] as number) / data.raw.grid.header.pixelAreaKm2;
        return `${formatNumber(density)} hab./km² (pixel de ${formatNumber(data.raw.grid.header.pixelAreaKm2)} km²)`;
      }
      if (p < pixel) lo = mid + 1;
      else hi = mid - 1;
    }
    return null;
  }
  if (layer === 'infrastructure') {
    const urban = L.urban[pixel] ?? 0;
    return urban > 0 ? `Zone urbaine : ${Math.round((urban / 255) * 100)} % du pixel` : null;
  }
  return null;
}

export function Tooltip({ data, layerView }: { data: Dataset; layerView: LayerView }) {
  const hovered = useApp((s) => s.hovered);
  const pixel = useApp((s) => s.hoverPixel);
  const selected = useApp((s) => s.selected);
  const layer = useApp((s) => s.layer);
  const e = hovered ? data.byIndex[hovered] : undefined;
  const detail = pixel >= 0 ? pixelDetail(data, pixel, layer) : null;
  if (e === undefined && detail === null) return null;
  const sel = selected && selected !== hovered ? data.byIndex[selected] : undefined;
  const relation = e && sel ? data.pair('pair.relation', sel.id, e.id) : null;
  const war = e && sel ? data.pair('pair.war_state', sel.id, e.id)?.value : null;
  const layerText = e ? layerView.describe(e) : null;
  return (
    <div className="tooltip-body">
      {e && (
        <>
          <div className="tooltip-title">
            <span className="swatch" style={{ background: toCss(e.color) }} />
            <strong>{e.nameFr}</strong>
            <span className="muted small">{KIND_LABELS[e.kind]}</span>
          </div>
          <table>
            <tbody>
              {KEY_INDICATORS.map((id) => {
                const def = CATALOG.find((d) => d.id === id);
                const r = data.param(e, id);
                if (def === undefined || r.state !== 'value' || typeof r.value.value !== 'number')
                  return null;
                return (
                  <tr key={id}>
                    <th>{def.label}</th>
                    <td>{formatQuantity(r.value.value, def.unit)}</td>
                    <td className="muted">{dataYear(r.value.date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {layerText && <p className="tooltip-layer">{layerText}</p>}
          {sel && layerView.mode === 'entity' && layer !== 'relations' && (
            <p className="muted small">
              Avec {sel.nameFr} :{' '}
              {war === 'war'
                ? 'en guerre'
                : typeof relation?.value === 'number'
                  ? `relation ${relation.value > 0 ? '+' : ''}${relation.value}`
                  : 'relation non renseignée'}
            </p>
          )}
        </>
      )}
      {detail && <p className="muted small">{detail}</p>}
    </div>
  );
}

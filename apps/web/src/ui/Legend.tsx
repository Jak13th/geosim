/** Légende dynamique de la couche affichée (SPEC §9.2). */
import { toCss } from '../map/colors.ts';
import type { LayerView, LegendItem } from '../map/layers.ts';
import { useApp } from '../store.ts';

function Swatch({ item }: { item: Extract<LegendItem, { kind: 'swatch' }> }) {
  const color = toCss(item.color);
  const style =
    item.pattern === 'hatch'
      ? { background: `repeating-linear-gradient(135deg, ${color} 0 3px, #4a5560 3px 7px)` }
      : item.pattern === 'dots'
        ? { background: `radial-gradient(#10151b 30%, transparent 32%) 0 0 / 4px 4px, ${color}` }
        : item.pattern === 'line'
          ? { background: `linear-gradient(transparent 40%, ${color} 40% 60%, transparent 60%)` }
          : item.pattern === 'marker'
            ? { background: color, transform: 'rotate(45deg) scale(0.7)' }
            : { background: color };
  return <span className="swatch" style={style} />;
}

export function Legend({ layerView }: { layerView: LayerView }) {
  const open = useApp((s) => s.legendOpen);
  const setOpen = useApp((s) => s.setLegendOpen);
  const { legend } = layerView;
  return (
    <section className={`legend panel${open ? '' : ' closed'}`} aria-label="Légende">
      <button
        type="button"
        className="legend-title"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {legend.title}
        <span className="muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul>
          {legend.items.map((item, k) => {
            if (item.kind === 'note') {
              return (
                <li key={k} className="note">
                  {item.text}
                </li>
              );
            }
            if (item.kind === 'gradient') {
              const stops = item.colors
                .map((c, i) => `${toCss(c)} ${((100 * i) / (item.colors.length - 1)).toFixed(1)}%`)
                .join(', ');
              return (
                <li key={k} className="gradient">
                  <div className="bar" style={{ background: `linear-gradient(90deg, ${stops})` }} />
                  <div className="ticks">
                    {item.ticks.map((t) => (
                      <span key={t.label} style={{ left: `${(t.at * 100).toFixed(1)}%` }}>
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <div className="caption muted">{item.caption}</div>
                </li>
              );
            }
            return (
              <li key={k}>
                <Swatch item={item} />
                <span>{item.label}</span>
                {item.count !== undefined && <span className="count">{item.count}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

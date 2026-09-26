import { useEffect, useRef, useState } from 'react';
import { ErrorNote, Loading, PageHead, Stat } from '../components/ui.jsx';
import { useApi } from '../state.jsx';
import { fmt } from '../util.js';

const VIEWS = [
  ['community', 'Community'],
  ['given', 'Shared by you'],
  ['received', 'Received by you'],
];

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v) {
  if (v <= 10) return 10;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= v) * pow;
  return Math.ceil(v / step) * step;
}

const dayLabel = (iso, opts) => new Date(`${iso}T12:00:00`).toLocaleDateString([], opts);

/** Columns of meals redistributed per day, with a per-column tooltip and a table view. */
function DailyChart({ daily }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = 220;
  const pad = { top: 22, right: 8, bottom: 28, left: 36 };
  const innerW = Math.max(100, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...daily.map((d) => d.community), 1));
  const ticks = [0, max / 2, max];
  const band = innerW / daily.length;
  const barW = Math.min(24, band - 2);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const base = pad.top + innerH;
  const last = daily.length - 1;
  const showLabel = (i) => i === 0 || i === last || i % Math.ceil(daily.length / (width < 480 ? 4 : 7)) === 0;

  const column = (x, top, w) => {
    const h = base - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  };

  const h = hover != null ? daily[hover] : null;
  const tipX = hover != null ? pad.left + band * hover + band / 2 : 0;

  return (
    <figure className="chart">
      <figcaption>
        <b>Meals redistributed per day</b>
        <span>Community total, last 14 days</span>
      </figcaption>
      <div className="chart-box" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={`Meals redistributed per day over the last ${daily.length} days`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {daily.map((d, i) => {
            const x = pad.left + band * i + (band - barW) / 2;
            return (
              <g key={d.date}>
                <path className={`bar ${hover === i ? 'on' : ''} ${hover != null && hover !== i ? 'dim' : ''}`} d={column(x, y(d.community), barW)} />
                {showLabel(i) && (
                  <text className="axis" x={x + barW / 2} y={height - 8} textAnchor="middle">
                    {i === last ? 'Today' : dayLabel(d.date, { day: 'numeric', month: 'short' })}
                  </text>
                )}
                <rect
                  className="hit"
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  tabIndex={0}
                  aria-label={`${dayLabel(d.date, { weekday: 'long', day: 'numeric', month: 'long' })}: ${d.community} meals`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
          {daily[last].community > 0 && hover == null && (
            <text className="value" x={pad.left + band * last + band / 2} y={y(daily[last].community) - 6} textAnchor="middle">
              {daily[last].community}
            </text>
          )}
        </svg>
        {h && (
          <div className="tip" style={{ left: Math.min(Math.max(tipX, 80), width - 80), top: Math.max(0, y(h.community) - 70) }}>
            <b>{dayLabel(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            <span>
              <i className="swatch" /> {fmt(h.community)} meals
            </span>
            {h.mine > 0 && <small>You were part of {fmt(h.mine)}</small>}
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">Community meals</th>
                <th className="num">Involving you</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date}>
                  <td>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td className="num">{fmt(d.community)}</td>
                  <td className="num">{fmt(d.mine)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export default function Impact() {
  const [view, setView] = useState('community');
  const { data, error, loading, reload } = useApi(`/me/impact?tz=${new Date().getTimezoneOffset()}`);

  if (loading && !data) return <Loading />;
  const t = data?.[view];

  return (
    <div className="page">
      <PageHead title="Impact" sub="Food that was eaten instead of thrown away." />
      <ErrorNote error={error} onRetry={reload} />
      {data && (
        <>
          <div className="seg" role="tablist">
            {VIEWS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="stats">
            <Stat lead value={fmt(t.meals)} label={view === 'received' ? 'Meals received' : 'Meals redistributed'} />
            <Stat value={fmt(t.kg)} unit="kg" label="Food rescued" />
            <Stat value={fmt(t.people)} label="People served" />
            <Stat value={fmt(t.donations)} label={view === 'received' ? 'Pickups completed' : 'Donations completed'} />
            <Stat value={fmt(t.co2e)} unit="kg CO₂e" label="Estimated waste emissions avoided" />
          </div>
          <p className="muted small">
            {view === 'community' && `${fmt(t.providers)} providers shared food with ${fmt(t.receivers)} receivers.`}
            {view === 'given' && `${fmt(data.given.posts)} posts shared, ${fmt(data.given.meals_posted)} meals offered in total.`}
            {view === 'received' && `Collected from ${fmt(t.providers)} different providers.`}
          </p>
          <DailyChart daily={data.daily} />
          <p className="fine">
            Estimates: {data.factors.kg_per_meal * 1000} g of food per meal and {data.factors.co2e_per_kg} kg CO₂e avoided per kg of food kept out of
            landfill. People served is what receivers reported when requesting.
          </p>
        </>
      )}
    </div>
  );
}

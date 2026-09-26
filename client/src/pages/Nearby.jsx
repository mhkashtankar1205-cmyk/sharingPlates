import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FoodMap } from '../components/maps.jsx';
import { PostActionButton } from '../components/PostCard.jsx';
import { RequestSheet } from '../components/RequestSheet.jsx';
import { Empty, ErrorNote, FoodImage, Icon, Loading, PageHead, StatusPill } from '../components/ui.jsx';
import { useApi, useAuth, useLive } from '../state.jsx';
import { currentPosition, isUrgent, km, timeLeft, useNow } from '../util.js';

const SORTS = [
  ['best', 'Best match'],
  ['distance', 'Distance'],
  ['quantity', 'Quantity'],
  ['urgency', 'Urgency'],
];
const RADII = [1, 2, 5, 10, 25];

export default function Nearby() {
  const { user } = useAuth();
  const { toast } = useLive();
  const now = useNow();
  const [sort, setSort] = useState('best');
  const [radius, setRadius] = useState(RADII.includes(user.radius_km) ? user.radius_km : 5);
  const [here, setHere] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [requesting, setRequesting] = useState(null);

  const origin = here || (user.has_location ? { lat: user.lat, lng: user.lng } : null);
  const q = new URLSearchParams({ sort, radius, limit: 50 });
  if (here) {
    q.set('lat', here.lat);
    q.set('lng', here.lng);
  }
  const { data, error, loading, reload, setData } = useApi(`/posts?${q}`);

  const posts = useMemo(() => (data?.posts ?? []).map((p) => ({ ...p, urgent: isUrgent(p, now) })), [data, now]);
  const sel = posts.find((p) => p.id === selected);

  async function useHere() {
    setLocating(true);
    try {
      setHere(await currentPosition());
    } catch (e) {
      toast(e.message, { tone: 'urgent' });
    } finally {
      setLocating(false);
    }
  }

  function select(id) {
    setSelected(id);
    document.getElementById(`row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  return (
    <div className="page wide">
      <PageHead title="Nearby food" sub={here ? 'Around your current location' : `Around ${user.locality || 'your saved location'}`}>
        <button className="btn ghost sm" onClick={here ? () => setHere(null) : useHere} disabled={locating}>
          <Icon name="locate" size={16} />
          {locating ? 'Locating…' : here ? 'Use saved location' : 'Use where I am now'}
        </button>
      </PageHead>

      <div className="nearby">
        <div className="nearby-map">
          <FoodMap origin={data?.origin || origin} radiusKm={radius} posts={posts} selectedId={selected} onSelect={select} height={420} />
          <div className="map-legend">
            <span><i className="dot good" /> Available</span>
            <span><i className="dot urgent" /> Expires within 1 hour</span>
            <span><i className="dot muted" /> Claimed</span>
            <span className="muted">Numbers show meals left</span>
          </div>
          {sel && (
            <div className="map-card">
              <FoodImage post={sel} className="thumb" />
              <div className="grow">
                <Link to={`/posts/${sel.id}`}>
                  <b>{sel.title}</b>
                </Link>
                <small>
                  {sel.provider.name} · <span className="mono">{km(sel.distance_km)}</span> · {timeLeft(sel.available_until, now)}
                </small>
              </div>
              <PostActionButton post={sel} onRequest={setRequesting} />
            </div>
          )}
        </div>

        <div className="nearby-list">
          <div className="ai-note">
            <Icon name="spark" size={18} />
            <span>
              <b>Smart ranking.</b> “Best match” weighs how close the food is, how many meals are left and how soon it expires.
            </span>
          </div>
          <div className="toolbar">
            <div className="seg" role="tablist" aria-label="Sort by">
              {SORTS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={sort === k} className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>
                  {l}
                </button>
              ))}
            </div>
            <label className="radius">
              <span className="sr-only">Radius</span>
              <select id="nearby-radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    Within {r} km
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ErrorNote error={error} onRetry={reload} />
          {loading && !data && <Loading />}
          {data && posts.length === 0 && (
            <Empty icon="nearby" title={`Nothing within ${radius} km right now`}>
              Try a wider radius. You'll be notified when food is posted near you.
            </Empty>
          )}
          <div className="rows">
            {posts.map((p) => (
              <Link
                key={p.id}
                id={`row-${p.id}`}
                to={`/posts/${p.id}`}
                className={`row ${selected === p.id ? 'sel' : ''}`}
                onMouseEnter={() => setSelected(p.id)}
                onFocus={() => setSelected(p.id)}
              >
                <FoodImage post={p} className="thumb" />
                <span className="row-main">
                  <b>{p.title}</b>
                  <small>
                    {p.provider.name} · {p.open ? `${p.remaining} of ${p.quantity} meals left` : 'fully claimed'}
                  </small>
                </span>
                <span className="row-end">
                  <span className="mono">{p.is_mine ? 'Yours' : km(p.distance_km)}</span>
                  {!p.open ? (
                    <StatusPill status={p.status} />
                  ) : p.urgent ? (
                    <StatusPill status="urgent" label={timeLeft(p.available_until, now)} />
                  ) : (
                    <small>{timeLeft(p.available_until, now)}</small>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <RequestSheet
        post={requesting}
        open={!!requesting}
        onClose={() => setRequesting(null)}
        onSent={() => setData((d) => ({ ...d, posts: d.posts.map((p) => (p.id === requesting.id ? { ...p, my_request: 'pending' } : p)) }))}
      />
    </div>
  );
}

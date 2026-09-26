import { useState } from 'react';
import { Link } from 'react-router';
import { PostCard } from '../components/PostCard.jsx';
import { RequestSheet } from '../components/RequestSheet.jsx';
import { Empty, ErrorNote, FoodImage, Icon, Loading, Stat } from '../components/ui.jsx';
import { useApi, useAuth } from '../state.jsx';
import { fmt, isUrgent, timeLeft, useNow } from '../util.js';

const FEED_RADIUS = 25;

function Rail() {
  const { data: impact } = useApi(`/me/impact?tz=${new Date().getTimezoneOffset()}`);
  const { data: reqs } = useApi('/me/requests');
  const ready = reqs?.requests.filter((r) => r.status === 'accepted') ?? [];
  return (
    <aside className="rail">
      {ready.length > 0 && (
        <section className="rail-box attention">
          <h2>Ready for pickup</h2>
          {ready.map((r) => (
            <Link key={r.id} to={`/posts/${r.post.id}`} className="rail-row">
              <FoodImage post={r.post} className="thumb sm" />
              <span>
                <b>{r.post.title}</b>
                <small>
                  {r.quantity} meals · code <span className="mono">{r.pickup_code}</span>
                </small>
              </span>
            </Link>
          ))}
        </section>
      )}
      {impact && (
        <section className="rail-box">
          <h2>Community impact</h2>
          <div className="rail-stats">
            <Stat value={fmt(impact.community.meals)} label="meals redistributed" />
            <Stat value={fmt(impact.community.kg)} unit="kg" label="food rescued" />
          </div>
          <Link to="/impact" className="link">
            See the full dashboard <Icon name="chevron" size={14} />
          </Link>
        </section>
      )}
      <section className="rail-box quiet">
        <h2>Have extra food?</h2>
        <p>Post it in under a minute. Nearby hostels, NGOs and people are alerted straight away.</p>
        <Link to="/post" className="btn sm">
          <Icon name="plus" size={16} /> Share food
        </Link>
      </section>
    </aside>
  );
}

export default function Feed() {
  const { user } = useAuth();
  const now = useNow();
  const [limit, setLimit] = useState(10);
  const [requesting, setRequesting] = useState(null);
  const { data, error, loading, reload, setData } = useApi(`/posts?sort=best&radius=${FEED_RADIUS}&limit=${limit}`);

  const posts = data?.posts ?? [];
  const urgent = posts.filter((p) => isUrgent(p, now) && !p.is_mine);
  const update = (next) => setData((d) => ({ ...d, posts: d.posts.map((p) => (p.id === next.id ? next : p)) }));

  return (
    <div className="with-rail">
      <div className="feed">
        {!user.has_location && (
          <div className="banner">
            <Icon name="pin" size={18} />
            <span className="grow">Set your location to see food closest to you and get nearby alerts.</span>
            <Link to="/settings" className="btn sm">
              Set location
            </Link>
          </div>
        )}

        {urgent.length > 0 && (
          <section className="stories" aria-label="Expiring soon">
            {urgent.map((p) => (
              <Link key={p.id} to={`/posts/${p.id}`} className="story">
                <span className="ring">
                  <FoodImage post={p} />
                </span>
                <span className="story-name">{p.provider.name}</span>
                <span className="story-time">{timeLeft(p.available_until, now).replace(' left', '')}</span>
              </Link>
            ))}
          </section>
        )}

        <div className="feed-head">
          <div>
            <h1>Food near {user.locality || 'you'}</h1>
            <p>Ranked by distance, meals left and time before it runs out · within {FEED_RADIUS} km</p>
          </div>
        </div>

        <ErrorNote error={error} onRetry={reload} />
        {loading && !data && <Loading label="Finding food near you…" />}
        {data && posts.length === 0 && (
          <Empty title="No food posted nearby right now" action={<Link to="/post" className="btn">Share food</Link>}>
            You'll get a notification as soon as something is posted within {user.radius_km} km.
          </Empty>
        )}
        {posts.map((p) => (
          <PostCard key={p.id} post={p} now={now} onRequest={setRequesting} onChange={update} />
        ))}
        {data && data.total > posts.length && (
          <div className="center pad">
            {limit < 50 ? (
              <button className="btn ghost" onClick={() => setLimit((l) => l + 10)} disabled={loading}>
                {loading ? 'Loading…' : `Show more (${data.total - posts.length} more)`}
              </button>
            ) : (
              <Link to="/nearby" className="btn ghost">
                See everything on the Nearby map
              </Link>
            )}
          </div>
        )}
        {data && posts.length > 0 && data.total <= posts.length && (
          <p className="fine center pad">That's everything available within {FEED_RADIUS} km.</p>
        )}
      </div>
      <Rail />
      <RequestSheet
        post={requesting}
        open={!!requesting}
        onClose={() => setRequesting(null)}
        onSent={() => update({ ...requesting, my_request: 'pending', pending: requesting.pending + 1 })}
      />
    </div>
  );
}

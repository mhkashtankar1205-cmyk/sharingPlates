import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorNote, FoodImage, Icon, Loading, PageHead, StatusPill } from '../components/ui.jsx';
import { useApi } from '../state.jsx';
import { POST_STATUS, ago, timeLeft, useNow } from '../util.js';

const FILTERS = ['all', 'active', 'requested', 'partial', 'claimed', 'completed', 'inactive'];

export default function MyPosts() {
  const now = useNow();
  const [filter, setFilter] = useState('all');
  const { data, error, loading, reload } = useApi('/me/posts');
  const posts = (data?.posts ?? []).filter((p) => filter === 'all' || p.status === filter);

  return (
    <div className="page narrow">
      <PageHead title="My posts" sub="Everything you've shared, and what needs your attention.">
        <Link to="/post" className="btn sm">
          <Icon name="plus" size={16} /> Share food
        </Link>
      </PageHead>

      <div className="seg scroll" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : POST_STATUS[f]}
            <span className="n">{f === 'all' ? data?.total ?? 0 : data?.counts[f] ?? 0}</span>
          </button>
        ))}
      </div>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && posts.length === 0 && (
        <Empty
          title={filter === 'all' ? "You haven't shared any food yet" : `No ${POST_STATUS[filter].toLowerCase()} posts`}
          action={filter === 'all' && <Link to="/post" className="btn">Share food</Link>}
        >
          {filter === 'all' && 'Post extra food from a party, restaurant or your kitchen and nearby people will be notified.'}
        </Empty>
      )}

      <div className="myposts">
        {posts.map((p) => {
          const pct = Math.round((p.claimed / p.quantity) * 100);
          return (
            <Link key={p.id} to={`/posts/${p.id}`} className="mypost">
              <FoodImage post={p} className="thumb lg" />
              <div className="grow">
                <div className="mypost-top">
                  <b>{p.title}</b>
                  <StatusPill status={p.status} />
                </div>
                <div className="progress" aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <small className="muted">
                  <span className="mono">
                    {p.claimed}/{p.quantity}
                  </span>{' '}
                  meals claimed ·{' '}
                  {p.status === 'completed' ? `completed ${ago(p.completed_at || p.available_until, now)}` : p.available_until > now ? timeLeft(p.available_until, now) : `ended ${ago(p.available_until, now)}`}
                </small>
                {p.pending > 0 && (
                  <span className="needs">
                    <Icon name="hands" size={16} /> {p.pending} {p.pending === 1 ? 'request is' : 'requests are'} waiting for your answer
                  </span>
                )}
              </div>
              <Icon name="chevron" className="muted" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

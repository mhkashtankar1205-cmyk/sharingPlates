import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';
import { Empty, ErrorNote, FoodImage, Icon, Loading, PageHead, RequestPill } from '../components/ui.jsx';
import { useApi, useLive } from '../state.jsx';
import { ago, dayClock, useNow } from '../util.js';

export default function MyRequests() {
  const now = useNow();
  const { toast } = useLive();
  const [tab, setTab] = useState('current');
  const [busy, setBusy] = useState(null);
  const { data, error, loading, reload } = useApi('/me/requests');
  const all = data?.requests ?? [];
  const current = all.filter((r) => r.status === 'pending' || r.status === 'accepted');
  const past = all.filter((r) => r.status !== 'pending' && r.status !== 'accepted');
  const list = tab === 'current' ? current : past;

  async function act(r, action, msg) {
    setBusy(r.id);
    try {
      await api(`/requests/${r.id}/${action}`, { method: 'POST' });
      toast(msg);
      reload();
    } catch (e) {
      toast(e.message, { tone: 'urgent' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="page narrow">
      <PageHead title="My requests" sub="Food you've asked for, and your pickup codes." />
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'current'} className={tab === 'current' ? 'on' : ''} onClick={() => setTab('current')}>
          Current <span className="n">{current.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'past'} className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>
          Past <span className="n">{past.length}</span>
        </button>
      </div>

      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && (
        <Empty icon="inbox" title={tab === 'current' ? 'No open requests' : 'No past requests yet'} action={tab === 'current' && <Link to="/nearby" className="btn">Find food nearby</Link>} />
      )}

      <div className="reqlist">
        {list.map((r) => (
          <article key={r.id} className={`reqcard ${r.status}`}>
            <Link to={`/posts/${r.post.id}`} className="reqcard-top">
              <FoodImage post={r.post} className="thumb lg" />
              <div className="grow">
                <b>{r.post.title}</b>
                <small className="muted">
                  {r.post.provider.name} · {r.quantity} meals · requested {ago(r.created_at, now)}
                </small>
                <RequestPill status={r.status} />
              </div>
            </Link>
            {r.status === 'accepted' && (
              <div className="reqcard-pickup">
                <div>
                  <small className="eyebrow">Pickup code</small>
                  <div className="code sm">{r.pickup_code}</div>
                </div>
                <dl className="kv">
                  <dt>Address</dt>
                  <dd>{r.post.address}</dd>
                  <dt>By</dt>
                  <dd>{dayClock(r.post.available_until, now)}</dd>
                  {r.post.provider.phone && (
                    <>
                      <dt>Contact</dt>
                      <dd className="mono selectable">{r.post.provider.phone}</dd>
                    </>
                  )}
                </dl>
                <div className="row-btns wrap">
                  <a className="btn ghost sm" href={`https://www.google.com/maps/dir/?api=1&destination=${r.post.lat},${r.post.lng}`} target="_blank" rel="noreferrer">
                    <Icon name="pin" size={16} /> Directions
                  </a>
                  <button className="btn sm" disabled={busy === r.id} onClick={() => act(r, 'complete', 'Marked as picked up. Thank you!')}>
                    <Icon name="check" size={16} /> I've picked it up
                  </button>
                  <button className="btn ghost sm danger-text" disabled={busy === r.id} onClick={() => act(r, 'cancel', 'Request cancelled.')}>
                    Can't make it
                  </button>
                </div>
              </div>
            )}
            {r.status === 'pending' && (
              <div className="row-btns">
                <span className="muted small grow">Waiting for {r.post.provider.name} to accept.</span>
                <button className="btn ghost sm" disabled={busy === r.id} onClick={() => act(r, 'cancel', 'Request cancelled.')}>
                  Cancel
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

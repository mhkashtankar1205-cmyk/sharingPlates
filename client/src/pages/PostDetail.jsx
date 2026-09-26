import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../api.js';
import { PickupMap } from '../components/maps.jsx';
import { RequestSheet } from '../components/RequestSheet.jsx';
import { Avatar, Empty, ErrorNote, FoodImage, FoodMark, Icon, Loading, RequestPill, StatusPill } from '../components/ui.jsx';
import { useApi, useLive } from '../state.jsx';
import { ACCOUNT_LABEL, SOURCE_LABEL, ago, dayClock, isUrgent, km, timeLeft, useNow } from '../util.js';

/** Runs an API action with busy/error handling, then reloads. */
function useAction(reload) {
  const { toast } = useLive();
  const [busy, setBusy] = useState(null);
  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      const r = await fn();
      if (success) toast(typeof success === 'function' ? success(r) : success);
      reload();
      return r;
    } catch (e) {
      toast(e.message, { tone: 'urgent' });
    } finally {
      setBusy(null);
    }
  };
  return [busy, run];
}

function ConfirmPickup({ request, busy, onConfirm }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="confirm-code"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(code);
      }}
    >
      <label className="sr-only" htmlFor={`code-${request.id}`}>
        Pickup code from {request.requester.name}
      </label>
      <input
        id={`code-${request.id}`}
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        placeholder="4-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        required
      />
      <button className="btn sm" disabled={busy || code.length !== 4}>
        <Icon name="check" size={16} />
        Confirm pickup
      </button>
    </form>
  );
}

function OwnerPanel({ post, requests, reload }) {
  const navigate = useNavigate();
  const [busy, run] = useAction(reload);
  const [confirming, setConfirming] = useState(null);
  const pct = Math.round((post.claimed / post.quantity) * 100);
  const closed = post.status === 'completed';
  const expired = post.available_until <= Date.now();
  const open = requests.filter((r) => r.status === 'pending' || r.status === 'accepted');
  const past = requests.filter((r) => r.status !== 'pending' && r.status !== 'accepted');

  const patch = (body, msg) => run('patch', () => api(`/posts/${post.id}`, { method: 'PATCH', body }), msg);
  const extend = () => patch({ available_until: Math.max(Date.now(), post.available_until) + 3600000 }, 'Extended by 1 hour.');

  return (
    <>
      <section className="panel">
        <div className="panel-top">
          <h2>Your post</h2>
          <StatusPill status={post.status} />
        </div>
        <div className="progress" aria-label={`${post.claimed} of ${post.quantity} meals claimed`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          <b className="ink">{post.claimed}</b> of {post.quantity} meals claimed · {post.remaining} left
          {post.matched_count > 0 && <> · sent to {post.matched_count} nearby receivers</>}
        </p>

        {!closed && (
          <div className="row-btns wrap">
            <button className="btn ghost sm" onClick={extend} disabled={!!busy}>
              <Icon name="clock" size={16} /> Extend 1 hour
            </button>
            {post.is_active && !expired ? (
              <button className="btn ghost sm" onClick={() => patch({ is_active: false }, 'Post marked inactive. Waiting requests were declined.')} disabled={!!busy}>
                Mark inactive
              </button>
            ) : (
              <button
                className="btn ghost sm"
                onClick={() => patch(expired ? { is_active: true, available_until: Date.now() + 2 * 3600000 } : { is_active: true }, 'Post is active again.')}
                disabled={!!busy}
              >
                Make active{expired ? ' for 2 hours' : ''}
              </button>
            )}
            {confirming === 'complete' ? (
              <span className="inline-confirm">
                Close this post{open.some((r) => r.status === 'accepted') ? ' and mark accepted pickups as done' : ''}?
                <button className="btn sm" onClick={() => run('complete', () => api(`/posts/${post.id}/complete`, { method: 'POST' }), 'Post marked completed. Thank you!')}>
                  Yes, complete
                </button>
                <button className="link" onClick={() => setConfirming(null)}>
                  Keep open
                </button>
              </span>
            ) : (
              <button className="btn sm" onClick={() => setConfirming('complete')} disabled={!!busy}>
                <Icon name="check" size={16} /> Mark completed
              </button>
            )}
            {post.claimed === 0 &&
              (confirming === 'delete' ? (
                <span className="inline-confirm">
                  Delete permanently?
                  <button
                    className="btn danger sm"
                    onClick={() =>
                      run('delete', () => api(`/posts/${post.id}`, { method: 'DELETE' }), 'Post deleted.').then(() => navigate('/my-posts'))
                    }
                  >
                    Delete
                  </button>
                  <button className="link" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="btn ghost sm danger-text" onClick={() => setConfirming('delete')} disabled={!!busy}>
                  <Icon name="trash" size={16} /> Delete
                </button>
              ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Requests {open.length > 0 && <span className="count">{open.length}</span>}</h2>
        {requests.length === 0 && <p className="muted">No requests yet. You'll get a notification the moment someone asks.</p>}
        {[...open, ...past].map((r) => (
          <div key={r.id} className={`req ${r.status}`}>
            <Avatar name={r.requester.name} size={40} />
            <div className="grow">
              <div className="req-top">
                <b>{r.requester.name}</b>
                <RequestPill status={r.status} />
              </div>
              <small className="muted">
                {ACCOUNT_LABEL[r.requester.account_type]}
                {r.distance_km != null && <> · <span className="mono">{km(r.distance_km)}</span> away</>} · {ago(r.created_at)}
              </small>
              <p className="req-qty">
                <b>{r.quantity} meals</b> for {r.people} {r.people === 1 ? 'person' : 'people'}
              </p>
              {r.note && <p className="req-note">“{r.note}”</p>}
              {r.status === 'pending' && (
                <div className="row-btns">
                  <button className="btn ghost sm" disabled={!!busy} onClick={() => run(`d${r.id}`, () => api(`/requests/${r.id}/decline`, { method: 'POST' }), 'Request declined.')}>
                    Decline
                  </button>
                  <button
                    className="btn sm"
                    disabled={!!busy || r.quantity > post.remaining}
                    title={r.quantity > post.remaining ? `Only ${post.remaining} meals left` : undefined}
                    onClick={() => run(`a${r.id}`, () => api(`/requests/${r.id}/accept`, { method: 'POST' }), `Accepted. Pickup details sent to ${r.requester.name}.`)}
                  >
                    <Icon name="check" size={16} /> Accept
                  </button>
                </div>
              )}
              {r.status === 'accepted' && (
                <>
                  <p className="small muted">At handover, ask for the 4-digit pickup code on their screen.</p>
                  <ConfirmPickup
                    request={r}
                    busy={!!busy}
                    onConfirm={(code) =>
                      run(`c${r.id}`, () => api(`/requests/${r.id}/complete`, { method: 'POST', body: { code } }), `Pickup confirmed — ${r.quantity} meals handed over.`)
                    }
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}

function ViewerPanel({ post, requests, reload, onRequest }) {
  const [busy, run] = useAction(reload);
  const mine = requests[0];
  const openReq = mine && (mine.status === 'pending' || mine.status === 'accepted') ? mine : null;

  if (openReq?.status === 'accepted') {
    return (
      <section className="panel pickup">
        <div className="panel-top">
          <h2>Ready for pickup</h2>
          <RequestPill status="accepted" />
        </div>
        <p className="muted">
          {post.provider.name} accepted your request for <b className="ink">{openReq.quantity} meals</b>. Show this code at pickup:
        </p>
        <div className="code" aria-label={`Pickup code ${openReq.pickup_code.split('').join(' ')}`}>
          {openReq.pickup_code}
        </div>
        <dl className="kv">
          <dt>Address</dt>
          <dd>{post.address}</dd>
          {post.pickup_notes && (
            <>
              <dt>Notes</dt>
              <dd>{post.pickup_notes}</dd>
            </>
          )}
          <dt>Pick up by</dt>
          <dd>{dayClock(post.available_until)}</dd>
          {post.provider.phone && (
            <>
              <dt>Contact</dt>
              <dd className="mono selectable">{post.provider.phone}</dd>
            </>
          )}
        </dl>
        <div className="row-btns wrap">
          <a className="btn ghost sm" href={`https://www.google.com/maps/dir/?api=1&destination=${post.lat},${post.lng}`} target="_blank" rel="noreferrer">
            <Icon name="pin" size={16} /> Directions
          </a>
          <button className="btn sm" disabled={!!busy} onClick={() => run('done', () => api(`/requests/${openReq.id}/complete`, { method: 'POST' }), 'Marked as picked up. Thank you!')}>
            <Icon name="check" size={16} /> I've picked it up
          </button>
          <button className="btn ghost sm danger-text" disabled={!!busy} onClick={() => run('cancel', () => api(`/requests/${openReq.id}/cancel`, { method: 'POST' }), 'Request cancelled.')}>
            Can't make it
          </button>
        </div>
      </section>
    );
  }

  if (openReq?.status === 'pending') {
    return (
      <section className="panel">
        <div className="panel-top">
          <h2>Request sent</h2>
          <RequestPill status="pending" />
        </div>
        <p className="muted">
          You asked for <b className="ink">{openReq.quantity} meals</b> {ago(openReq.created_at)}. You'll get a notification with the pickup address and code when{' '}
          {post.provider.name} accepts.
        </p>
        <button className="btn ghost sm" disabled={!!busy} onClick={() => run('cancel', () => api(`/requests/${openReq.id}/cancel`, { method: 'POST' }), 'Request cancelled.')}>
          Cancel request
        </button>
      </section>
    );
  }

  return (
    <section className="panel">
      {mine?.status === 'completed' && (
        <p className="success">
          <Icon name="check" size={18} /> You picked up {mine.quantity} meals from this post. Thank you!
        </p>
      )}
      {mine && ['declined', 'cancelled', 'expired'].includes(mine.status) && (
        <p className="muted">
          Your earlier request was {mine.status}.
        </p>
      )}
      {post.open ? (
        <>
          <button className="btn full lg" onClick={onRequest}>
            <Icon name="bowl" size={20} /> Request food
          </button>
          <p className="fine center">The exact address is shared after the provider accepts your request.</p>
        </>
      ) : (
        mine?.status !== 'completed' && <p className="muted">This food is no longer available. Check Nearby for other posts.</p>
      )}
    </section>
  );
}

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const now = useNow();
  const { data, error, loading, reload } = useApi(`/posts/${id}`);
  const [requesting, setRequesting] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) {
    return (
      <div className="page narrow">
        <Empty title={error.status === 404 ? 'This post no longer exists' : 'Could not load this post'} action={<Link to="/" className="btn">Back to the feed</Link>}>
          {error.message}
        </Empty>
      </div>
    );
  }
  const { post, requests } = data;
  const urgent = isUrgent(post, now);
  const approximate = !post.address;

  return (
    <div className="page detail">
      <div className="detail-media">
        <button className="icon-btn back-float" aria-label="Back" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}>
          <Icon name="back" />
        </button>
        <FoodImage post={post} />
      </div>

      <div className="detail-body">
        <ErrorNote error={error} onRetry={reload} />
        <header className="detail-head">
          <div className="chips">
            {urgent ? <StatusPill status="urgent" label={`Urgent · ${timeLeft(post.available_until, now)}`} /> : <StatusPill status={post.status} />}
            <span className="chip static">
              <FoodMark type={post.food_type} />
            </span>
            <span className="chip static">{SOURCE_LABEL[post.source]}</span>
          </div>
          <h1>{post.title}</h1>
          <div className="provider">
            <Avatar name={post.provider.name} size={32} />
            <span>
              <b>{post.is_mine ? 'You' : post.provider.name}</b> · {ACCOUNT_LABEL[post.provider.account_type]} · posted {ago(post.created_at, now)}
            </span>
          </div>
        </header>

        <div className="facts big">
          <span>
            <Icon name="bowl" size={18} />
            <b>{post.remaining}</b>&nbsp;of {post.quantity} meals left
          </span>
          <span className={urgent ? 'late' : ''}>
            <Icon name="clock" size={18} />
            Until {dayClock(post.available_until, now)}
          </span>
          {post.distance_km != null && !post.is_mine && (
            <span>
              <Icon name="pin" size={18} />
              <span className="mono">{km(post.distance_km)}</span>&nbsp;away · {post.locality}
            </span>
          )}
        </div>
        {post.description && <p className="detail-desc">{post.description}</p>}

        {post.is_mine ? (
          <OwnerPanel post={post} requests={requests} reload={reload} />
        ) : (
          <ViewerPanel post={post} requests={requests} reload={reload} onRequest={() => setRequesting(true)} />
        )}

        <section className="panel">
          <h2>Pickup location</h2>
          <PickupMap post={post} approximate={approximate} />
          <p className="small muted">
            {approximate ? `Approximate area in ${post.locality || 'this locality'}. The exact address appears once your request is accepted.` : post.address}
          </p>
        </section>
      </div>

      <RequestSheet post={post} open={requesting} onClose={() => setRequesting(false)} onSent={reload} />
    </div>
  );
}

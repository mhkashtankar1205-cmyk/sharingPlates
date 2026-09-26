import { useNavigate } from 'react-router';
import { api } from '../api.js';
import { Empty, ErrorNote, Icon, Loading, PageHead } from '../components/ui.jsx';
import { useApi, useLive } from '../state.jsx';
import { ago, useNow } from '../util.js';

const TYPE = {
  nearby: { icon: 'pin', tone: 'good' },
  urgent: { icon: 'alert', tone: 'urgent' },
  ready: { icon: 'check', tone: 'warn' },
  request: { icon: 'hands', tone: 'warn' },
  live: { icon: 'spark', tone: 'good' },
  completed: { icon: 'check', tone: 'good' },
  declined: { icon: 'x', tone: 'muted' },
  cancelled: { icon: 'x', tone: 'muted' },
};

export default function Alerts() {
  const now = useNow();
  const navigate = useNavigate();
  const { setUnread } = useLive();
  const { data, error, loading, reload, setData } = useApi('/me/notifications?limit=100');
  const list = data?.notifications ?? [];

  async function open(n) {
    if (!n.read_at) {
      setData((d) => ({ ...d, notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read_at: Date.now() } : x)) }));
      api(`/me/notifications/${n.id}/read`, { method: 'POST' })
        .then((r) => setUnread(r.unread))
        .catch(() => {});
    }
    if (n.post_id) navigate(`/posts/${n.post_id}`);
  }

  async function readAll() {
    await api('/me/notifications/read-all', { method: 'POST' });
    setUnread(0);
    setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((x) => ({ ...x, read_at: x.read_at ?? Date.now() })) }));
  }

  const unread = list.filter((n) => !n.read_at).length;

  return (
    <div className="page narrow">
      <PageHead title="Notifications" sub="Food near you, and updates on your posts and requests.">
        {unread > 0 && (
          <button className="btn ghost sm" onClick={readAll}>
            Mark all as read
          </button>
        )}
      </PageHead>
      <ErrorNote error={error} onRetry={reload} />
      {loading && !data && <Loading />}
      {data && list.length === 0 && (
        <Empty icon="bell" title="No notifications yet">
          You'll hear from us when food is posted within your alert radius.
        </Empty>
      )}
      <div className="alerts">
        {list.map((n) => {
          const t = TYPE[n.type] || { icon: 'bell', tone: 'muted' };
          return (
            <button key={n.id} className={`alert ${n.read_at ? '' : 'unread'}`} onClick={() => open(n)}>
              <span className={`alert-icon ${t.tone}`}>
                <Icon name={t.icon} size={20} />
              </span>
              <span className="alert-text">
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
                <small>{ago(n.created_at, now)}</small>
              </span>
              {!n.read_at && <span className="unread-dot" aria-label="Unread" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

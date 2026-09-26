import { db } from './db.js';
import { formatDuration, formatKm, now } from './lib.js';
import { findReceivers, getPost } from './posts.js';
import { notify } from './realtime.js';

const URGENT_WINDOW_MS = 45 * 60000;

/** Warn nearby receivers (and the provider) shortly before unclaimed food expires. */
function sendUrgentAlerts() {
  const t = now();
  const due = db
    .prepare(
      `SELECT id FROM posts
       WHERE is_active = 1 AND completed_at IS NULL AND urgent_sent = 0 AND available_until > ? AND available_until <= ?`
    )
    .all(t, t + URGENT_WINDOW_MS);

  for (const { id } of due) {
    db.prepare('UPDATE posts SET urgent_sent = 1 WHERE id = ?').run(id);
    const post = getPost(id);
    const remaining = post.quantity - post.claimed;
    if (remaining <= 0) continue;
    const left = formatDuration(post.available_until - t);

    const alreadyAsked = db
      .prepare(`SELECT requester_id FROM requests WHERE post_id = ? AND status IN ('pending','accepted')`)
      .all(id)
      .map((r) => r.requester_id);
    for (const { user, km } of findReceivers(post, { excludeIds: alreadyAsked }).slice(0, 60)) {
      notify(user.id, {
        type: 'urgent',
        title: `Urgent: ${remaining} meals expire in ${left}, ${formatKm(km)} away`,
        body: `${post.title} from ${post.provider_name}`,
        postId: id,
      });
    }
    notify(post.user_id, {
      type: 'urgent',
      title: `${remaining} meals still unclaimed — your post expires in ${left}`,
      body: post.pending ? `${post.pending} request(s) are waiting for your answer.` : 'Extend the time or share it with people you know.',
      postId: id,
    });
  }
}

/** Requests still waiting when food expires can no longer be served. */
function expireStaleRequests() {
  const stale = db
    .prepare(
      `SELECT r.id, r.requester_id, p.id AS post_id, p.title FROM requests r JOIN posts p ON p.id = r.post_id
       WHERE r.status = 'pending' AND (p.available_until <= ? OR p.is_active = 0)`
    )
    .all(now());
  for (const r of stale) {
    db.prepare(`UPDATE requests SET status = 'expired', updated_at = ? WHERE id = ?`).run(now(), r.id);
    notify(r.requester_id, { type: 'declined', title: `Your request for ${r.title} expired`, body: 'The provider did not respond in time.', postId: r.post_id, requestId: r.id });
  }
}

function cleanSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
}

/** Runs every minute while the app is open (see browser.js). */
export function runJobs() {
  sendUrgentAlerts();
  expireStaleRequests();
  cleanSessions();
}

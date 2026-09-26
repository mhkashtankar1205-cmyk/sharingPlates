import { db, tx } from '../db.js';
import { HttpError, formatDuration, now, randomInt } from '../lib.js';
import { getPost } from '../posts.js';
import { notify, ping } from '../realtime.js';
import { Router } from '../router.js';
import { requireAuth } from './auth.js';

export function serializeRequest(r, viewer) {
  const isRequester = viewer && r.requester_id === viewer.id;
  return {
    id: r.id,
    post_id: r.post_id,
    quantity: r.quantity,
    people: r.people,
    note: r.note,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
    completed_at: r.completed_at,
    // Only the receiver sees the code; the provider asks for it at handover.
    pickup_code: isRequester && r.status === 'accepted' ? r.pickup_code : null,
    requester: { id: r.requester_id, name: r.requester_name, account_type: r.requester_type },
  };
}

const loadRequest = (id) => {
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'This request no longer exists.');
  const post = getPost(r.post_id);
  return { r, post };
};

const withNames = (id) =>
  db.prepare('SELECT r.*, u.name AS requester_name, u.account_type AS requester_type FROM requests r JOIN users u ON u.id = r.requester_id WHERE r.id = ?').get(id);

const router = Router();
router.use(requireAuth);

router.post('/:id/accept', (req, res) => {
  const t = now();
  const { r, post, autoDeclined } = tx(() => {
    const { r, post } = loadRequest(Number(req.params.id));
    if (post.user_id !== req.user.id) throw new HttpError(403, 'Only the provider can accept requests.');
    if (r.status !== 'pending') throw new HttpError(409, `This request is already ${r.status}.`);
    if (post.completed_at || !post.is_active) throw new HttpError(409, 'This post is closed.');
    const remaining = post.quantity - post.claimed;
    if (r.quantity > remaining) {
      throw new HttpError(409, `Only ${remaining} meals are left, but ${r.quantity} were requested. Decline it or add more meals to the post.`);
    }
    const code = String(randomInt(1000, 10000));
    db.prepare(`UPDATE requests SET status='accepted', pickup_code=?, updated_at=? WHERE id=?`).run(code, t, r.id);

    // Once everything is claimed, the other waiting requests cannot be served.
    let autoDeclined = [];
    if (r.quantity === remaining) {
      autoDeclined = db.prepare(`SELECT * FROM requests WHERE post_id = ? AND status = 'pending' AND id != ?`).all(post.id, r.id);
      db.prepare(`UPDATE requests SET status='declined', updated_at=? WHERE post_id = ? AND status = 'pending' AND id != ?`).run(t, post.id, r.id);
    }
    return { r, post, autoDeclined };
  });

  notify(r.requester_id, {
    type: 'ready',
    title: `Your requested food is ready for pickup — ${r.quantity} meals`,
    body: `${post.title} · ${post.address}. Pick up within ${formatDuration(post.available_until - t)} and show your pickup code.`,
    postId: post.id,
    requestId: r.id,
  });
  for (const other of autoDeclined) {
    notify(other.requester_id, { type: 'declined', title: `${post.title} has been fully claimed`, body: 'Try another post nearby.', postId: post.id, requestId: other.id });
  }
  res.json({ request: serializeRequest(withNames(r.id), req.user) });
});

router.post('/:id/decline', (req, res) => {
  const { r, post } = loadRequest(Number(req.params.id));
  if (post.user_id !== req.user.id) throw new HttpError(403, 'Only the provider can decline requests.');
  if (r.status !== 'pending') throw new HttpError(409, `This request is already ${r.status}.`);
  db.prepare(`UPDATE requests SET status='declined', updated_at=? WHERE id=?`).run(now(), r.id);
  notify(r.requester_id, { type: 'declined', title: `Your request for ${post.title} was declined`, body: 'Other food may still be available nearby.', postId: post.id, requestId: r.id });
  res.json({ request: serializeRequest(withNames(r.id), req.user) });
});

router.post('/:id/cancel', (req, res) => {
  const { r, post } = loadRequest(Number(req.params.id));
  if (r.requester_id !== req.user.id) throw new HttpError(403, 'Only the person who made this request can cancel it.');
  if (!['pending', 'accepted'].includes(r.status)) throw new HttpError(409, `This request is already ${r.status}.`);
  db.prepare(`UPDATE requests SET status='cancelled', updated_at=? WHERE id=?`).run(now(), r.id);
  notify(post.user_id, {
    type: 'cancelled',
    title: `${req.user.name} cancelled their request`,
    body: `${r.quantity} meals of ${post.title} are available again.`,
    postId: post.id,
    requestId: r.id,
  });
  res.json({ request: serializeRequest(withNames(r.id), req.user) });
});

/**
 * Marks a pickup as done. The provider confirms with the receiver's pickup code;
 * the receiver can also confirm they collected the food.
 */
router.post('/:id/complete', (req, res) => {
  const t = now();
  const { r, post, postDone } = tx(() => {
    const { r, post } = loadRequest(Number(req.params.id));
    const isProvider = post.user_id === req.user.id;
    const isRequester = r.requester_id === req.user.id;
    if (!isProvider && !isRequester) throw new HttpError(403, 'You are not part of this pickup.');
    if (r.status !== 'accepted') throw new HttpError(409, 'Only accepted requests can be marked as picked up.');
    if (isProvider && String(req.body?.code ?? '').trim() !== r.pickup_code) {
      throw new HttpError(400, 'That pickup code does not match. Ask the receiver for the 4-digit code on their screen.');
    }
    db.prepare(`UPDATE requests SET status='completed', completed_at=?, updated_at=? WHERE id=?`).run(t, t, r.id);

    // Close the post automatically once every meal has been handed over.
    const fresh = getPost(post.id);
    const outstanding = db.prepare(`SELECT COUNT(*) AS n FROM requests WHERE post_id = ? AND status IN ('pending','accepted')`).get(post.id).n;
    const postDone = fresh.claimed >= fresh.quantity && outstanding === 0;
    if (postDone) db.prepare('UPDATE posts SET completed_at = ? WHERE id = ?').run(t, post.id);
    return { r, post, postDone };
  });

  const other = req.user.id === post.user_id ? r.requester_id : post.user_id;
  notify(other, {
    type: 'completed',
    title: `Pickup completed — ${r.quantity} meals of ${post.title}`,
    body: postDone ? 'All meals from this post have been handed over.' : null,
    postId: post.id,
    requestId: r.id,
  });
  ping(req.user.id, 'impact');
  res.json({ request: serializeRequest(withNames(r.id), req.user), post_completed: postDone });
});

export default router;

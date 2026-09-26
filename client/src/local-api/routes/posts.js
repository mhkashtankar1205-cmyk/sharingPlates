import { db, tx } from '../db.js';
import { FOOD_TYPES, HttpError, SOURCES, boundingBox, coords, formatKm, haversineKm, int, now, oneOf, str } from '../lib.js';
import { POST_SELECT, announcePost, decorate, getPost, isOpen } from '../posts.js';
import { notify, ping } from '../realtime.js';
import { Router } from '../router.js';
import { requireAuth } from './auth.js';
import { serializeRequest } from './requests.js';

export const DEFAULT_ORIGIN = { lat: 12.9352, lng: 77.6245 }; // Koramangala, Bengaluru

/** A photo is stored as a data URL (resized in api.js) or a link to one of the preset dish photos. */
function parseImage(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^(data:image\/(jpeg|png|webp|gif);base64,|https:\/\/)/.test(value)) {
    throw new HttpError(400, 'Upload a JPG, PNG, WebP or GIF image.');
  }
  if (value.length > 3 * 1024 * 1024) throw new HttpError(400, 'The photo is too large. Use a smaller image.');
  return value;
}

/** Exact address and pickup notes are only shown to the provider and to people whose request was accepted. */
function canSeePickup(post, viewer) {
  if (!viewer) return false;
  if (post.user_id === viewer.id) return true;
  return !!db
    .prepare(`SELECT 1 FROM requests WHERE post_id = ? AND requester_id = ? AND status IN ('accepted','completed')`)
    .get(post.id, viewer.id);
}

function present(row, viewer, origin, { pickup = false } = {}) {
  const p = decorate(row, viewer, origin);
  if (pickup) p.provider.phone = row.provider_phone;
  else {
    p.address = null;
    p.pickup_notes = null;
    // Approximate the pin (~100 m) until the pickup is confirmed.
    p.lat = Math.round(p.lat * 1000) / 1000;
    p.lng = Math.round(p.lng * 1000) / 1000;
  }
  return p;
}

function originFrom(req) {
  if (req.query.lat != null && req.query.lng != null) return coords(req.query.lat, req.query.lng);
  if (req.user?.lat != null) return { lat: req.user.lat, lng: req.user.lng };
  return DEFAULT_ORIGIN;
}

function parseUntil(value) {
  const t = typeof value === 'string' && !/^\d+$/.test(value) ? Date.parse(value) : Number(value);
  if (!Number.isFinite(t)) throw new HttpError(400, 'Available-until time is invalid.');
  if (t < now() + 10 * 60000) throw new HttpError(400, 'Available-until must be at least 10 minutes from now.');
  if (t > now() + 72 * 3600000) throw new HttpError(400, 'Available-until can be at most 72 hours from now.');
  return t;
}

const ownPost = (req) => {
  const post = getPost(Number(req.params.id), req.user.id);
  if (!post) throw new HttpError(404, 'This post no longer exists.');
  if (post.user_id !== req.user.id) throw new HttpError(403, 'Only the person who posted this food can do that.');
  return post;
};

const router = Router();
router.use(requireAuth);

// Feed / nearby search
router.get('/', (req, res) => {
  const origin = originFrom(req);
  const radius = Math.min(100, Math.max(0.5, Number(req.query.radius) || 25));
  const sort = oneOf(req.query.sort ?? 'best', 'Sort', ['best', 'distance', 'quantity', 'urgency', 'recent']);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const t = now();
  const box = boundingBox(origin.lat, origin.lng, radius);

  const rows = db
    .prepare(
      `${POST_SELECT}
       WHERE p.is_active = 1 AND p.completed_at IS NULL AND p.available_until > ?
         AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?`
    )
    .all(req.user.id, t, box.minLat, box.maxLat, box.minLng, box.maxLng);

  const compare = {
    best: (a, b) => b.score - a.score,
    distance: (a, b) => a.distance_km - b.distance_km,
    quantity: (a, b) => b.remaining - a.remaining,
    urgency: (a, b) => a.available_until - b.available_until,
    recent: (a, b) => b.created_at - a.created_at,
  }[sort];

  const posts = rows
    .map((row) => present(row, req.user, origin, { pickup: row.user_id === req.user.id }))
    .filter((p) => p.distance_km <= radius)
    .sort((a, b) => Number(b.open) - Number(a.open) || compare(a, b));

  res.json({ posts: posts.slice(offset, offset + limit), total: posts.length, origin, radius, sort });
});

router.get('/:id', (req, res) => {
  const row = getPost(Number(req.params.id), req.user.id);
  if (!row) throw new HttpError(404, 'This post no longer exists.');
  const owner = row.user_id === req.user.id;
  const post = present(row, req.user, originFrom(req), { pickup: canSeePickup(row, req.user) });

  const requests = db
    .prepare(
      `SELECT r.*, u.name AS requester_name, u.account_type AS requester_type, u.lat AS requester_lat, u.lng AS requester_lng
       FROM requests r JOIN users u ON u.id = r.requester_id
       WHERE r.post_id = ? ${owner ? '' : 'AND r.requester_id = ?'}
       ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, r.created_at DESC`
    )
    .all(...(owner ? [row.id] : [row.id, req.user.id]))
    .map((r) => {
      const out = serializeRequest(r, req.user);
      if (owner && r.requester_lat != null) out.distance_km = haversineKm(row.lat, row.lng, r.requester_lat, r.requester_lng);
      return out;
    });

  res.json({ post, requests });
});

router.post('/', (req, res) => {
  const b = req.body ?? {};
  const title = str(b.title, 'Food name', { min: 3, max: 100 });
  const description = str(b.description, 'Description', { max: 600, required: false });
  const foodType = oneOf(b.food_type ?? 'veg', 'Food type', FOOD_TYPES);
  const source = oneOf(b.source ?? 'home', 'Source', SOURCES);
  const quantity = int(b.quantity, 'Number of meals', { min: 1, max: 2000 });
  const address = str(b.address, 'Pickup address', { min: 5, max: 200 });
  const locality = str(b.locality, 'Locality', { max: 80, required: false });
  const pickupNotes = str(b.pickup_notes, 'Pickup notes', { max: 300, required: false });
  const { lat, lng } = coords(b.lat, b.lng);
  const availableUntil = parseUntil(b.available_until);
  const active = b.is_active === undefined ? true : ['true', '1', 'on', true].includes(b.is_active);
  const image = parseImage(b.image || b.preset_image);

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO posts (user_id, title, description, food_type, source, quantity, image, address, locality, lat, lng,
                          pickup_notes, available_until, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, title, description, foodType, source, quantity, image, address, locality, lat, lng,
      pickupNotes, availableUntil, active ? 1 : 0, now());

  let matched = 0;
  if (active) {
    matched = announcePost(getPost(lastInsertRowid), req.user.name);
    notify(req.user.id, {
      type: 'live',
      title: `Your post is live — ${matched} nearby ${matched === 1 ? 'receiver was' : 'receivers were'} notified`,
      body: title,
      postId: lastInsertRowid,
    });
  }
  const row = getPost(lastInsertRowid, req.user.id);
  res.status(201).json({ post: present(row, req.user, req.user, { pickup: true }), matched });
});

router.patch('/:id', (req, res) => {
  const post = ownPost(req);
  if (post.completed_at) throw new HttpError(409, 'This post is already completed.');
  const b = req.body ?? {};
  const next = {
    title: b.title !== undefined ? str(b.title, 'Food name', { min: 3, max: 100 }) : post.title,
    description: b.description !== undefined ? str(b.description, 'Description', { max: 600, required: false }) : post.description,
    quantity: b.quantity !== undefined ? int(b.quantity, 'Number of meals', { min: Math.max(1, post.claimed), max: 2000 }) : post.quantity,
    pickup_notes: b.pickup_notes !== undefined ? str(b.pickup_notes, 'Pickup notes', { max: 300, required: false }) : post.pickup_notes,
    available_until: b.available_until !== undefined ? parseUntil(b.available_until) : post.available_until,
    is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : post.is_active,
  };
  if (next.is_active && next.available_until <= now()) {
    throw new HttpError(400, 'Set a new available-until time before making this post active again.');
  }
  db.prepare(
    `UPDATE posts SET title=?, description=?, quantity=?, pickup_notes=?, available_until=?, is_active=?,
       urgent_sent = CASE WHEN ? != available_until THEN 0 ELSE urgent_sent END
     WHERE id=?`
  ).run(next.title, next.description, next.quantity, next.pickup_notes, next.available_until, next.is_active, next.available_until, post.id);

  // Turning a post off declines anything still waiting for an answer.
  if (!next.is_active && post.is_active) {
    const pending = db.prepare(`SELECT * FROM requests WHERE post_id = ? AND status = 'pending'`).all(post.id);
    for (const r of pending) {
      db.prepare(`UPDATE requests SET status='declined', updated_at=? WHERE id=?`).run(now(), r.id);
      notify(r.requester_id, { type: 'declined', title: `${post.title} is no longer available`, body: 'The provider marked this post inactive.', postId: post.id, requestId: r.id });
    }
  }
  let matched = 0;
  if (next.is_active && !post.is_active && post.matched_count === 0) matched = announcePost(getPost(post.id), req.user.name);
  res.json({ post: present(getPost(post.id, req.user.id), req.user, req.user, { pickup: true }), matched });
});

router.post('/:id/complete', (req, res) => {
  const post = ownPost(req);
  if (post.completed_at) throw new HttpError(409, 'This post is already completed.');
  const t = now();
  const affected = tx(() => {
    const open = db.prepare(`SELECT * FROM requests WHERE post_id = ? AND status IN ('pending','accepted')`).all(post.id);
    for (const r of open) {
      const status = r.status === 'accepted' ? 'completed' : 'declined';
      db.prepare(`UPDATE requests SET status=?, updated_at=?, completed_at=? WHERE id=?`).run(status, t, status === 'completed' ? t : null, r.id);
    }
    db.prepare('UPDATE posts SET completed_at = ? WHERE id = ?').run(t, post.id);
    return open;
  });
  for (const r of affected) {
    if (r.status === 'accepted') {
      notify(r.requester_id, { type: 'completed', title: `Pickup completed — ${r.quantity} meals of ${post.title}`, body: 'Thank you for making sure this food was eaten.', postId: post.id, requestId: r.id });
    } else {
      notify(r.requester_id, { type: 'declined', title: `${post.title} is no longer available`, body: 'The provider closed this post.', postId: post.id, requestId: r.id });
    }
  }
  res.json({ post: present(getPost(post.id, req.user.id), req.user, req.user, { pickup: true }) });
});

router.delete('/:id', (req, res) => {
  const post = ownPost(req);
  if (post.claimed > 0) throw new HttpError(409, 'This post has accepted requests. Mark it completed or inactive instead.');
  const pending = db.prepare(`SELECT * FROM requests WHERE post_id = ? AND status = 'pending'`).all(post.id);
  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  for (const r of pending) notify(r.requester_id, { type: 'declined', title: `${post.title} was removed by the provider` });
  res.status(204).end();
});

router.post('/:id/like', (req, res) => {
  const id = Number(req.params.id);
  if (!getPost(id)) throw new HttpError(404, 'This post no longer exists.');
  const del = db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.user.id, id);
  if (!del.changes) db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(req.user.id, id);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?').get(id);
  res.json({ liked: !del.changes, likes: n });
});

// Request food from a post
router.post('/:id/requests', (req, res) => {
  const b = req.body ?? {};
  const result = tx(() => {
    const post = getPost(Number(req.params.id), req.user.id);
    if (!post) throw new HttpError(404, 'This post no longer exists.');
    if (post.user_id === req.user.id) throw new HttpError(400, 'You cannot request your own food.');
    if (!isOpen(post)) throw new HttpError(409, 'This food is no longer available.');
    const existing = db
      .prepare(`SELECT 1 FROM requests WHERE post_id = ? AND requester_id = ? AND status IN ('pending','accepted')`)
      .get(post.id, req.user.id);
    if (existing) throw new HttpError(409, 'You already have an open request for this food.');
    const remaining = post.quantity - post.claimed;
    const quantity = int(b.quantity, 'Meals requested', { min: 1, max: remaining });
    const people = b.people != null && b.people !== '' ? int(b.people, 'People to feed', { min: 1, max: 5000 }) : quantity;
    const note = str(b.note, 'Note', { max: 300, required: false });
    const t = now();
    const { lastInsertRowid } = db
      .prepare(`INSERT INTO requests (post_id, requester_id, quantity, people, note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .run(post.id, req.user.id, quantity, people, note, t, t);
    return { post, id: lastInsertRowid, quantity };
  });

  const { post, id, quantity } = result;
  const km = req.user.lat != null ? ` · ${formatKm(haversineKm(post.lat, post.lng, req.user.lat, req.user.lng))} away` : '';
  notify(post.user_id, {
    type: 'request',
    title: `${req.user.name} requested ${quantity} meals`,
    body: `${post.title}${km}`,
    postId: post.id,
    requestId: id,
  });
  const row = db.prepare('SELECT r.*, u.name AS requester_name, u.account_type AS requester_type FROM requests r JOIN users u ON u.id = r.requester_id WHERE r.id = ?').get(id);
  ping(req.user.id, 'requests');
  res.status(201).json({ request: serializeRequest(row, req.user) });
});

export default router;

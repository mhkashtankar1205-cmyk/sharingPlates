import { db } from '../db.js';
import { CO2E_PER_KG, HttpError, KG_PER_MEAL, now } from '../lib.js';
import { POST_SELECT, decorate } from '../posts.js';
import { Router } from '../router.js';
import { requireAuth } from './auth.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['active', 'requested', 'partial', 'claimed', 'completed', 'inactive'];

router.get('/posts', (req, res) => {
  const rows = db.prepare(`${POST_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC`).all(req.user.id, req.user.id);
  const all = rows.map((row) => decorate(row, req.user, null));
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const p of all) counts[p.status]++;
  const filter = req.query.status;
  const posts = filter && STATUSES.includes(filter) ? all.filter((p) => p.status === filter) : all;
  res.json({ posts, counts, total: all.length });
});

router.get('/requests', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, p.title, p.image, p.locality, p.address, p.pickup_notes, p.available_until, p.lat, p.lng, p.food_type,
              p.user_id AS provider_id, u.name AS provider_name, u.account_type AS provider_type, u.phone AS provider_phone
       FROM requests r JOIN posts p ON p.id = r.post_id JOIN users u ON u.id = p.user_id
       WHERE r.requester_id = ?
       ORDER BY CASE r.status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, r.updated_at DESC`
    )
    .all(req.user.id);
  const requests = rows.map((r) => {
    const confirmed = r.status === 'accepted' || r.status === 'completed';
    return {
      id: r.id,
      status: r.status,
      quantity: r.quantity,
      people: r.people,
      note: r.note,
      created_at: r.created_at,
      updated_at: r.updated_at,
      completed_at: r.completed_at,
      pickup_code: r.status === 'accepted' ? r.pickup_code : null,
      post: {
        id: r.post_id,
        title: r.title,
        image: r.image,
        locality: r.locality,
        food_type: r.food_type,
        available_until: r.available_until,
        address: confirmed ? r.address : null,
        pickup_notes: confirmed ? r.pickup_notes : null,
        lat: confirmed ? r.lat : null,
        lng: confirmed ? r.lng : null,
        provider: { id: r.provider_id, name: r.provider_name, account_type: r.provider_type, phone: confirmed ? r.provider_phone : null },
      },
    };
  });
  res.json({ requests });
});

router.get('/notifications', (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(req.user.id, limit);
  const { unread } = db.prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id);
  res.json({ notifications, unread });
});

router.post('/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), req.user.id);
  res.json({ unread: 0 });
});

router.post('/notifications/:id/read', (req, res) => {
  const r = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(now(), Number(req.params.id), req.user.id);
  if (!r.changes) throw new HttpError(404, 'Notification not found.');
  const { unread } = db.prepare('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id);
  res.json({ unread });
});

function totals(where, params) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(r.quantity), 0) AS meals, COALESCE(SUM(r.people), 0) AS people, COUNT(*) AS donations,
              COUNT(DISTINCT p.user_id) AS providers, COUNT(DISTINCT r.requester_id) AS receivers
       FROM requests r JOIN posts p ON p.id = r.post_id
       WHERE r.status = 'completed' ${where}`
    )
    .get(...params);
  const kg = row.meals * KG_PER_MEAL;
  return { ...row, kg: Math.round(kg), co2e: Math.round(kg * CO2E_PER_KG) };
}

router.get('/impact', (req, res) => {
  const tzOffset = Number(req.query.tz) || 0; // minutes, as returned by Date#getTimezoneOffset
  const days = 14;
  const dayKey = (t) => new Date(t - tzOffset * 60000).toISOString().slice(0, 10);
  const keys = [];
  for (let i = days - 1; i >= 0; i--) keys.push(dayKey(now() - i * 86400000));

  const since = now() - (days + 1) * 86400000;
  const recent = db
    .prepare(
      `SELECT r.completed_at, r.quantity, r.requester_id, p.user_id AS provider_id
       FROM requests r JOIN posts p ON p.id = r.post_id
       WHERE r.status = 'completed' AND r.completed_at >= ?`
    )
    .all(since);
  const daily = Object.fromEntries(keys.map((k) => [k, { date: k, community: 0, mine: 0 }]));
  for (const r of recent) {
    const d = daily[dayKey(r.completed_at)];
    if (!d) continue;
    d.community += r.quantity;
    if (r.provider_id === req.user.id || r.requester_id === req.user.id) d.mine += r.quantity;
  }

  const posted = db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(quantity), 0) AS meals FROM posts WHERE user_id = ?').get(req.user.id);

  res.json({
    factors: { kg_per_meal: KG_PER_MEAL, co2e_per_kg: CO2E_PER_KG },
    community: totals('', []),
    given: { ...totals('AND p.user_id = ?', [req.user.id]), posts: posted.n, meals_posted: posted.meals },
    received: totals('AND r.requester_id = ?', [req.user.id]),
    daily: keys.map((k) => daily[k]),
  });
});

export default router;

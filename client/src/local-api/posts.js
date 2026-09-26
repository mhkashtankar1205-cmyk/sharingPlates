import { db } from './db.js';
import { RECEIVER_TYPES, boundingBox, formatDuration, formatKm, haversineKm, now } from './lib.js';
import { notify } from './realtime.js';

/**
 * Base post query with provider details and live request totals.
 * `?1` is the viewer id (for `liked` and their own request); later plain `?` placeholders continue from ?2.
 */
export const POST_SELECT = `
SELECT p.*,
  u.name AS provider_name, u.account_type AS provider_type, u.phone AS provider_phone,
  COALESCE((SELECT SUM(r.quantity) FROM requests r WHERE r.post_id = p.id AND r.status IN ('accepted','completed')), 0) AS claimed,
  (SELECT COUNT(*) FROM requests r WHERE r.post_id = p.id AND r.status = 'pending') AS pending,
  (SELECT COUNT(*) FROM requests r WHERE r.post_id = p.id AND r.status = 'completed') AS completed_count,
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes,
  EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = ?1) AS liked,
  (SELECT r.status FROM requests r WHERE r.post_id = p.id AND r.requester_id = ?1
     AND r.status IN ('pending','accepted','completed') ORDER BY r.id DESC LIMIT 1) AS my_request
FROM posts p JOIN users u ON u.id = p.user_id`;

const getPostStmt = db.prepare(`${POST_SELECT} WHERE p.id = ?`);

/**
 * Lifecycle status shown to people:
 * active → requested (has pending requests) → partial / claimed → completed; inactive when switched off or expired.
 */
export function postStatus(p, t = now()) {
  if (p.completed_at) return 'completed';
  if (!p.is_active) return 'inactive';
  if (p.available_until <= t) return p.completed_count > 0 ? 'completed' : 'inactive';
  if (p.pending > 0) return 'requested';
  if (p.claimed >= p.quantity) return 'claimed';
  if (p.claimed > 0) return 'partial';
  return 'active';
}

export function isOpen(p, t = now()) {
  return !p.completed_at && p.is_active && p.available_until > t && p.quantity - p.claimed > 0;
}

/**
 * Relevance score for "best match" ranking: closer, more plentiful and more urgent food ranks higher.
 * Each factor is normalised to 0..1.
 */
export function rankScore(p, km, t = now()) {
  const remaining = Math.max(0, p.quantity - p.claimed);
  const mins = (p.available_until - t) / 60000;
  const proximity = 1 / (1 + km / 1.5);
  const quantity = Math.min(remaining, 80) / 80;
  const urgency = mins <= 0 ? 0 : mins <= 60 ? 1 : mins <= 180 ? 0.65 : 0.35;
  return 0.5 * proximity + 0.2 * quantity + 0.3 * urgency;
}

export function decorate(p, viewer, origin, t = now()) {
  const remaining = Math.max(0, p.quantity - p.claimed);
  const distance = origin && origin.lat != null ? haversineKm(origin.lat, origin.lng, p.lat, p.lng) : null;
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    food_type: p.food_type,
    source: p.source,
    quantity: p.quantity,
    claimed: p.claimed,
    remaining,
    pending: p.pending,
    image: p.image,
    address: p.address,
    locality: p.locality,
    lat: p.lat,
    lng: p.lng,
    pickup_notes: p.pickup_notes,
    available_until: p.available_until,
    is_active: !!p.is_active,
    completed_at: p.completed_at,
    matched_count: p.matched_count,
    created_at: p.created_at,
    likes: p.likes,
    liked: !!p.liked,
    status: postStatus(p, t),
    open: isOpen(p, t),
    distance_km: distance,
    score: distance != null ? rankScore(p, distance, t) : null,
    is_mine: viewer ? p.user_id === viewer.id : false,
    my_request: p.my_request ?? null,
    provider: { id: p.user_id, name: p.provider_name, account_type: p.provider_type },
  };
}

export function getPost(id, viewerId = 0) {
  return getPostStmt.get(viewerId, id) ?? null;
}

// ---- matching ---------------------------------------------------------------

const MATCH_SEARCH_KM = 50;

/**
 * Finds people and organisations whose alert area covers this post and ranks them by how well the post fits:
 * distance, organisation size vs. quantity, and whether they have requested food recently.
 */
export function findReceivers(post, { excludeIds = [] } = {}) {
  const box = boundingBox(post.lat, post.lng, MATCH_SEARCH_KM);
  const candidates = db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM requests r WHERE r.requester_id = u.id AND r.created_at > ?) AS recent_requests
       FROM users u
       WHERE u.id != ? AND u.notify_nearby = 1 AND u.lat BETWEEN ? AND ? AND u.lng BETWEEN ? AND ?`
    )
    .all(now() - 30 * 24 * 3600 * 1000, post.user_id, box.minLat, box.maxLat, box.minLng, box.maxLng);

  const remaining = post.quantity - (post.claimed ?? 0);
  const excluded = new Set(excludeIds);
  return candidates
    .map((u) => {
      const km = haversineKm(post.lat, post.lng, u.lat, u.lng);
      if (km > u.radius_km || excluded.has(u.id)) return null;
      const org = RECEIVER_TYPES.has(u.account_type);
      const sizeFit = org ? (remaining >= 10 ? 1 : 0.6) : remaining <= 10 ? 1 : 0.7;
      const activity = Math.min(u.recent_requests, 5) / 5;
      const score = 0.6 / (1 + km) + 0.3 * sizeFit + 0.1 * activity;
      return { user: u, km, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/** Alerts matched receivers about a newly posted food listing. Returns how many were notified. */
export function announcePost(post, providerName, limit = 100) {
  const matches = findReceivers(post).slice(0, limit);
  const left = formatDuration(post.available_until - now());
  for (const { user, km } of matches) {
    const where = formatKm(km);
    const title =
      user.account_type === 'hostel'
        ? `Food available near your hostel — ${post.quantity} meals ${where} away`
        : user.account_type === 'shelter'
          ? `Food available near your shelter — ${post.quantity} meals ${where} away`
          : `${post.quantity} meals available ${where} away`;
    notify(user.id, {
      type: 'nearby',
      title,
      body: `${post.title} from ${providerName} · available for ${left}`,
      postId: post.id,
    });
  }
  db.prepare('UPDATE posts SET matched_count = ? WHERE id = ?').run(matches.length, post.id);
  return matches.length;
}

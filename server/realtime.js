import { db } from './db.js';
import { now } from './lib.js';

/** Open Server-Sent Event streams, keyed by user id. */
const clients = new Map();

export function subscribe(userId, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => {
    clearInterval(heartbeat);
    const set = clients.get(userId);
    set?.delete(res);
    if (set && !set.size) clients.delete(userId);
  });
}

export function push(userId, event) {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) res.write(payload);
}

const insertNotification = db.prepare(
  `INSERT INTO notifications (user_id, type, title, body, post_id, request_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const getNotification = db.prepare('SELECT * FROM notifications WHERE id = ?');

/** Store a notification and push it live to any open tabs of that user. */
export function notify(userId, { type, title, body = null, postId = null, requestId = null }) {
  const { lastInsertRowid } = insertNotification.run(userId, type, title, body, postId, requestId, now());
  const notification = getNotification.get(lastInsertRowid);
  push(userId, { kind: 'notification', notification });
  return notification;
}

/** Tell a user's open tabs that something they are looking at changed, without a notification. */
export function ping(userId, what) {
  push(userId, { kind: 'refresh', what });
}

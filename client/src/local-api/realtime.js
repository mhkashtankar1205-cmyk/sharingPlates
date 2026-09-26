import { db } from './db.js';
import { now } from './lib.js';

/** Live event listeners in this tab, keyed by user id. */
const clients = new Map();
let relay = null;

/** Listen for live events for a user. Returns a function that stops listening. */
export function subscribe(userId, listener) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(listener);
  return () => {
    const set = clients.get(userId);
    set?.delete(listener);
    if (set && !set.size) clients.delete(userId);
  };
}

/** Passes every pushed event on to other tabs (set by the browser layer). */
export function setRelay(fn) {
  relay = fn;
}

/** Hands an event to this tab's listeners only. */
export function deliver(userId, event) {
  for (const listener of clients.get(userId) ?? []) listener(event);
}

export function push(userId, event) {
  deliver(userId, event);
  relay?.(userId, event);
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

import crypto from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { ACCOUNT_TYPES, HttpError, coords, now, num, oneOf, str } from '../lib.js';

const COOKIE = 'sp_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const getSessionUser = db.prepare(
  `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`
);

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, notify_nearby: !!rest.notify_nearby, has_location: rest.lat != null && rest.lng != null };
}

/** Attaches req.user when a valid session cookie is present. */
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  req.user = token ? getSessionUser.get(token, now()) ?? null : null;
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Log in to continue.'));
  next();
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, now() + SESSION_MS);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MS,
  });
}

// Small in-memory limiter for login/signup attempts per IP.
const attempts = new Map();
function limitAttempts(req, _res, next) {
  const key = req.ip;
  const windowMs = 15 * 60 * 1000;
  const entry = attempts.get(key);
  const t = now();
  if (!entry || t - entry.start > windowMs) attempts.set(key, { start: t, count: 1 });
  else if (++entry.count > 30) return next(new HttpError(429, 'Too many attempts. Try again in a few minutes.'));
  next();
}

const router = Router();

router.post('/signup', limitAttempts, async (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name, 'Name', { min: 2, max: 80 });
  const email = str(b.email, 'Email', { max: 160 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const accountType = oneOf(b.account_type ?? 'individual', 'Account type', ACCOUNT_TYPES);
  const phone = str(b.phone, 'Phone', { max: 30, required: false });
  let lat = null, lng = null;
  if (b.lat != null && b.lng != null) ({ lat, lng } = coords(b.lat, b.lng));
  const locality = str(b.locality, 'Locality', { max: 120, required: false });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  }
  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, account_type, phone, lat, lng, locality, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, email, hash, accountType, phone, lat, lng, locality, now());
  startSession(res, lastInsertRowid);
  res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)) });
});

router.post('/login', limitAttempts, async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  const token = req.cookies?.[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie(COOKIE);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/me', requireAuth, (req, res) => {
  const b = req.body ?? {};
  const u = req.user;
  const next = {
    name: b.name !== undefined ? str(b.name, 'Name', { min: 2, max: 80 }) : u.name,
    account_type: b.account_type !== undefined ? oneOf(b.account_type, 'Account type', ACCOUNT_TYPES) : u.account_type,
    phone: b.phone !== undefined ? str(b.phone, 'Phone', { max: 30, required: false }) : u.phone,
    bio: b.bio !== undefined ? str(b.bio, 'Bio', { max: 280, required: false }) : u.bio,
    locality: b.locality !== undefined ? str(b.locality, 'Locality', { max: 120, required: false }) : u.locality,
    radius_km: b.radius_km !== undefined ? num(b.radius_km, 'Alert radius', { min: 0.5, max: 50 }) : u.radius_km,
    notify_nearby: b.notify_nearby !== undefined ? (b.notify_nearby ? 1 : 0) : u.notify_nearby,
    lat: u.lat,
    lng: u.lng,
  };
  if (b.lat !== undefined && b.lng !== undefined) Object.assign(next, coords(b.lat, b.lng));
  db.prepare(
    `UPDATE users SET name=?, account_type=?, phone=?, bio=?, locality=?, radius_km=?, notify_nearby=?, lat=?, lng=? WHERE id=?`
  ).run(next.name, next.account_type, next.phone, next.bio, next.locality, next.radius_km, next.notify_nearby, next.lat, next.lng, u.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

export default router;

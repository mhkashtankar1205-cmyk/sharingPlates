import { db } from './db.js';
import { HttpError } from './lib.js';
import { Router, createResponse } from './router.js';
import { DEMO_PASSWORD } from './seed.js';
import authRoutes, { loadUser } from './routes/auth.js';
import postRoutes from './routes/posts.js';
import requestRoutes from './routes/requests.js';
import meRoutes from './routes/me.js';

const app = Router();

app.use(loadUser);

// Demo accounts are listed on the sign-in page.
app.get('/demo-accounts', (_req, res) => {
  const accounts = db.prepare(`SELECT name, email, account_type FROM users WHERE email LIKE '%@demo.test' ORDER BY id`).all();
  res.json({ accounts, password: DEMO_PASSWORD });
});
app.use('/auth', authRoutes);
app.use('/posts', postRoutes);
app.use('/requests', requestRoutes);
app.use('/me', meRoutes);

/**
 * Handles one API call, e.g. handle('GET', '/posts?sort=best', { session }).
 * Resolves to { status, data, session }, where `session` is set when the call logged in (token) or out (null).
 */
export async function handle(method, url, { body, session } = {}) {
  const { pathname, searchParams } = new URL(url, 'http://sharingplates.local');
  const req = { method, path: pathname, query: Object.fromEntries(searchParams), body, cookies: { sp_session: session }, params: {} };
  const res = createResponse();
  try {
    if (!(await app.run(req, res, pathname))) throw new HttpError(404, 'Not found.');
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong. Try again.' : err.message });
  }
  // Copy the result the way a network response would, so callers never share objects with the database layer.
  return { status: res.statusCode, data: res.body == null ? null : JSON.parse(JSON.stringify(res.body)), session: res.session };
}

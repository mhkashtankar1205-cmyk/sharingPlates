import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { ROOT, UPLOAD_DIR, db } from './db.js';
import { HttpError } from './lib.js';
import { startJobs } from './jobs.js';
import { DEMO_PASSWORD, seed } from './seed.js';
import authRoutes, { loadUser } from './routes/auth.js';
import postRoutes from './routes/posts.js';
import requestRoutes from './routes/requests.js';
import meRoutes from './routes/me.js';

const PORT = Number(process.env.PORT) || 3001;
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(loadUser);

app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Demo accounts are listed on the sign-in page unless DEMO_MODE=false.
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
app.get('/api/demo-accounts', (_req, res) => {
  if (!DEMO_MODE) return res.json({ accounts: [] });
  const accounts = db.prepare(`SELECT name, email, account_type FROM users WHERE email LIKE '%@demo.test' ORDER BY id`).all();
  res.json({ accounts, password: DEMO_PASSWORD });
});
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/me', meRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));

// Serve the built web app in production.
const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The photo is too large. Use an image under 6 MB.' : err.message;
    return res.status(400).json({ error: message });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Try again.' : err.message });
});

if (DEMO_MODE && !db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  seed({ quiet: true });
  console.log('Empty database — loaded demo data (run `npm run seed` to reset it).');
}
startJobs();
app.listen(PORT, () => console.log(`sharingPlates API listening on http://localhost:${PORT}`));

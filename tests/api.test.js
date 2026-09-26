// End-to-end API test: runs the server against a throwaway database and walks the whole
// POST → MATCH → NOTIFY → REQUEST → ACCEPT → PICKUP → COMPLETED loop.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}/api`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharingplates-'));
let server;

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, UPLOAD_DIR: path.join(dir, 'uploads') },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Server did not start');
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  // Windows can hold the SQLite file briefly after exit.
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function client() {
  let cookie = '';
  return async function call(method, url, body) {
    const headers = { cookie };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, { method, headers, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const data = res.status === 204 ? null : await res.json();
    return { status: res.status, data };
  };
}

test('full food-sharing loop', async () => {
  const donor = client();
  const hostel = client();

  // A new donor signs up near the seeded hostel.
  const signup = await donor('POST', '/auth/signup', {
    name: 'Test Kitchen', email: `kitchen${Date.now()}@example.com`, password: 'longpassword', account_type: 'restaurant', lat: 12.936, lng: 77.626,
  });
  assert.equal(signup.status, 201);
  assert.equal((await hostel('POST', '/auth/login', { email: 'hostel@demo.test', password: 'demo1234' })).status, 200);

  const before = (await hostel('GET', '/me/notifications')).data.unread;

  // POST FOOD (multipart, with a photo)
  const form = new FormData();
  form.set('title', 'Test rajma chawal');
  form.set('food_type', 'veg');
  form.set('source', 'restaurant');
  form.set('quantity', '20');
  form.set('address', '1 Test Street, Koramangala');
  form.set('locality', 'Koramangala');
  form.set('lat', '12.936');
  form.set('lng', '77.626');
  form.set('available_until', String(Date.now() + 2 * 3600e3));
  form.set('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' }), 'p.png');
  const created = await donor('POST', '/posts', form);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const post = created.data.post;
  assert.equal(post.status, 'active');
  assert.match(post.image, /^\/uploads\/.+\.png$/);

  // AI FINDS NEARBY PEOPLE → NOTIFICATION
  assert.ok(created.data.matched >= 1, 'at least one nearby receiver matched');
  const notes = (await hostel('GET', '/me/notifications')).data;
  assert.ok(notes.unread > before);
  assert.ok(notes.notifications.some((n) => n.post_id === post.id && n.type === 'nearby'));

  // Address stays hidden until a request is accepted.
  const viewBefore = (await hostel('GET', `/posts/${post.id}`)).data.post;
  assert.equal(viewBefore.address, null);

  // REQUEST
  const tooMany = await hostel('POST', `/posts/${post.id}/requests`, { quantity: 25 });
  assert.equal(tooMany.status, 400);
  const reqRes = await hostel('POST', `/posts/${post.id}/requests`, { quantity: 12, people: 12, note: 'Coming by scooter' });
  assert.equal(reqRes.status, 201);
  const requestId = reqRes.data.request.id;
  assert.equal((await hostel('POST', `/posts/${post.id}/requests`, { quantity: 2 })).status, 409, 'no duplicate open requests');
  assert.equal((await donor('GET', `/posts/${post.id}`)).data.post.status, 'requested');

  // Only the provider can accept.
  assert.equal((await hostel('POST', `/requests/${requestId}/accept`)).status, 403);

  // ACCEPT → pickup details shared
  const accepted = await donor('POST', `/requests/${requestId}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.request.pickup_code, null, 'provider never sees the code');
  const mine = (await hostel('GET', '/me/requests')).data.requests.find((r) => r.id === requestId);
  assert.equal(mine.status, 'accepted');
  assert.match(mine.pickup_code, /^\d{4}$/);
  assert.equal(mine.post.address, '1 Test Street, Koramangala');
  assert.equal((await donor('GET', `/posts/${post.id}`)).data.post.status, 'partial');

  // PICKUP: wrong code is rejected, right code completes.
  assert.equal((await donor('POST', `/requests/${requestId}/complete`, { code: '0000' === mine.pickup_code ? '1111' : '0000' })).status, 400);
  const done = await donor('POST', `/requests/${requestId}/complete`, { code: mine.pickup_code });
  assert.equal(done.status, 200);
  assert.equal(done.data.request.status, 'completed');

  // MARK COMPLETED closes the post; impact reflects the donation.
  const closed = await donor('POST', `/posts/${post.id}/complete`);
  assert.equal(closed.data.post.status, 'completed');
  const impact = (await donor('GET', '/me/impact')).data;
  assert.equal(impact.given.meals, 12);
  assert.equal(impact.given.donations, 1);
  const myPosts = (await donor('GET', '/me/posts')).data;
  assert.equal(myPosts.counts.completed, 1);
});

test('rejects unauthenticated access and bad input', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/posts')).status, 401);
  const u = client();
  await u('POST', '/auth/signup', { name: 'Val', email: `val${Date.now()}@example.com`, password: 'longpassword' });
  const form = new FormData();
  form.set('title', 'x');
  const bad = await u('POST', '/posts', form);
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error);
  assert.equal((await u('POST', '/auth/signup', { name: 'Val', email: 'bad', password: 'short' })).status, 400);
});

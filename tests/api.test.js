// End-to-end API test: runs the in-browser API (sql.js) in Node against a fresh demo database and walks the whole
// POST → MATCH → NOTIFY → REQUEST → ACCEPT → PICKUP → COMPLETED loop.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { db, exportDatabase, openDatabase } from '../client/src/local-api/db.js';
import { handle } from '../client/src/local-api/index.js';
import { forkSession } from '../client/src/local-api/routes/auth.js';
import { seed } from '../client/src/local-api/seed.js';

let SQL;
before(async () => {
  SQL = await initSqlJs();
  openDatabase(SQL);
  seed();
});

/** A signed-in person: keeps their own session between calls, like a browser tab. */
function client() {
  let session = null;
  return async function call(method, url, body) {
    const res = await handle(method, url, { body, session });
    if (res.session !== undefined) session = res.session;
    return { status: res.status, data: res.data };
  };
}

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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

  // POST FOOD (form fields are strings, the photo is a data URL, as api.js sends them)
  const created = await donor('POST', '/posts', {
    title: 'Test rajma chawal', food_type: 'veg', source: 'restaurant', quantity: '20', address: '1 Test Street, Koramangala',
    locality: 'Koramangala', lat: '12.936', lng: '77.626', available_until: String(Date.now() + 2 * 3600e3), image: PHOTO,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const post = created.data.post;
  assert.equal(post.status, 'active');
  assert.equal(post.image, PHOTO);

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
  const bad = await u('POST', '/posts', { title: 'x' });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.error);
  assert.equal((await u('POST', '/auth/signup', { name: 'Val', email: 'bad', password: 'short' })).status, 400);
});

test('saved data reopens intact and deletes still cascade', async () => {
  const hotel = client();
  const ngo = client();
  await hotel('POST', '/auth/login', { email: 'hotel@demo.test', password: 'demo1234' });
  await ngo('POST', '/auth/login', { email: 'ngo@demo.test', password: 'demo1234' });
  const until = String(Date.now() + 3600e3);
  const post = (await hotel('POST', '/posts', { title: 'Cascade test', quantity: '5', address: '1 Test Street', lat: '12.91', lng: '77.63', available_until: until })).data.post;
  await ngo('POST', `/posts/${post.id}/like`);

  // Saving reopens the sql.js connection; foreign keys must still be on afterwards.
  const bytes = exportDatabase();
  assert.equal((await hotel('DELETE', `/posts/${post.id}`)).status, 204);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM likes WHERE post_id = ?').get(post.id).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE post_id = ?').get(post.id).n, 0);

  // Reopening the saved copy (a page reload) brings back the post and keeps people signed in.
  openDatabase(SQL, bytes);
  assert.equal((await hotel('GET', `/posts/${post.id}`)).data.post.title, 'Cascade test');
  assert.equal((await ngo('GET', '/auth/me')).data.user.email, 'ngo@demo.test');
});

test('each tab gets its own session', async () => {
  const login = await handle('POST', '/auth/login', { body: { email: 'priya@demo.test', password: 'demo1234' } });
  const first = login.session;
  const second = forkSession(first);
  assert.ok(second && second !== first);
  assert.equal((await handle('GET', '/auth/me', { session: second })).data.user.email, 'priya@demo.test');

  // Logging out in one tab leaves the other signed in.
  assert.equal((await handle('POST', '/auth/logout', { session: second })).session, null);
  assert.equal((await handle('GET', '/auth/me', { session: second })).data.user, null);
  assert.equal((await handle('GET', '/auth/me', { session: first })).data.user.email, 'priya@demo.test');
  assert.equal(forkSession('not-a-session'), null);
});

test('rejects photos that are not images', async () => {
  const u = client();
  await u('POST', '/auth/login', { email: 'cafe@demo.test', password: 'demo1234' });
  const res = await u('POST', '/posts', {
    title: 'Bad photo', quantity: '5', address: '1 Test Street', lat: '12.91', lng: '77.61', available_until: String(Date.now() + 3600e3),
    image: 'javascript:alert(1)',
  });
  assert.equal(res.status, 400);
});

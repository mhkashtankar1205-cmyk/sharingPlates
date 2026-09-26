/**
 * Runs the sharingPlates API inside the page instead of on a server.
 *
 * - The SQLite database (sql.js) is saved to IndexedDB after every change, so it survives reloads.
 * - Tabs of the same browser share that database. A Web Lock lets one tab at a time read or change it,
 *   and each tab reloads the saved copy first if another tab changed it.
 * - Live alerts reach the other tabs over a BroadcastChannel.
 * - Each tab keeps its own session (sessionStorage), so two tabs can be signed in as different accounts.
 *
 * All data stays in this browser. Other browsers and devices have their own separate copy.
 */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { exportDatabase, openDatabase, totalChanges } from './db.js';
import { handle } from './index.js';
import { runJobs } from './jobs.js';
import { deliver, setRelay, subscribe } from './realtime.js';
import { forkSession } from './routes/auth.js';
import { seed } from './seed.js';

export { subscribe };

const NAME = 'sharingplates';
const SESSION_KEY = 'sharingplates_session';

// ---- saved copy (IndexedDB) -------------------------------------------------

let store = null;

function openStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = store.transaction('kv', mode);
    const result = fn(t.objectStore('kv'));
    t.oncomplete = () => resolve(result.result);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

// ---- one tab at a time ------------------------------------------------------

let queue = Promise.resolve();

/** Runs fn while holding the database lock across all tabs (or within this tab if Web Locks are missing). */
function withLock(fn) {
  if (navigator.locks) return navigator.locks.request(NAME, fn);
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

let starting = null;
let version = -1; // version of the saved copy that is loaded in this tab

function start() {
  return (starting ??= (async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    try {
      store = await openStore();
    } catch (err) {
      console.warn('IndexedDB is unavailable, so data will be lost when this tab closes.', err);
    }
    return SQL;
  })());
}

/** Loads the latest saved database if another tab has changed it. The first visit starts with demo data. */
async function sync(SQL) {
  const saved = store ? ((await idb('readonly', (kv) => kv.get('version'))) ?? 0) : Math.max(version, 0);
  if (saved === version) return;
  const bytes = saved ? await idb('readonly', (kv) => kv.get('db')) : null;
  openDatabase(SQL, bytes);
  version = saved;
  if (!bytes) {
    seed();
    await save();
  }
}

async function save() {
  version += 1;
  if (!store) return;
  const bytes = exportDatabase();
  await idb('readwrite', (kv) => {
    kv.put(bytes, 'db');
    return kv.put(version, 'version');
  });
}

/** Runs fn against the latest data and saves afterwards if it changed anything. */
async function transaction(fn) {
  const SQL = await start();
  return withLock(async () => {
    await sync(SQL);
    const before = totalChanges();
    try {
      return await fn();
    } finally {
      if (totalChanges() !== before) await save();
    }
  });
}

// ---- sessions ---------------------------------------------------------------

function storage(kind) {
  try {
    return window[kind];
  } catch {
    return null; // blocked by the browser's privacy settings
  }
}

let session; // this tab's session token; undefined until first read

/** This tab's session. A new tab continues the most recent login in this browser with its own session. */
function currentSession() {
  if (session !== undefined) return session;
  session = storage('sessionStorage')?.getItem(SESSION_KEY) ?? null;
  const last = session ? null : storage('localStorage')?.getItem(SESSION_KEY);
  if (last) {
    const forked = forkSession(last);
    if (forked) setSession(forked);
    else storage('localStorage').removeItem(SESSION_KEY);
  }
  return session;
}

function setSession(token) {
  const local = storage('localStorage');
  if (token) {
    storage('sessionStorage')?.setItem(SESSION_KEY, token);
    local?.setItem(SESSION_KEY, token);
  } else {
    storage('sessionStorage')?.removeItem(SESSION_KEY);
    if (local?.getItem(SESSION_KEY) === session) local.removeItem(SESSION_KEY);
  }
  session = token;
}

// ---- other tabs -------------------------------------------------------------

const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(NAME);
if (channel) {
  setRelay((userId, event) => channel.postMessage({ type: 'push', userId, event }));
  channel.onmessage = ({ data }) => {
    if (data.type === 'push') deliver(data.userId, data.event);
    if (data.type === 'reset') window.location.reload();
  };
}

// ---- public -----------------------------------------------------------------

/** One API call, e.g. request('POST', '/auth/login', { email, password }). Resolves to { status, data }. */
export function request(method, path, body) {
  return transaction(async () => {
    const res = await handle(method, path, { body, session: currentSession() });
    if (res.session !== undefined) setSession(res.session);
    return { status: res.status, data: res.data };
  });
}

/** Wipes everything saved in this browser, reloads the demo accounts and posts, and restarts every open tab. */
export async function resetDemoData() {
  await transaction(() => seed());
  setSession(null);
  storage('localStorage')?.removeItem(SESSION_KEY);
  channel?.postMessage({ type: 'reset' });
  window.location.assign('/');
}

// Urgent alerts, expiring requests and session clean-up, every minute while the app is open.
const jobs = () => transaction(runJobs).catch((err) => console.error('[jobs]', err));
jobs();
setInterval(jobs, 60000);

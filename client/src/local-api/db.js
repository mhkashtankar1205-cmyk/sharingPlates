/**
 * SQLite compiled to WebAssembly (sql.js), running inside the page. `db` offers the small part of
 * node:sqlite's API that this folder uses (prepare(sql).get/all/run and exec), so the queries are plain SQLite.
 */

let raw = null; // the open sql.js Database
const statements = new Map(); // SQL text → prepared statement on `raw`

function statement(sql) {
  if (!raw) throw new Error('The database is not open yet.');
  let s = statements.get(sql);
  if (!s) statements.set(sql, (s = raw.prepare(sql)));
  return s;
}

const scalar = (sql) => raw.exec(sql)[0].values[0][0];
const bindable = (args) => args.map((v) => (v === undefined ? null : v));

export const db = {
  prepare(sql) {
    return {
      get(...args) {
        const s = statement(sql);
        try {
          s.bind(bindable(args));
          return s.step() ? s.getAsObject() : undefined;
        } finally {
          s.reset();
        }
      },
      all(...args) {
        const s = statement(sql);
        const rows = [];
        try {
          s.bind(bindable(args));
          while (s.step()) rows.push(s.getAsObject());
        } finally {
          s.reset();
        }
        return rows;
      },
      run(...args) {
        const s = statement(sql);
        try {
          s.bind(bindable(args));
          s.step();
        } finally {
          s.reset();
        }
        const changes = raw.getRowsModified();
        return { changes, lastInsertRowid: scalar('SELECT last_insert_rowid()') };
      },
    };
  },
  exec(sql) {
    raw.exec(sql);
  },
};

/** Opens a database from saved bytes (or a new, empty one) and makes sure the schema exists. */
export function openDatabase(SQL, bytes = null) {
  statements.clear();
  raw?.close();
  raw = new SQL.Database(bytes ?? undefined);
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(SCHEMA);
}

/** The whole database as bytes, for saving. sql.js reopens the connection to do this, dropping statements and pragmas. */
export function exportDatabase() {
  statements.clear();
  const bytes = raw.export();
  raw.exec('PRAGMA foreign_keys = ON;');
  return bytes;
}

/** Rows inserted, updated or deleted since the connection was opened; used to tell whether to save. */
export const totalChanges = () => scalar('SELECT total_changes()');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  account_type  TEXT NOT NULL DEFAULT 'individual',
  phone         TEXT,
  bio           TEXT,
  lat           REAL,
  lng           REAL,
  locality      TEXT,
  radius_km     REAL NOT NULL DEFAULT 5,
  notify_nearby INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  food_type       TEXT NOT NULL DEFAULT 'veg',
  source          TEXT NOT NULL DEFAULT 'home',
  quantity        INTEGER NOT NULL,
  image           TEXT,
  address         TEXT NOT NULL,
  locality        TEXT,
  lat             REAL NOT NULL,
  lng             REAL NOT NULL,
  pickup_notes    TEXT,
  available_until INTEGER NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1,
  completed_at    INTEGER,
  urgent_sent     INTEGER NOT NULL DEFAULT 0,
  matched_count   INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_geo   ON posts(lat, lng);
CREATE INDEX IF NOT EXISTS posts_until ON posts(available_until);
CREATE INDEX IF NOT EXISTS posts_user  ON posts(user_id);

CREATE TABLE IF NOT EXISTS requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity     INTEGER NOT NULL,
  people       INTEGER NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  pickup_code  TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS requests_post ON requests(post_id, status);
CREATE INDEX IF NOT EXISTS requests_user ON requests(requester_id, status);

CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  post_id    INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE,
  read_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);
`;

/** Run fn inside a transaction; rolls back if it throws. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

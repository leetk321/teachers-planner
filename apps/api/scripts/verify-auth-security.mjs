import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  createPhase4Store,
  DEFAULT_SESSION_TTL_MS,
  REMEMBERED_SESSION_TTL_MS,
} from '../src/db/phase4-store.js';
import { isMasterAdmin } from '../src/utils/authSecurity.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-auth-'));
const sqlite = new Database(':memory:');

try {
  sqlite.exec(`
    CREATE TABLE tn_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE user_rows (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE session_rows (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const nowIso = new Date().toISOString();
  const legacyToken = 'legacy-session-token';
  sqlite.prepare(`
    INSERT INTO user_rows(id, name, username, email, salt, password_hash, created_at, updated_at)
    VALUES(1, 'Admin', 'leetk321', '', 'salt', 'hash', ?, ?)
  `).run(nowIso, nowIso);
  sqlite.prepare('INSERT INTO session_rows(token, user_id, created_at) VALUES(?, 1, ?)').run(legacyToken, nowIso);

  let sequence = 1;
  const store = createPhase4Store({
    sqlite,
    dataDir: tempDir,
    readLegacySnapshot: () => ({ users: [], sessions: [] }),
    sequenceStore: { next: () => ++sequence },
  });

  const admin = store.getUserById(1);
  assert.equal(admin.role, 'admin', 'legacy administrator should inherit the explicit admin role');
  assert.equal(isMasterAdmin(admin), true, 'authorization must use the explicit role');

  const migratedSession = store.getSessionByToken(legacyToken);
  assert.ok(migratedSession, 'a non-expired legacy token should remain usable after hashing');
  const storedLegacyToken = sqlite.prepare('SELECT token FROM session_rows WHERE user_id = 1').get()?.token;
  assert.notEqual(storedLegacyToken, legacyToken, 'session tokens must not remain in plaintext');
  assert.equal(storedLegacyToken.length, 64, 'stored token should be a SHA-256 hex digest');

  const regularUser = store.createUser({
    name: 'Teacher',
    username: 'teacher1',
    salt: 'salt2',
    passwordHash: 'hash2',
  });
  assert.equal(regularUser.role, 'user');

  const shortToken = 'short-session';
  const shortSession = store.createSession(regularUser.id, shortToken);
  const shortDuration = Date.parse(shortSession.expires_at) - Date.parse(shortSession.created_at);
  assert.ok(Math.abs(shortDuration - DEFAULT_SESSION_TTL_MS) < 1000, 'default session should expire after one hour');

  const rememberedToken = 'remembered-session';
  const rememberedSession = store.createSession(regularUser.id, rememberedToken, { rememberMe: true });
  const rememberedDuration = Date.parse(rememberedSession.expires_at) - Date.parse(rememberedSession.created_at);
  assert.ok(Math.abs(rememberedDuration - REMEMBERED_SESSION_TTL_MS) < 1000, 'remembered session should expire after 30 days');
  assert.equal(rememberedSession.remember_me, 1);

  const otherToken = 'other-session';
  store.createSession(regularUser.id, otherToken);
  const revokedCount = store.revokeSessionsForUser(regularUser.id, { exceptToken: shortToken });
  assert.ok(revokedCount >= 2, 'all sessions except the current one should be revoked');
  assert.ok(store.getSessionByToken(shortToken), 'the current session should remain active');
  assert.equal(store.getSessionByToken(rememberedToken), null, 'remembered session should be revoked');
  assert.equal(store.getSessionByToken(otherToken), null, 'other session should be revoked');

  const expiredToken = 'expired-session';
  store.createSession(regularUser.id, expiredToken, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal(store.getSessionByToken(expiredToken), null, 'expired session should be rejected');

  const columns = new Set(sqlite.prepare('PRAGMA table_info(session_rows)').all().map((row) => row.name));
  ['expires_at', 'last_seen_at', 'revoked_at', 'remember_me'].forEach((column) => {
    assert.ok(columns.has(column), `session migration should add ${column}`);
  });

  console.log('Auth security verification passed.');
} finally {
  sqlite.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

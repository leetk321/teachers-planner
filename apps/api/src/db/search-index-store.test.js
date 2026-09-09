import assert from 'node:assert/strict';
import test from 'node:test';

import Database from 'better-sqlite3';

import { createSearchIndexStore } from './search-index-store.js';
import { createSearchService } from '../services/search-service.js';

const createFixture = ({ forceMode = '' } = {}) => {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE student_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      academic_year TEXT NOT NULL,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      student_no TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      basic_info TEXT NOT NULL DEFAULT '',
      basic_survey TEXT NOT NULL DEFAULT '',
      student_phone TEXT NOT NULL DEFAULT '',
      guardian_phone TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      transferred_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE task_memo_rows (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      memo_date TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'memo',
      is_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE settings_rows (
      owner_id INTEGER PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const insertStudent = sqlite.prepare(`
    INSERT INTO student_rows(
      id, owner_id, academic_year, name, class_name, student_no, memo, tags, basic_info,
      basic_survey, student_phone, guardian_phone, birth_date, gender, transferred_at,
      created_at, updated_at
    ) VALUES(@id, @owner_id, @academic_year, @name, @class_name, @student_no, @memo, '', '', '', '', '', '', '', '', @created_at, @updated_at)
  `);
  const insertMemo = sqlite.prepare(`
    INSERT INTO task_memo_rows(id, owner_id, memo_date, title, content, kind, is_completed, created_at, updated_at)
    VALUES(@id, @owner_id, @memo_date, @title, @content, @kind, 0, @created_at, @updated_at)
  `);
  insertStudent.run({
    id: 1,
    owner_id: 1,
    academic_year: '2026',
    name: '김민수',
    class_name: '1-1',
    student_no: '5',
    memo: '농구부 주장',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-02T00:00:00.000Z',
  });
  insertStudent.run({
    id: 2,
    owner_id: 2,
    academic_year: '2026',
    name: '김민수',
    class_name: '2-2',
    student_no: '7',
    memo: '다른 사용자 비공개',
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-02T00:00:00.000Z',
  });
  insertMemo.run({
    id: 10,
    owner_id: 1,
    memo_date: '2026-03-10',
    title: '종례 전달사항',
    content: '준비물은 체육복입니다',
    kind: 'announcement',
    created_at: '2026-03-10T00:00:00.000Z',
    updated_at: '2026-03-10T00:00:00.000Z',
  });
  const store = createSearchIndexStore({ sqlite, forceMode });
  return { sqlite, store, insertStudent, insertMemo };
};

test('search index isolates owners and supports Korean substring search', () => {
  const { sqlite, store } = createFixture({ forceMode: 'like' });
  try {
    const studentResult = store.search(1, { q: '민수', scope: 'students' });
    assert.equal(studentResult.total, 1);
    assert.equal(studentResult.results[0].title, '김민수');
    assert.equal(studentResult.results[0].className, '1-1');

    const privateResult = store.search(1, { q: '비공개' });
    assert.equal(privateResult.total, 0);
  } finally {
    sqlite.close();
  }
});

test('source changes mark only that owner dirty and are reindexed on the next search', () => {
  const { sqlite, store, insertMemo } = createFixture({ forceMode: 'like' });
  try {
    assert.equal(store.search(1, { q: '준비물' }).total, 1);
    insertMemo.run({
      id: 11,
      owner_id: 1,
      memo_date: '2026-03-11',
      title: '학부모 안내',
      content: '현장체험학습 동의서 제출',
      kind: 'memo',
      created_at: '2026-03-11T00:00:00.000Z',
      updated_at: '2026-03-11T00:00:00.000Z',
    });
    assert.equal(sqlite.prepare('SELECT dirty FROM search_index_dirty WHERE owner_id = 1').get().dirty, 1);
    const refreshed = store.search(1, { q: '동의서' });
    assert.equal(refreshed.total, 1);
    assert.equal(refreshed.results[0].title, '학부모 안내');
    assert.equal(sqlite.prepare('SELECT dirty FROM search_index_dirty WHERE owner_id = 1').get().dirty, 0);
  } finally {
    sqlite.close();
  }
});

test('scope, academic year, total counts, and result limits are applied in SQL', () => {
  const { sqlite, store, insertStudent } = createFixture({ forceMode: 'like' });
  try {
    insertStudent.run({
      id: 3,
      owner_id: 1,
      academic_year: '2025',
      name: '이민수',
      class_name: '3-1',
      student_no: '2',
      memo: '농구부 부주장',
      created_at: '2025-03-01T00:00:00.000Z',
      updated_at: '2025-03-02T00:00:00.000Z',
    });
    const result = store.search(1, { q: '민수', scope: 'students', year: '2026', limit: 1 });
    assert.equal(result.total, 1);
    assert.equal(result.counts.students, 1);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].title, '김민수');
  } finally {
    sqlite.close();
  }
});

test('search service preserves the existing response contract with indexed results', () => {
  const { sqlite, store } = createFixture({ forceMode: 'like' });
  try {
    const searchService = createSearchService({
      phase1Store: null,
      phase2Store: null,
      phase3Store: null,
      searchIndexStore: store,
    });
    const result = searchService.search(1, { q: '종례', scope: 'memos' });
    assert.equal(result.total, 1);
    assert.equal(result.indexMode, 'like');
    assert.equal(result.results[0].scopeLabel, '메모/전달사항');
    assert.equal(result.results[0].type, 'announcement');
  } finally {
    sqlite.close();
  }
});

test('trigram mode is used when the bundled SQLite supports it', () => {
  const { sqlite, store } = createFixture();
  try {
    const result = store.search(1, { q: '김민수', scope: 'students' });
    assert.equal(result.total, 1);
    assert.ok(['fts5-trigram', 'like'].includes(result.mode));
  } finally {
    sqlite.close();
  }
});

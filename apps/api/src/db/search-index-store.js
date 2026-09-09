const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const VALID_SCOPES = new Set(['all', 'students', 'notes', 'schedules', 'memos', 'files', 'links', 'clubs', 'issues']);

const SOURCE_TABLES = [
  'student_rows',
  'note_rows',
  'schedule_rows',
  'task_memo_rows',
  'file_rows',
  'settings_rows',
  'club_rows',
  'club_member_rows',
  'issue_rows',
  'issue_consultation_rows',
];

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeSearchText = (...values) => normalizeText(values.flat().filter(Boolean).join(' ')).toLowerCase();
const parseJson = (value, fallback) => {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return fallback;
  }
};

const hasTable = (sqlite, tableName) => Boolean(sqlite.prepare(
  "SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
).get(tableName));

const quoteFtsTerm = (term) => `"${String(term).replace(/"/g, '""')}"`;
const escapeLike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

const detectTrigramFts = (sqlite) => {
  const probeName = '__tn_search_trigram_probe';
  try {
    sqlite.exec(`DROP TABLE IF EXISTS ${probeName}`);
    sqlite.exec(`CREATE VIRTUAL TABLE ${probeName} USING fts5(value, tokenize='trigram')`);
    sqlite.exec(`DROP TABLE ${probeName}`);
    return true;
  } catch {
    try { sqlite.exec(`DROP TABLE IF EXISTS ${probeName}`); } catch {}
    return false;
  }
};

const createDocument = ({
  ownerId,
  docKey,
  scope,
  type,
  entityId,
  academicYear = '',
  title,
  subtitle = '',
  snippet = '',
  extraSearch = [],
  sortDate = '',
  studentId = '',
  clubId = '',
  className = '',
  period = '',
  kind = '',
  meta = {},
}) => ({
  owner_id: Number(ownerId),
  doc_key: String(docKey),
  scope: String(scope),
  type: String(type),
  entity_id: String(entityId ?? ''),
  academic_year: String(academicYear || ''),
  title: normalizeText(title),
  subtitle: normalizeText(subtitle),
  snippet: normalizeText(snippet),
  search_text: normalizeSearchText(title, subtitle, snippet, extraSearch),
  sort_date: String(sortDate || ''),
  student_id: String(studentId || ''),
  club_id: String(clubId || ''),
  class_name: String(className || ''),
  period: String(period || ''),
  kind: String(kind || ''),
  meta_json: JSON.stringify(meta && typeof meta === 'object' ? meta : {}),
});

const ensureTables = (sqlite, mode) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS search_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  doc_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  academic_year TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  snippet TEXT NOT NULL,
  search_text TEXT NOT NULL,
  sort_date TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL DEFAULT '',
  club_id TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  meta_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(owner_id, doc_key)
);

CREATE TABLE IF NOT EXISTS search_index_dirty (
  owner_id INTEGER PRIMARY KEY,
  dirty INTEGER NOT NULL DEFAULT 1,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  indexed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS search_index_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_search_documents_owner_scope
  ON search_documents(owner_id, scope, academic_year, sort_date DESC);
CREATE INDEX IF NOT EXISTS idx_search_documents_owner_key
  ON search_documents(owner_id, doc_key);
`);

  const previousMode = sqlite.prepare("SELECT value FROM search_index_config WHERE key = 'mode'").get()?.value || '';
  if (previousMode !== mode) {
    sqlite.exec('DROP TABLE IF EXISTS search_documents_fts');
    sqlite.exec('UPDATE search_index_dirty SET dirty = 1, changed_at = CURRENT_TIMESTAMP');
  }
  if (mode === 'fts5-trigram') {
    sqlite.exec("CREATE VIRTUAL TABLE IF NOT EXISTS search_documents_fts USING fts5(title, subtitle, snippet, search_text, tokenize='trigram')");
  }
  sqlite.prepare(`
    INSERT INTO search_index_config(key, value) VALUES('mode', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(mode);
};

const ensureDirtyTriggers = (sqlite) => {
  const markDirtySql = (ownerExpression) => `
    INSERT INTO search_index_dirty(owner_id, dirty, changed_at, indexed_at)
    VALUES(${ownerExpression}, 1, CURRENT_TIMESTAMP, '')
    ON CONFLICT(owner_id) DO UPDATE SET dirty = 1, changed_at = CURRENT_TIMESTAMP
  `;

  SOURCE_TABLES.forEach((tableName) => {
    if (!hasTable(sqlite, tableName)) return;
    const isMembership = tableName === 'club_member_rows';
    const newOwner = isMembership ? '(SELECT owner_id FROM club_rows WHERE id = NEW.club_id)' : 'NEW.owner_id';
    const oldOwner = isMembership ? '(SELECT owner_id FROM club_rows WHERE id = OLD.club_id)' : 'OLD.owner_id';
    sqlite.exec(`
CREATE TRIGGER IF NOT EXISTS trg_search_dirty_${tableName}_insert
AFTER INSERT ON ${tableName}
WHEN ${newOwner} IS NOT NULL
BEGIN
  ${markDirtySql(newOwner)};
END;
CREATE TRIGGER IF NOT EXISTS trg_search_dirty_${tableName}_update
AFTER UPDATE ON ${tableName}
WHEN ${newOwner} IS NOT NULL
BEGIN
  ${markDirtySql(newOwner)};
END;
CREATE TRIGGER IF NOT EXISTS trg_search_dirty_${tableName}_delete
AFTER DELETE ON ${tableName}
WHEN ${oldOwner} IS NOT NULL
BEGIN
  ${markDirtySql(oldOwner)};
END;
`);
  });
};

const loadDocuments = (sqlite, ownerId) => {
  const documents = [];
  const students = hasTable(sqlite, 'student_rows')
    ? sqlite.prepare('SELECT * FROM student_rows WHERE owner_id = ?').all(ownerId)
    : [];
  const studentsById = new Map(students.map((student) => [Number(student.id), student]));

  students.forEach((student) => {
    documents.push(createDocument({
      ownerId,
      docKey: `student:${student.id}`,
      scope: 'students',
      type: 'student',
      entityId: student.id,
      academicYear: student.academic_year,
      title: student.name || '(이름 없음)',
      subtitle: [student.class_name, student.student_no ? `${student.student_no}번` : '', student.transferred_at ? '전출' : ''].filter(Boolean).join(' · '),
      snippet: [student.memo, student.tags, student.basic_info, student.basic_survey, student.student_phone, student.guardian_phone, student.birth_date].filter(Boolean).join(' · '),
      extraSearch: [student.class_name, student.student_no, student.gender, student.transferred_at],
      sortDate: student.updated_at || student.created_at,
      studentId: student.id,
      className: student.class_name,
    }));
  });

  if (hasTable(sqlite, 'note_rows')) {
    sqlite.prepare('SELECT * FROM note_rows WHERE owner_id = ?').all(ownerId).forEach((note) => {
      const student = studentsById.get(Number(note.student_id));
      const studentName = normalizeText(student?.name || '');
      documents.push(createDocument({
        ownerId,
        docKey: `note:${note.id}`,
        scope: 'notes',
        type: 'note',
        entityId: note.id,
        academicYear: note.academic_year || student?.academic_year,
        title: studentName ? `${studentName} 상담기록` : '상담기록',
        subtitle: [note.category, note.note_date].filter(Boolean).join(' · '),
        snippet: note.content,
        extraSearch: [studentName, student?.class_name, student?.student_no],
        sortDate: note.note_date || note.created_at,
        studentId: note.student_id,
        className: student?.class_name,
      }));
    });
  }

  if (hasTable(sqlite, 'schedule_rows')) {
    sqlite.prepare('SELECT * FROM schedule_rows WHERE owner_id = ?').all(ownerId).forEach((schedule) => {
      const isEvent = String(schedule.kind) === 'event';
      documents.push(createDocument({
        ownerId,
        docKey: `schedule:${schedule.id}`,
        scope: 'schedules',
        type: isEvent ? 'event' : 'todo',
        entityId: schedule.id,
        title: schedule.title || '(제목 없음)',
        subtitle: [isEvent ? '일정' : '할 일', schedule.importance, schedule.done ? '완료' : '미완료'].filter(Boolean).join(' · '),
        snippet: schedule.due_at ? `예정 시각 ${schedule.due_at}` : '',
        extraSearch: [schedule.kind],
        sortDate: schedule.due_at || schedule.created_at,
        kind: schedule.kind,
      }));
    });
  }

  if (hasTable(sqlite, 'task_memo_rows')) {
    sqlite.prepare('SELECT * FROM task_memo_rows WHERE owner_id = ?').all(ownerId).forEach((memo) => {
      const kind = String(memo.kind || 'memo') === 'announcement' ? 'announcement' : 'memo';
      documents.push(createDocument({
        ownerId,
        docKey: `memo:${memo.id}`,
        scope: 'memos',
        type: kind,
        entityId: memo.id,
        title: memo.title || '(제목 없음)',
        subtitle: [kind === 'announcement' ? '전달사항' : '메모', memo.memo_date, memo.is_completed ? '완료' : '미완료'].filter(Boolean).join(' · '),
        snippet: memo.content,
        extraSearch: [memo.kind],
        sortDate: memo.memo_date || memo.updated_at || memo.created_at,
        kind,
      }));
    });
  }

  if (hasTable(sqlite, 'file_rows')) {
    sqlite.prepare("SELECT * FROM file_rows WHERE owner_id = ? AND COALESCE(scope, 'library') = 'library'").all(ownerId).forEach((file) => {
      documents.push(createDocument({
        ownerId,
        docKey: `file:${file.id}`,
        scope: 'files',
        type: 'file',
        entityId: file.id,
        title: file.name || '(파일명 없음)',
        subtitle: [file.type, file.size ? `${Math.round(Number(file.size) / 1024)} KB` : ''].filter(Boolean).join(' · '),
        snippet: file.url,
        sortDate: file.created_at,
      }));
    });
  }

  if (hasTable(sqlite, 'settings_rows')) {
    const settings = sqlite.prepare('SELECT data FROM settings_rows WHERE owner_id = ?').get(ownerId);
    const links = parseJson(settings?.data, {})?.resourceLinks;
    (Array.isArray(links) ? links : []).forEach((link, index) => {
      documents.push(createDocument({
        ownerId,
        docKey: `link:${link?.id || index}`,
        scope: 'links',
        type: 'link',
        entityId: link?.id || `link_${index}`,
        title: link?.title || '(제목 없음)',
        subtitle: link?.url,
        snippet: link?.url,
        sortDate: link?.created_at,
      }));
    });
  }

  if (hasTable(sqlite, 'club_rows')) {
    const memberRows = hasTable(sqlite, 'club_member_rows')
      ? sqlite.prepare(`
          SELECT cm.club_id, s.name
          FROM club_member_rows cm
          JOIN club_rows c ON c.id = cm.club_id
          LEFT JOIN student_rows s ON s.id = cm.student_id AND s.owner_id = c.owner_id
          WHERE c.owner_id = ?
        `).all(ownerId)
      : [];
    const membersByClub = new Map();
    memberRows.forEach(({ club_id: clubId, name }) => {
      if (!membersByClub.has(Number(clubId))) membersByClub.set(Number(clubId), []);
      if (name) membersByClub.get(Number(clubId)).push(name);
    });
    sqlite.prepare('SELECT * FROM club_rows WHERE owner_id = ?').all(ownerId).forEach((club) => {
      const memberNames = membersByClub.get(Number(club.id)) || [];
      documents.push(createDocument({
        ownerId,
        docKey: `club:${club.id}`,
        scope: 'clubs',
        type: 'club',
        entityId: club.id,
        academicYear: club.academic_year,
        title: club.name || '(선택 편성 이름 없음)',
        subtitle: [club.academic_year, club.use_for_attendance ? '출석 사용' : ''].filter(Boolean).join(' · '),
        snippet: memberNames.length ? `편성 학생: ${memberNames.join(', ')}` : '편성 학생 없음',
        extraSearch: memberNames,
        sortDate: club.updated_at || club.created_at,
        clubId: club.id,
      }));
    });
  }

  if (hasTable(sqlite, 'issue_rows')) {
    const consultations = hasTable(sqlite, 'issue_consultation_rows')
      ? sqlite.prepare('SELECT * FROM issue_consultation_rows WHERE owner_id = ? ORDER BY consulted_at ASC, id ASC').all(ownerId)
      : [];
    const consultationsByIssue = new Map();
    consultations.forEach((consultation) => {
      if (!consultationsByIssue.has(Number(consultation.issue_id))) consultationsByIssue.set(Number(consultation.issue_id), []);
      consultationsByIssue.get(Number(consultation.issue_id)).push(consultation);
    });
    sqlite.prepare('SELECT * FROM issue_rows WHERE owner_id = ?').all(ownerId).forEach((issue) => {
      const relatedStudents = parseJson(issue.related_students_json, []);
      const relatedText = (Array.isArray(relatedStudents) ? relatedStudents : []).map((student) => (
        typeof student === 'object'
          ? [student.student_code || student.studentCode, student.student_name || student.studentName || student.name, student.role].filter(Boolean).join(' ')
          : String(student || '')
      )).filter(Boolean);
      const issueConsultations = consultationsByIssue.get(Number(issue.id)) || [];
      const consultationText = issueConsultations.map((row) => [row.participant_name, row.student_code, row.consultation_type, row.consulted_at, row.content].filter(Boolean).join(' '));
      documents.push(createDocument({
        ownerId,
        docKey: `issue:${issue.id}`,
        scope: 'issues',
        type: 'issue',
        entityId: issue.id,
        academicYear: issue.academic_year,
        title: issue.case_no || '(사안 번호 없음)',
        subtitle: [issue.title, issue.status === 'open' ? '진행 중' : '종결'].filter(Boolean).join(' · '),
        snippet: relatedText.length ? `관련 학생: ${relatedText.join(', ')}` : '관련 학생 없음',
        extraSearch: [issue.status, relatedText, consultationText],
        sortDate: issue.updated_at || issue.created_at,
      }));
    });
  }

  return documents;
};

export const createSearchIndexStore = ({ sqlite, forceMode = '' }) => {
  const mode = forceMode === 'like' ? 'like' : (detectTrigramFts(sqlite) ? 'fts5-trigram' : 'like');
  ensureTables(sqlite, mode);
  ensureDirtyTriggers(sqlite);

  const insertDocument = sqlite.prepare(`
    INSERT INTO search_documents(
      owner_id, doc_key, scope, type, entity_id, academic_year, title, subtitle, snippet,
      search_text, sort_date, student_id, club_id, class_name, period, kind, meta_json
    ) VALUES(
      @owner_id, @doc_key, @scope, @type, @entity_id, @academic_year, @title, @subtitle, @snippet,
      @search_text, @sort_date, @student_id, @club_id, @class_name, @period, @kind, @meta_json
    )
  `);
  const insertFts = mode === 'fts5-trigram'
    ? sqlite.prepare('INSERT INTO search_documents_fts(rowid, title, subtitle, snippet, search_text) VALUES(?, ?, ?, ?, ?)')
    : null;

  const rebuildOwner = sqlite.transaction((ownerId) => {
    const oldIds = sqlite.prepare('SELECT id FROM search_documents WHERE owner_id = ?').all(ownerId);
    if (insertFts && oldIds.length) {
      const deleteFts = sqlite.prepare('DELETE FROM search_documents_fts WHERE rowid = ?');
      oldIds.forEach(({ id }) => deleteFts.run(id));
    }
    sqlite.prepare('DELETE FROM search_documents WHERE owner_id = ?').run(ownerId);
    const documents = loadDocuments(sqlite, ownerId);
    documents.forEach((document) => {
      const result = insertDocument.run(document);
      if (insertFts) insertFts.run(result.lastInsertRowid, document.title, document.subtitle, document.snippet, document.search_text);
    });
    sqlite.prepare(`
      INSERT INTO search_index_dirty(owner_id, dirty, changed_at, indexed_at)
      VALUES(?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(owner_id) DO UPDATE SET dirty = 0, indexed_at = CURRENT_TIMESTAMP
    `).run(ownerId);
    return documents.length;
  });

  const reindexOwner = (ownerId) => rebuildOwner(Number(ownerId));

  const ensureOwnerIndexed = (ownerId) => {
    const normalizedOwnerId = Number(ownerId);
    const state = sqlite.prepare('SELECT dirty FROM search_index_dirty WHERE owner_id = ?').get(normalizedOwnerId);
    if (!state || Number(state.dirty)) reindexOwner(normalizedOwnerId);
  };

  const search = (ownerId, { q = '', scope = 'all', limit = DEFAULT_LIMIT, year = '' } = {}) => {
    const query = normalizeText(q);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const normalizedScope = VALID_SCOPES.has(String(scope || 'all')) ? String(scope || 'all') : 'all';
    const normalizedLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
    if (!query || !terms.length) return { query, scope: normalizedScope, total: 0, counts: {}, results: [], mode };

    const normalizedOwnerId = Number(ownerId);
    ensureOwnerIndexed(normalizedOwnerId);

    const useFts = mode === 'fts5-trigram' && terms.every((term) => Array.from(term).length >= 3);
    const filters = ['d.owner_id = ?'];
    const params = [normalizedOwnerId];
    if (normalizedScope !== 'all') {
      filters.push('d.scope = ?');
      params.push(normalizedScope);
    }
    if (year) {
      filters.push("(d.academic_year = ? OR d.academic_year = '')");
      params.push(String(year));
    }

    let fromSql = 'search_documents d';
    let rankSql = `CASE
      WHEN lower(d.title) LIKE ? ESCAPE '\\' THEN 0
      WHEN lower(d.subtitle) LIKE ? ESCAPE '\\' THEN 1
      WHEN lower(d.snippet) LIKE ? ESCAPE '\\' THEN 2
      ELSE 3 END`;
    const fullLike = `%${escapeLike(query.toLowerCase())}%`;
    let rankParams = [fullLike, fullLike, fullLike];
    if (useFts) {
      fromSql += ' JOIN search_documents_fts ON search_documents_fts.rowid = d.id';
      filters.push('search_documents_fts MATCH ?');
      params.push(terms.map(quoteFtsTerm).join(' AND '));
      rankSql = 'bm25(search_documents_fts, 10.0, 6.0, 3.0, 1.0)';
      rankParams = [];
    } else {
      terms.forEach((term) => {
        filters.push("d.search_text LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(term)}%`);
      });
    }

    const whereSql = filters.join(' AND ');
    const total = Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${fromSql} WHERE ${whereSql}`).get(...params)?.count || 0);
    const counts = Object.fromEntries(sqlite.prepare(`
      SELECT d.scope, COUNT(*) AS count
      FROM ${fromSql}
      WHERE ${whereSql}
      GROUP BY d.scope
    `).all(...params).map((row) => [row.scope, Number(row.count)]));
    const rows = sqlite.prepare(`
      SELECT d.*, ${rankSql} AS search_rank
      FROM ${fromSql}
      WHERE ${whereSql}
      ORDER BY search_rank ASC, d.sort_date DESC, d.title COLLATE NOCASE ASC
      LIMIT ?
    `).all(...rankParams, ...params, normalizedLimit);

    return {
      query,
      scope: normalizedScope,
      total,
      counts,
      mode,
      results: rows.map((row) => ({
        scope: row.scope,
        type: row.type,
        title: row.title,
        subtitle: row.subtitle,
        snippet: row.snippet,
        date: row.sort_date,
        id: /^\d+$/.test(row.entity_id) ? Number(row.entity_id) : row.entity_id,
        studentId: /^\d+$/.test(row.student_id) ? Number(row.student_id) : row.student_id,
        clubId: /^\d+$/.test(row.club_id) ? Number(row.club_id) : row.club_id,
        className: row.class_name,
        period: row.period,
        kind: row.kind,
        ...parseJson(row.meta_json, {}),
      })),
    };
  };

  const markOwnerDirty = (ownerId) => sqlite.prepare(`
    INSERT INTO search_index_dirty(owner_id, dirty, changed_at, indexed_at)
    VALUES(?, 1, CURRENT_TIMESTAMP, '')
    ON CONFLICT(owner_id) DO UPDATE SET dirty = 1, changed_at = CURRENT_TIMESTAMP
  `).run(Number(ownerId));

  return {
    mode,
    search,
    reindexOwner,
    ensureOwnerIndexed,
    markOwnerDirty,
  };
};

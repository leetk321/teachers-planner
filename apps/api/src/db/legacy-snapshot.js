import fs from 'fs';

const LEGACY_ARRAY_FIELDS = [
  'users',
  'sessions',
  'students',
  'clubs',
  'notes',
  'schedules',
  'attendance',
  'files',
  'activity_logs',
  'task_memos',
  'settings',
];

const parseLegacySnapshot = (raw, source) => {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`legacy snapshot JSON is invalid (${source}): ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`legacy snapshot root must be an object (${source})`);
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'seq') && (!parsed.seq || typeof parsed.seq !== 'object' || Array.isArray(parsed.seq))) {
    throw new Error(`legacy snapshot seq must be an object (${source})`);
  }
  for (const field of LEGACY_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(parsed, field) && !Array.isArray(parsed[field])) {
      throw new Error(`legacy snapshot ${field} must be an array (${source})`);
    }
  }
  return parsed;
};

export const makeLegacySnapshotInit = () => ({
  seq: { user: 1, student: 1, note: 1, schedule: 1, attendance: 1, memo: 1, club: 1 },
  users: [],
  sessions: [],
  students: [],
  clubs: [],
  notes: [],
  schedules: [],
  attendance: [],
  files: [],
  activity_logs: [],
  task_memos: [],
  settings: [],
});

const normalizeTaskMemo = (memo) => ({
  ...memo,
  memo_date: String(memo?.memo_date || '').slice(0, 10),
  title: String(memo?.title || ''),
  content: String(memo?.content || ''),
  show_on_dashboard: Boolean(memo?.show_on_dashboard),
  kind: String(memo?.kind || '') === 'announcement' ? 'announcement' : 'memo',
  is_completed: Boolean(memo?.is_completed),
  completed_at: String(memo?.completed_at || ''),
});

export const ensureLegacySnapshotSeed = (sqlite, legacyJsonPath) => {
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

  const hasRow = sqlite.prepare('SELECT id FROM app_state WHERE id=1').get();
  if (hasRow) return;

  let init = makeLegacySnapshotInit();
  if (legacyJsonPath && fs.existsSync(legacyJsonPath)) {
    const legacy = parseLegacySnapshot(fs.readFileSync(legacyJsonPath, 'utf8'), legacyJsonPath);
    init = { ...init, ...legacy };
  }
  sqlite.prepare('INSERT INTO app_state(id, data, updated_at) VALUES(1, ?, ?)').run(JSON.stringify(init), new Date().toISOString());
};

export const readLegacySnapshot = (sqlite) => {
  const row = sqlite.prepare('SELECT data FROM app_state WHERE id=1').get();
  if (!row?.data) throw new Error('legacy snapshot row app_state.id=1 is missing');
  const db = parseLegacySnapshot(row.data, 'app_state.id=1');
  db.seq = db.seq || {};
  if (!db.seq.user) db.seq.user = 1;
  if (!db.seq.student) db.seq.student = 1;
  if (!db.seq.note) db.seq.note = 1;
  if (!db.seq.schedule) db.seq.schedule = 1;
  if (!db.seq.attendance) db.seq.attendance = 1;
  if (!db.seq.memo) db.seq.memo = 1;
  if (!db.seq.club) db.seq.club = 1;
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.students)) db.students = [];
  if (!Array.isArray(db.clubs)) db.clubs = [];
  if (!Array.isArray(db.notes)) db.notes = [];
  if (!Array.isArray(db.schedules)) db.schedules = [];
  if (!Array.isArray(db.attendance)) db.attendance = [];
  if (!Array.isArray(db.files)) db.files = [];
  if (!Array.isArray(db.activity_logs)) db.activity_logs = [];
  if (!Array.isArray(db.task_memos)) db.task_memos = [];
  if (!Array.isArray(db.settings)) db.settings = [];
  db.students = db.students.map((student) => ({
    ...student,
    photo_url: String(student?.photo_url || ''),
    photo_updated_at: String(student?.photo_updated_at || ''),
  }));
  db.clubs = db.clubs.map((club) => ({
    ...club,
    academic_year: String(club?.academic_year || ''),
    name: String(club?.name || '').trim(),
    use_for_attendance: Boolean(club?.use_for_attendance),
    student_ids: Array.from(new Set((Array.isArray(club?.student_ids) ? club.student_ids : []).map((id) => Number(id)).filter(Number.isFinite))).sort((a, b) => a - b),
  }));
  db.task_memos = db.task_memos.map(normalizeTaskMemo);
  return db;
};

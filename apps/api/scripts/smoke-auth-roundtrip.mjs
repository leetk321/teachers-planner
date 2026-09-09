import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const apiCwd = path.resolve(process.cwd());
const port = Number(process.env.AUTH_SMOKE_PORT || 4128);
const baseUrl = `http://127.0.0.1:${port}`;
const tempRoot = path.join(os.tmpdir(), `teacher-notebook-auth-smoke-${Date.now()}`);
const tempDataDir = path.join(tempRoot, 'data');
const tempUploadDir = path.join(tempRoot, 'uploads');
const tempPhotoDir = path.join(tempRoot, 'student-photos');

[tempDataDir, tempUploadDir, tempPhotoDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const child = spawn(process.execPath, ['src/index-local.js'], {
  cwd: apiCwd,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: tempDataDir,
    UPLOAD_DIR: tempUploadDir,
    STUDENT_PHOTO_DIR: tempPhotoDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += String(chunk); });
child.stderr.on('data', (chunk) => { stderr += String(chunk); });

const stopChild = async () => {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await delay(500);
  if (child.exitCode === null) child.kill('SIGKILL');
};

const waitForHealth = async () => {
  for (let index = 0; index < 30; index += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error('API health timeout');
};

try {
  await waitForHealth();

  const uniq = Date.now();
  const username = `smoke_${uniq}`;
  const password = 'smoke-pass-1234';

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke User', username, password }),
  });
  if (!registerRes.ok) throw new Error(`register failed: ${registerRes.status}`);

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
  const loginJson = await loginRes.json();
  const token = String(loginJson?.token || '');
  if (!token) throw new Error('login token missing');

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error(`me failed: ${meRes.status}`);

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };
  const requestJson = async (pathName, options = {}) => {
    const response = await fetch(`${baseUrl}${pathName}`, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${pathName} failed: ${response.status} ${payload?.error || ''}`);
    return payload;
  };

  const student = await requestJson('/api/students', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ academicYear: '2026', name: '첨부파일 학생', className: '1-1', studentNo: '1' }),
  });

  const uploadForm = new FormData();
  uploadForm.append('file', new Blob(['attachment smoke test'], { type: 'text/plain' }), '상담 첨부 파일.txt');
  const attachment = await requestJson('/api/files/upload?scope=attachment', {
    method: 'POST',
    headers: authHeaders,
    body: uploadForm,
  });
  if (attachment.scope !== 'attachment') throw new Error('attachment scope was not stored');

  const note = await requestJson('/api/notes', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ academicYear: '2026', studentId: student.id, category: 'general', content: '상담 첨부파일 저장 확인', attachments: [attachment] }),
  });
  if (!Array.isArray(note.attachments) || note.attachments.length !== 1) throw new Error('note attachment was not saved');

  const bulkUpsert = await requestJson('/api/students/bulk', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ students: [{ academicYear: '2026', name: '첨부파일 학생 갱신', className: '1-1', studentNo: '1', studentPhone: '010-1234-5678' }] }),
  });
  if (bulkUpsert.count !== 1 || Number(bulkUpsert.students?.[0]?.id) !== Number(student.id)) throw new Error('bulk student upsert created a duplicate student');
  const preservedNotes = await requestJson(`/api/notes?studentId=${student.id}`, { headers: authHeaders });
  if (preservedNotes.length !== 1 || Number(preservedNotes[0].id) !== Number(note.id)) throw new Error('bulk student upsert did not preserve counseling notes');

  const memo = await requestJson('/api/task-memos', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ memoDate: '2026-07-22', title: '메모 첨부', content: '첨부 저장 확인', attachments: [attachment] }),
  });
  if (!Array.isArray(memo.attachments) || memo.attachments.length !== 1) throw new Error('memo attachment was not saved');

  const libraryFiles = await requestJson('/api/files', { headers: authHeaders });
  if (libraryFiles.some((item) => Number(item.id) === Number(attachment.id))) throw new Error('attachment appeared in file library');

  const downloadRes = await fetch(`${baseUrl}/api/files/${attachment.id}/download`, { headers: authHeaders });
  if (!downloadRes.ok) throw new Error(`attachment download failed: ${downloadRes.status}`);
  if (!String(downloadRes.headers.get('content-disposition') || '').includes('filename')) throw new Error('download filename header missing');
  if (await downloadRes.text() !== 'attachment smoke test') throw new Error('download content mismatch');

  const issue = await requestJson('/api/issues', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      academicYear: '2026',
      caseNo: '2026-01호',
      title: '사안 smoke test',
      issueStudents: [{ studentId: student.id, studentCode: '10101', studentName: '첨부파일 학생 갱신', role: 'victim' }],
    }),
  });
  if (issue.issue_students?.length !== 1 || issue.issue_students[0].role !== 'victim') throw new Error('issue student role was not saved');
  const consultation = await requestJson(`/api/issues/${issue.id}/consultations`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ studentId: student.id, consultationType: 'student', consultedAt: '2026-07-22T09:00', content: '상담 내용 smoke test', attachments: [attachment] }),
  });
  if (!consultation.id || Number(consultation.student_id) !== Number(student.id) || consultation.student_code !== '10101') throw new Error('issue consultation student link was not saved');
  if (consultation.attachments?.length !== 1 || Number(consultation.attachments[0].id) !== Number(attachment.id)) throw new Error('issue consultation attachment was not saved');
  const consultations = await requestJson(`/api/issues/${issue.id}/consultations`, { headers: authHeaders });
  if (consultations.length !== 1 || consultations[0].participant_name !== '10101 첨부파일 학생 갱신') throw new Error('issue consultation list mismatch');
  const studentConsultations = await requestJson(`/api/issues/consultations?studentId=${student.id}`, { headers: authHeaders });
  if (studentConsultations.length !== 1 || Number(studentConsultations[0].id) !== Number(consultation.id)) throw new Error('student issue consultation lookup mismatch');
  const updatedConsultation = await requestJson(`/api/issues/${issue.id}/consultations/${consultation.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ content: '학생 탭에서 수정한 사안 상담 내용' }),
  });
  if (updatedConsultation.content !== '학생 탭에서 수정한 사안 상담 내용') throw new Error('issue consultation update mismatch');
  if (updatedConsultation.attachments?.length !== 1) throw new Error('issue consultation patch did not preserve attachments');
  const blankConsultationUpdate = await fetch(`${baseUrl}/api/issues/${issue.id}/consultations/${consultation.id}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ content: '   ' }),
  });
  if (blankConsultationUpdate.status !== 400) throw new Error(`blank issue consultation update expected 400, received ${blankConsultationUpdate.status}`);

  const deleteRes = await fetch(`${baseUrl}/api/auth/delete-account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });
  if (!deleteRes.ok) throw new Error(`delete-account failed: ${deleteRes.status}`);

  const meAfterRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (meAfterRes.status !== 401) {
    throw new Error(`/api/auth/me after delete expected 401, received ${meAfterRes.status}`);
  }

  console.log(JSON.stringify({ ok: true, username }));
} catch (error) {
  console.error('[smoke-auth-roundtrip] failed');
  console.error(String(error?.message || error));
  if (stdout.trim()) console.error(`[stdout]\n${stdout}`);
  if (stderr.trim()) console.error(`[stderr]\n${stderr}`);
  process.exitCode = 1;
} finally {
  await stopChild();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

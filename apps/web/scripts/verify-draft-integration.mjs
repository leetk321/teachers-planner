import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(resolve(root, relativePath), 'utf8');

const draftHook = read('app/hooks/useServerDraft.js');
const memosHook = read('app/hooks/useMemosTabState.js');
const issuesHook = read('app/hooks/useIssuesTabState.js');
const studentsHook = read('app/hooks/useStudentsTabState.js');
const page = read('app/page.js');
const memosTab = read('app/components/tabs/MemosTab.js');
const issuesTab = read('app/components/tabs/IssuesTab.js');
const studentsTab = read('app/components/tabs/StudentsTab.js');

assert.match(draftHook, /value instanceof File/);
assert.match(draftHook, /draft_file:\s*true/);
assert.match(draftHook, /delay = 800/);
assert.match(draftHook, /error: '초안 저장 실패[^']*'/);

for (const key of ['memo:', 'announcement:']) assert.ok(memosHook.includes(key), `missing ${key} draft key`);
for (const key of ['issue:', 'issue-consultation:']) assert.ok(issuesHook.includes(key), `missing ${key} draft key`);
for (const key of ['student-note:', 'student-issue-consultation:']) assert.ok(studentsHook.includes(key), `missing ${key} draft key`);

for (const source of [memosHook, issuesHook, studentsHook]) {
  assert.match(source, /clearDraft\(\)/);
  assert.match(source, /canRestore:/);
  assert.match(source, /onRestore:/);
}

for (const source of [memosTab, issuesTab, studentsTab]) {
  assert.match(source, /복구한 초안 버리기/);
}

assert.match(page, /res\.status === 401/);
assert.match(page, /localStorage\.removeItem\('teacher_notebook_token_v1'\)/);
assert.match(page, /sessionStorage\.removeItem\('teacher_notebook_token_v1'\)/);
assert.match(page, /<QuickRecordPalette/);

const loginStart = page.indexOf('const doLogin = async () =>');
const loginEnd = page.indexOf('const doRegister = async () =>', loginStart);
const loginSource = page.slice(loginStart, loginEnd);
const localRemove = loginSource.indexOf("localStorage.removeItem('teacher_notebook_token_v1')");
const sessionRemove = loginSource.indexOf("sessionStorage.removeItem('teacher_notebook_token_v1')");
const selectedStoreWrite = loginSource.indexOf("(rememberLogin ? localStorage : sessionStorage).setItem('teacher_notebook_token_v1', j.token)");
assert.ok(localRemove >= 0 && sessionRemove >= 0 && selectedStoreWrite > localRemove && selectedStoreWrite > sessionRemove, 'login must clear both token stores before writing one');
assert.match(page, /if \(sessionToken && persistentToken\) localStorage\.removeItem\('teacher_notebook_token_v1'\)/);

console.log('draft integration verification passed');

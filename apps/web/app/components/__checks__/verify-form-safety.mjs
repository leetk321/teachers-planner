import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => readFileSync(resolve(appDir, relativePath), 'utf8');
const section = (source, start, end) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `검증 시작점을 찾지 못했습니다: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `검증 종료점을 찾지 못했습니다: ${end}`);
  return source.slice(startIndex, endIndex);
};
const assertOrdered = (source, first, second, label) => {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert(firstIndex >= 0 && secondIndex > firstIndex, `${label}: '${first}' 다음에 '${second}'가 있어야 합니다.`);
};

const draftHook = read('hooks/useServerDraft.js');
assert.match(draftHook, /writeQueueRef/);
assert.match(draftHook, /generationByKeyRef/);
assert.match(draftHook, /suppressedSignatureByKeyRef/);
assert.match(draftHook, /const flushDraft = useCallback/);
assert.match(draftHook, /latestByKeyRef\.current\.get\(key\)/);
assert.match(draftHook, /입력 내용은 현재 화면에 유지됩니다/);

const memoHook = read('hooks/useMemosTabState.js');
assert.match(memoHook, /memoHydrationRef/);
assert.match(memoHook, /announcementHydrationRef/);
assert.match(memoHook, /memoTouched && !\(await memoDraft\.flushDraft\(\)\)/);
assert.match(memoHook, /announcementTouched && !\(await announcementDraft\.flushDraft\(\)\)/);
assert.doesNotMatch(section(memoHook, 'const memoDirty = useMemo', 'const announcementDirty = useMemo'), /activeTab/);
assert.doesNotMatch(section(memoHook, 'const announcementDirty = useMemo', 'const memoDraftValue = useMemo'), /activeTab/);
const saveMemo = section(memoHook, 'const saveTaskMemo = async', 'const deleteTaskMemo = async');
assertOrdered(saveMemo, "await apiFetch", 'await memoDraft.clearDraft()', '메모 저장 성공 처리');
assert.doesNotMatch(section(saveMemo, '} catch (e) {', '\n    }\n  };'), /setMemo(?:Title|Content|Attachments)|clearDraft/);
const saveAnnouncement = section(memoHook, 'const saveAnnouncement = async', 'const deleteAnnouncement = async');
assertOrdered(saveAnnouncement, 'await apiFetch', 'await announcementDraft.clearDraft()', '전달사항 저장 성공 처리');
assert.doesNotMatch(section(saveAnnouncement, '} catch (e) {', '\n    }\n  };'), /setAnnouncement(?:Title|Content|Attachments)|clearDraft/);

const studentHook = read('hooks/useStudentsTabState.js');
assert.match(studentHook, /if \(noteTouched\) \{\s*void noteDraft\.flushDraft\(\);\s*return false;/s);
assert.match(studentHook, /previousNoteStudentIdRef/);
assertOrdered(studentHook, 'await noteDraft.clearDraft()', 'resetNoteFields()', '학생 상담 저장 성공 처리');

const issueHook = read('hooks/useIssuesTabState.js');
assert.match(issueHook, /consultationTouched && !\(await consultationDraft\.flushDraft\(\)\)/);
assert.match(issueHook, /issueTouched && !\(await issueDraft\.flushDraft\(\)\)/);
const confirmIssue = section(issueHook, 'const confirmIssueSaved = async', 'const confirmConsultationSaved = async');
assertOrdered(confirmIssue, 'await issueDraft.clearDraft()', 'setIssueTouched(false)', '사안 저장 성공 처리');
const confirmIssueConsultation = section(issueHook, 'const confirmConsultationSaved = async', 'const changeIssueCaseNo =');
assertOrdered(confirmIssueConsultation, 'await consultationDraft.clearDraft()', 'setConsultationTouched(false)', '사안 상담 저장 성공 처리');

const page = read('page.js');
const saveIssue = section(page, 'const saveIssue = async', 'const deleteIssue = async');
assertOrdered(saveIssue, "await apiFetch", 'await confirmIssueSaved()', '사안 API 저장');
assert.doesNotMatch(section(saveIssue, '} catch (error) {', '\n    }\n  };'), /confirmIssueSaved|setIssue(?:Title|StudentsDraft)/);
const saveIssueConsultation = section(page, 'const addIssueConsultation = async', 'const deleteIssueConsultation = async');
assertOrdered(saveIssueConsultation, 'await apiFetch', 'await confirmConsultationSaved()', '사안 상담 API 저장');
assert.doesNotMatch(section(saveIssueConsultation, '} catch (error) {', '\n    }\n  };'), /confirmConsultationSaved|resetConsultationForm/);
const saveStudentNote = section(page, 'const saveNote = async', 'const editNote =');
assertOrdered(saveStudentNote, 'await apiFetch', 'await confirmStudentNoteSaved()', '학생 상담 API 저장');
assert.doesNotMatch(section(saveStudentNote, '} catch (error) {', '\n    }\n  };'), /confirmStudentNoteSaved|setNote(?:Content|Attachments)/);
const renameFile = section(page, 'const saveRenameFile = async', 'const removeFileItem = async');
assertOrdered(renameFile, 'await apiFetch', 'setEditingFileId(null)', '파일 이름 변경 성공 처리');
assert.match(renameFile, /입력한 이름은 유지됩니다/);
assert.doesNotMatch(section(renameFile, '} catch (error) {', '\n    }\n  };'), /setEditingFileId|null\)|setFileNameDraft/);

const attachmentPicker = read('components/common/AttachmentPicker.js');
assert.match(attachmentPicker, /retryFiles/);
assert.match(attachmentPicker, /선택은 유지/);
assertOrdered(attachmentPicker, 'await onUpload(files)', 'setAttachments((previous)', '첨부 업로드 성공 반영');

const trashPanel = read('components/settings/TrashPanel.js');
assert.match(trashPanel, /if \(!Array\.isArray\(result\?\.items\)\) throw/);
assert.match(trashPanel, /목록은 변경하지 않았습니다/);
assert.match(trashPanel, /role='alert'/);
const trashLoadCatch = section(trashPanel, '} catch (loadError) {', '\n    } finally {');
assert.doesNotMatch(trashLoadCatch, /setItems/);
const trashRestoreCatch = section(trashPanel, '} catch (restoreError) {', '\n    } finally {');
assert.doesNotMatch(trashRestoreCatch, /setItems/);
const trashDeleteCatch = section(trashPanel, '} catch (removeError) {', '\n    } finally {');
assert.doesNotMatch(trashDeleteCatch, /setItems/);

const quickRecord = read('components/common/QuickRecordPalette.js');
assert.match(quickRecord, /event\.key === 'Escape'/);
assert.match(quickRecord, /previousFocusRef/);
assert.match(quickRecord, /previous\?\.isConnected/);
assert.match(quickRecord, /event\.key !== 'Tab'/);
assert.match(quickRecord, /event\.key === 'Enter'/);
assertOrdered(quickRecord, 'const result = callback?.()', 'close();', '빠른 기록 상태 전환');
assert.match(quickRecord, /whiteSpace: 'nowrap'/);
assert.match(page, /title='빠른 기록 열기 \(Ctrl\+K\)'/);
assert.match(page, /const tabBtn = \{[^\n]+whiteSpace: 'nowrap'[^\n]+flexShrink: 0/);
assert.match(page, /id: 'memo'/);
assert.match(page, /id: 'announcement'/);
assert.match(page, /id: 'issue'/);
assert.match(page, /onSelectStudent=\{openQuickStudent\}/);

const studentHistory = read('components/students/StudentHistoryPanel.js');
assert.match(studentHistory, /aria-label='학생 이력'/);
assert.match(studentHistory, /\/api\/students\/\$\{encodeURIComponent\(studentKey\)\}\/timeline/);
assert.match(studentHistory, /controller\.abort\(\)/);
assert.match(studentHistory, /maxHeight: 360/);
assert.match(studentHistory, /recordsRevision/);
assert.match(studentHistory, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);

const authScreen = read('components/auth/AuthScreen.js');
assert.match(authScreen, /htmlFor=\{rememberId\}/);
assert.match(authScreen, /aria-describedby=\{rememberDescriptionId\}/);
assert.match(authScreen, /선택하지 않으면 1시간 후 세션이 만료됩니다/);

console.log('프런트 폼 안전성 정적 검증 통과: 초안, 첨부, 휴지통, Ctrl+K, 로그인 유지');

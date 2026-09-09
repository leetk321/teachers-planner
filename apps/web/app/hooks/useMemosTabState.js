'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toSeoulYm, toSeoulYmd } from '../lib/date-time.js';
import { draftStatusLabel, useServerDraft } from './useServerDraft.js';

const attachmentSignature = (attachments) => JSON.stringify(
  (Array.isArray(attachments) ? attachments : []).map((item) => ({
    id: Number(item?.id || 0),
    url: String(item?.url || ''),
  })),
);

const restorableAttachments = (attachments) => (Array.isArray(attachments) ? attachments : [])
  .filter((item) => !item?.draft_file && (Number(item?.id || 0) > 0 || String(item?.url || '')));

export function useMemosTabState({ activeTab, apiFetch, setActionMessage }) {
  const [memoDate, setMemoDate] = useState(() => toSeoulYmd());
  const [memoTitle, setMemoTitle] = useState('');
  const [memoContent, setMemoContent] = useState('');
  const [memoAttachments, setMemoAttachments] = useState([]);
  const [memoItems, setMemoItems] = useState([]);
  const [memoSearchQuery, setMemoSearchQuery] = useState('');
  const [editingMemoId, setEditingMemoId] = useState(null);
  const [memoShowOnDashboard, setMemoShowOnDashboard] = useState(false);
  const [memoTouched, setMemoTouched] = useState(false);
  const [memoListMonth, setMemoListMonth] = useState(() => toSeoulYm());
  const [announcementDate, setAnnouncementDate] = useState(() => toSeoulYmd());
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementAttachments, setAnnouncementAttachments] = useState([]);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [announcementTouched, setAnnouncementTouched] = useState(false);
  const [announcementShowCompleted, setAnnouncementShowCompleted] = useState(false);
  const [announcementPanelMode, setAnnouncementPanelMode] = useState('viewer');
  const memoHydrationRef = useRef('');
  const announcementHydrationRef = useRef('');

  const deferredMemoSearchQuery = useDeferredValue(memoSearchQuery);

  const memoOnlyItems = useMemo(
    () => memoItems.filter((item) => String(item.kind || 'memo') !== 'announcement'),
    [memoItems],
  );
  const announcementItems = useMemo(
    () => memoItems
      .filter((item) => String(item.kind || 'memo') === 'announcement')
      .sort(
        (a, b) => Number(Boolean(a.is_completed)) - Number(Boolean(b.is_completed))
          || String(b.memo_date || '').localeCompare(String(a.memo_date || ''))
          || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
      ),
    [memoItems],
  );
  const memosByMonth = useMemo(
    () => memoOnlyItems
      .filter((item) => String(item.memo_date || '').slice(0, 7) === memoListMonth)
      .sort(
        (a, b) => String(b.memo_date || '').localeCompare(String(a.memo_date || ''))
          || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
      ),
    [memoOnlyItems, memoListMonth],
  );
  const memoSearchQ = useMemo(
    () => String(deferredMemoSearchQuery || '').trim().toLowerCase(),
    [deferredMemoSearchQuery],
  );
  const memoSearchResults = useMemo(() => {
    if (!memoSearchQ) return [];
    const matches = (item) =>
      `${String(item.title || '')} ${String(item.content || '')}`.toLowerCase().includes(memoSearchQ);

    return [
      ...announcementItems
        .filter(matches)
        .map((item) => ({ ...item, searchKind: 'announcement' })),
      ...memoOnlyItems
        .filter(matches)
        .map((item) => ({ ...item, searchKind: 'memo' })),
    ].sort(
      (a, b) => String(b.memo_date || '').localeCompare(String(a.memo_date || ''))
        || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
    );
  }, [announcementItems, memoOnlyItems, memoSearchQ]);
  const selectedMemo = useMemo(
    () => memoOnlyItems.find((item) => String(item.id) === String(editingMemoId)) || null,
    [memoOnlyItems, editingMemoId],
  );
  const selectedAnnouncement = useMemo(
    () => announcementItems.find((item) => String(item.id) === String(editingAnnouncementId)) || null,
    [announcementItems, editingAnnouncementId],
  );
  const dashboardMemos = useMemo(() => {
    const pinnedMemos = memoOnlyItems
      .filter((item) => item.show_on_dashboard)
      .map((item) => ({ ...item, dashboardKind: 'memo' }));
    const activeAnnouncements = announcementItems
      .filter((item) => !item.is_completed)
      .map((item) => ({ ...item, dashboardKind: 'announcement' }));
    return [...activeAnnouncements, ...pinnedMemos]
      .sort(
        (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
          || String(b.memo_date || '').localeCompare(String(a.memo_date || '')),
      )
      .slice(0, 8);
  }, [memoOnlyItems, announcementItems]);
  const visibleAnnouncementItems = useMemo(
    () => (announcementShowCompleted ? announcementItems : announcementItems.filter((item) => !item.is_completed)),
    [announcementItems, announcementShowCompleted],
  );
  const pendingAnnouncementItemsCount = useMemo(
    () => announcementItems.filter((item) => !item.is_completed).length,
    [announcementItems],
  );

  useEffect(() => {
    const found = memoItems.find((item) => String(item.id) === String(editingMemoId));
    if (editingMemoId && !found) return;
    const hydrationKey = found
      ? `memo:${found.id}:${found.updated_at || found.memo_date || ''}`
      : 'memo:new';
    if (memoTouched || memoHydrationRef.current === hydrationKey) return;
    memoHydrationRef.current = hydrationKey;
    if (found) {
      setMemoDate(String(found.memo_date || '').slice(0, 10));
      setMemoTitle(String(found.title || ''));
      setMemoContent(found.content || '');
      setMemoAttachments(Array.isArray(found.attachments) ? found.attachments : []);
      setMemoShowOnDashboard(Boolean(found.show_on_dashboard));
      setMemoTouched(false);
      return;
    }
    setMemoTitle('');
    setMemoContent('');
    setMemoAttachments([]);
    setMemoShowOnDashboard(false);
    setMemoTouched(false);
  }, [memoItems, editingMemoId, memoTouched]);

  useEffect(() => {
    const found = memoItems.find(
      (item) => String(item.id) === String(editingAnnouncementId) && String(item.kind || 'memo') === 'announcement',
    );
    if (editingAnnouncementId && !found) return;
    const hydrationKey = found
      ? `announcement:${found.id}:${found.updated_at || found.memo_date || ''}`
      : 'announcement:new';
    if (announcementTouched || announcementHydrationRef.current === hydrationKey) return;
    announcementHydrationRef.current = hydrationKey;
    if (found) {
      setAnnouncementDate(String(found.memo_date || '').slice(0, 10));
      setAnnouncementTitle(String(found.title || ''));
      setAnnouncementContent(String(found.content || ''));
      setAnnouncementAttachments(Array.isArray(found.attachments) ? found.attachments : []);
      setAnnouncementTouched(false);
      return;
    }
    setAnnouncementDate(toSeoulYmd());
    setAnnouncementTitle('');
    setAnnouncementContent('');
    setAnnouncementAttachments([]);
    setAnnouncementTouched(false);
  }, [memoItems, editingAnnouncementId, announcementTouched]);

  const memoDirty = useMemo(() => {
    if (!memoTouched) return false;
    if (!selectedMemo) {
      return Boolean(String(memoTitle || '').trim())
        || Boolean(String(memoContent || '').trim())
        || memoAttachments.length > 0
        || memoShowOnDashboard;
    }
    return String(memoTitle || '') !== String(selectedMemo.title || '')
      || String(memoContent || '') !== String(selectedMemo.content || '')
      || attachmentSignature(memoAttachments) !== attachmentSignature(selectedMemo.attachments)
      || memoShowOnDashboard !== Boolean(selectedMemo.show_on_dashboard)
      || String(memoDate || '') !== String(selectedMemo.memo_date || '');
  }, [memoTouched, selectedMemo?.id, memoTitle, memoContent, memoAttachments, memoShowOnDashboard, memoDate]);

  const announcementDirty = useMemo(() => {
    if (!announcementTouched) return false;
    if (!selectedAnnouncement) {
      return Boolean(String(announcementTitle || '').trim()) || Boolean(String(announcementContent || '').trim()) || announcementAttachments.length > 0;
    }
    return String(announcementDate || '') !== String(selectedAnnouncement.memo_date || '')
      || String(announcementTitle || '') !== String(selectedAnnouncement.title || '')
      || String(announcementContent || '') !== String(selectedAnnouncement.content || '')
      || attachmentSignature(announcementAttachments) !== attachmentSignature(selectedAnnouncement.attachments);
  }, [announcementTouched, selectedAnnouncement?.id, announcementDate, announcementTitle, announcementContent, announcementAttachments]);

  const memoDraftValue = useMemo(() => ({
    dirty: memoDirty,
    memoDate,
    memoTitle,
    memoContent,
    memoAttachments,
    memoShowOnDashboard,
  }), [memoDirty, memoDate, memoTitle, memoContent, memoAttachments, memoShowOnDashboard]);
  const announcementDraftValue = useMemo(() => ({
    dirty: announcementDirty,
    announcementDate,
    announcementTitle,
    announcementContent,
    announcementAttachments,
  }), [announcementDirty, announcementDate, announcementTitle, announcementContent, announcementAttachments]);

  const memoDraft = useServerDraft({
    apiFetch,
    draftKey: `memo:${editingMemoId || 'new'}`,
    active: activeTab === 'memos',
    value: memoDraftValue,
    shouldSave: memoTouched,
    isEmpty: (payload) => !payload?.dirty,
    canRestore: () => !memoTouched,
    onRestore: (payload) => {
      setMemoDate(String(payload.memoDate || toSeoulYmd()).slice(0, 10));
      setMemoListMonth(String(payload.memoDate || toSeoulYmd()).slice(0, 7));
      setMemoTitle(String(payload.memoTitle || ''));
      setMemoContent(String(payload.memoContent || ''));
      setMemoAttachments(restorableAttachments(payload.memoAttachments));
      setMemoShowOnDashboard(Boolean(payload.memoShowOnDashboard));
      setMemoTouched(false);
    },
  });
  const announcementDraft = useServerDraft({
    apiFetch,
    draftKey: `announcement:${editingAnnouncementId || 'new'}`,
    active: activeTab === 'memos',
    value: announcementDraftValue,
    shouldSave: announcementTouched,
    isEmpty: (payload) => !payload?.dirty,
    canRestore: () => !announcementTouched,
    onRestore: (payload) => {
      setAnnouncementDate(String(payload.announcementDate || toSeoulYmd()).slice(0, 10));
      setAnnouncementTitle(String(payload.announcementTitle || ''));
      setAnnouncementContent(String(payload.announcementContent || ''));
      setAnnouncementAttachments(restorableAttachments(payload.announcementAttachments));
      setAnnouncementTouched(false);
      setAnnouncementPanelMode('write');
    },
  });

  const discardMemoDraft = async () => {
    await memoDraft.clearDraft();
    if (selectedMemo) {
      setMemoDate(String(selectedMemo.memo_date || '').slice(0, 10));
      setMemoListMonth(String(selectedMemo.memo_date || '').slice(0, 7));
      setMemoTitle(String(selectedMemo.title || ''));
      setMemoContent(String(selectedMemo.content || ''));
      setMemoAttachments(Array.isArray(selectedMemo.attachments) ? selectedMemo.attachments : []);
      setMemoShowOnDashboard(Boolean(selectedMemo.show_on_dashboard));
    } else {
      setMemoDate(toSeoulYmd());
      setMemoListMonth(toSeoulYm());
      setMemoTitle('');
      setMemoContent('');
      setMemoAttachments([]);
      setMemoShowOnDashboard(false);
    }
    setMemoTouched(false);
  };

  const discardAnnouncementDraft = async () => {
    await announcementDraft.clearDraft();
    if (selectedAnnouncement) {
      setAnnouncementDate(String(selectedAnnouncement.memo_date || '').slice(0, 10));
      setAnnouncementTitle(String(selectedAnnouncement.title || ''));
      setAnnouncementContent(String(selectedAnnouncement.content || ''));
      setAnnouncementAttachments(Array.isArray(selectedAnnouncement.attachments) ? selectedAnnouncement.attachments : []);
    } else {
      setAnnouncementDate(toSeoulYmd());
      setAnnouncementTitle('');
      setAnnouncementContent('');
      setAnnouncementAttachments([]);
    }
    setAnnouncementTouched(false);
  };

  const startNewMemo = async () => {
    if (memoTouched && !(await memoDraft.flushDraft())) {
      setActionMessage('작성 중인 메모 초안을 저장하지 못해 새 메모로 전환하지 않았습니다.');
      return false;
    }
    if (!memoTouched) void memoDraft.clearDraft();
    setEditingMemoId(null);
    setMemoTitle('');
    setMemoContent('');
    setMemoAttachments([]);
    setMemoShowOnDashboard(false);
    setMemoTouched(false);
    return true;
  };

  const selectMemo = async (item) => {
    if (memoTouched && !(await memoDraft.flushDraft())) {
      setActionMessage('작성 중인 메모 초안을 저장하지 못해 다른 메모로 이동하지 않았습니다.');
      return false;
    }
    memoHydrationRef.current = '';
    setMemoTouched(false);
    setEditingMemoId(item.id);
    return true;
  };

  const saveTaskMemo = async () => {
    if (!memoDate) {
      setActionMessage('메모 날짜를 선택해 주세요.');
      return;
    }
    try {
      const payload = { memoDate, title: memoTitle, content: memoContent, attachments: memoAttachments, showOnDashboard: memoShowOnDashboard };
      const saved = editingMemoId
        ? await apiFetch(`/api/task-memos/${editingMemoId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch('/api/task-memos', { method: 'POST', body: JSON.stringify(payload) });
      setMemoItems((prev) => {
        const rest = prev.filter((item) => String(item.id) !== String(saved.id));
        return [saved, ...rest].sort(
          (a, b) => String(b.memo_date || '').localeCompare(String(a.memo_date || ''))
            || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
        );
      });
      await memoDraft.clearDraft();
      setEditingMemoId(saved.id);
      setMemoTouched(false);
      setActionMessage('메모가 저장되었습니다.');
    } catch (e) {
      setActionMessage(`메모 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const deleteTaskMemo = async (id) => {
    if (!confirm('이 메모를 삭제할까요?')) return;
    try {
      await apiFetch(`/api/task-memos/${id}`, { method: 'DELETE' });
      if (String(editingMemoId) === String(id)) await memoDraft.clearDraft();
      setMemoItems((prev) => prev.filter((item) => String(item.id) !== String(id)));
      if (String(editingMemoId) === String(id)) startNewMemo();
      setActionMessage('메모가 삭제되었습니다.');
    } catch (e) {
      setActionMessage(`메모 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const startNewAnnouncement = async () => {
    if (announcementTouched && !(await announcementDraft.flushDraft())) {
      setActionMessage('작성 중인 전달사항 초안을 저장하지 못해 새 전달사항으로 전환하지 않았습니다.');
      return false;
    }
    if (!announcementTouched) void announcementDraft.clearDraft();
    setEditingAnnouncementId(null);
    setAnnouncementDate(toSeoulYmd());
    setAnnouncementTitle('');
    setAnnouncementContent('');
    setAnnouncementAttachments([]);
    setAnnouncementTouched(false);
    setAnnouncementPanelMode('write');
    return true;
  };

  const selectAnnouncement = async (item) => {
    if (announcementTouched && !(await announcementDraft.flushDraft())) {
      setActionMessage('작성 중인 전달사항 초안을 저장하지 못해 다른 전달사항으로 이동하지 않았습니다.');
      return false;
    }
    announcementHydrationRef.current = '';
    setAnnouncementTouched(false);
    setEditingAnnouncementId(item.id);
    setAnnouncementPanelMode('write');
    return true;
  };

  const saveAnnouncement = async () => {
    if (!announcementDate) {
      setActionMessage('전달 날짜를 선택해 주세요.');
      return;
    }
    if (!String(announcementTitle || '').trim() && !String(announcementContent || '').trim()) {
      setActionMessage('전달할 제목이나 내용을 입력해 주세요.');
      return;
    }
    try {
      const payload = {
        memoDate: announcementDate,
        title: announcementTitle,
        content: announcementContent,
        attachments: announcementAttachments,
        kind: 'announcement',
        isCompleted: Boolean(selectedAnnouncement?.is_completed),
        completedAt: String(selectedAnnouncement?.completed_at || ''),
      };
      const saved = editingAnnouncementId
        ? await apiFetch(`/api/task-memos/${editingAnnouncementId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch('/api/task-memos', { method: 'POST', body: JSON.stringify(payload) });
      setMemoItems((prev) => {
        const rest = prev.filter((item) => String(item.id) !== String(saved.id));
        return [saved, ...rest].sort(
          (a, b) => String(b.memo_date || '').localeCompare(String(a.memo_date || ''))
            || String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
        );
      });
      await announcementDraft.clearDraft();
      setEditingAnnouncementId(saved.id);
      setAnnouncementTouched(false);
      setActionMessage('전달사항이 저장되었습니다.');
    } catch (e) {
      setActionMessage(`전달사항 저장 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const deleteAnnouncement = async (id) => {
    if (!confirm('이 전달사항을 삭제할까요?')) return;
    try {
      await apiFetch(`/api/task-memos/${id}`, { method: 'DELETE' });
      if (String(editingAnnouncementId) === String(id)) await announcementDraft.clearDraft();
      setMemoItems((prev) => prev.filter((item) => String(item.id) !== String(id)));
      if (String(editingAnnouncementId) === String(id)) startNewAnnouncement();
      setActionMessage('전달사항을 삭제했습니다.');
    } catch (e) {
      setActionMessage(`전달사항 삭제 실패: ${e?.message || 'API 오류'}`);
    }
  };

  const toggleAnnouncementCompleted = async (item) => {
    const nextCompleted = !Boolean(item?.is_completed);
    try {
      const saved = await apiFetch(`/api/task-memos/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isCompleted: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : '',
        }),
      });
      setMemoItems((prev) =>
        prev.map((memo) => (String(memo.id) === String(saved.id) ? saved : memo)));
      setActionMessage(nextCompleted ? '전달 완료로 표시했습니다.' : '전달 완료를 해제했습니다.');
    } catch (e) {
      setActionMessage(`전달 완료 상태 변경 실패: ${e?.message || 'API 오류'}`);
    }
  };

  return {
    memoState: {
      memoDate,
      memoTitle,
      memoContent,
      memoAttachments,
      memoItems,
      memoSearchQuery,
      editingMemoId,
      memoShowOnDashboard,
      memoTouched,
      memoListMonth,
      announcementDate,
      announcementTitle,
      announcementContent,
      announcementAttachments,
      editingAnnouncementId,
      announcementTouched,
      announcementShowCompleted,
      announcementPanelMode,
    },
    memoSetters: {
      setMemoDate,
      setMemoTitle,
      setMemoContent,
      setMemoAttachments,
      setMemoItems,
      setMemoSearchQuery,
      setEditingMemoId,
      setMemoShowOnDashboard,
      setMemoTouched,
      setMemoListMonth,
      setAnnouncementDate,
      setAnnouncementTitle,
      setAnnouncementContent,
      setAnnouncementAttachments,
      setEditingAnnouncementId,
      setAnnouncementTouched,
      setAnnouncementShowCompleted,
      setAnnouncementPanelMode,
    },
    memoDerived: {
      announcementItems,
      memosByMonth,
      memoSearchQ,
      memoSearchResults,
      selectedMemo,
      selectedAnnouncement,
      dashboardMemos,
      visibleAnnouncementItems,
      pendingAnnouncementItemsCount,
    },
    memoActions: {
      startNewMemo,
      selectMemo,
      saveTaskMemo,
      deleteTaskMemo,
      startNewAnnouncement,
      selectAnnouncement,
      saveAnnouncement,
      deleteAnnouncement,
      toggleAnnouncementCompleted,
    },
    memoGuards: {
      memoDirty,
      announcementDirty,
    },
    memoDrafts: {
      memo: {
        status: memoDraft.status,
        label: draftStatusLabel(memoDraft.status),
        recovered: memoDraft.recovered,
        discard: discardMemoDraft,
      },
      announcement: {
        status: announcementDraft.status,
        label: draftStatusLabel(announcementDraft.status),
        recovered: announcementDraft.recovered,
        discard: discardAnnouncementDraft,
      },
    },
  };
}

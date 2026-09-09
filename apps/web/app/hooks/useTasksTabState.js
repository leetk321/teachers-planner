'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { toSeoulYm } from '../lib/date-time.js';

const toYmd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

const eventRangeYmd = (event) => {
  const startDate = String(event?.start_date || '').slice(0, 10);
  const endDate = String(event?.end_date || '').slice(0, 10);
  if (startDate) {
    return { startYmd: startDate, endYmd: endDate || startDate };
  }
  const start = new Date(event?.start_at || '');
  if (Number.isNaN(start.getTime())) return { startYmd: '', endYmd: '' };
  const startYmd = toYmd(start);
  if (!event?.end_at) return { startYmd, endYmd: startYmd };
  const endRaw = new Date(event.end_at || '');
  if (Number.isNaN(endRaw.getTime())) return { startYmd, endYmd: startYmd };
  const end = new Date(endRaw.getTime() - 1);
  return { startYmd, endYmd: toYmd(end) };
};

export function useTasksTabState({ schedules, googleCalendarEvents, googleTasksItems }) {
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [scheduleKind, setScheduleKind] = useState('todo');
  const [dueAt, setDueAt] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState(null);
  const [taskCalendarMonth, setTaskCalendarMonth] = useState(() => toSeoulYm());
  const [confirmDeleteScheduleId, setConfirmDeleteScheduleId] = useState(null);

  const deferredTaskSearchQuery = useDeferredValue(taskSearchQuery);

  const taskDatesInMonth = useMemo(() => {
    const [y, m] = String(taskCalendarMonth || '').split('-').map(Number);
    if (!y || !m) return { days: [], pad: 0 };
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const days = [];
    for (let d = 1; d <= last.getDate(); d += 1) {
      const dt = new Date(y, m - 1, d);
      const iso = toYmd(dt);
      const items = schedules.filter((s) => String(s.due_at || '').slice(0, 10) === iso);
      const gItems = googleCalendarEvents.filter((e) => {
        const { startYmd, endYmd } = eventRangeYmd(e);
        return startYmd && endYmd && startYmd <= iso && iso <= endYmd;
      }).map((x) => ({ ...x, isGoogle: true }));
      days.push({ day: d, iso, items: [...items, ...gItems], weekday: dt.getDay() });
    }
    return { days, pad: (first.getDay() + 6) % 7 };
  }, [taskCalendarMonth, schedules, googleCalendarEvents]);

  const schedulesInSelectedMonth = useMemo(() => schedules.filter((s) => String(s.due_at || '').slice(0, 7) === taskCalendarMonth), [schedules, taskCalendarMonth]);

  const isCurrentTaskMonth = useMemo(() => {
    const n = new Date();
    const cur = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    return String(taskCalendarMonth || '') === cur;
  }, [taskCalendarMonth]);

  const taskMonthTitle = useMemo(() => {
    const [yy, mm] = String(taskCalendarMonth || '').split('-').map(Number);
    if (!yy || !mm) return String(taskCalendarMonth || '');
    return `${yy}년 ${mm}월`;
  }, [taskCalendarMonth]);

  const next30End = useMemo(() => new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), []);
  const inNext30Days = (raw) => {
    const d = new Date(raw || '');
    const now = new Date();
    return Number.isFinite(d.getTime()) && d >= now && d <= next30End;
  };

  const taskSearchQ = useMemo(() => String(deferredTaskSearchQuery || '').trim().toLowerCase(), [deferredTaskSearchQuery]);
  const taskSearchTodoResults = useMemo(() => {
    if (!taskSearchQ) return [];
    return (schedules || []).filter((s) => String(s.kind || 'todo') === 'todo' && String(s.title || '').toLowerCase().includes(taskSearchQ));
  }, [schedules, taskSearchQ]);
  const taskSearchEventResults = useMemo(() => {
    if (!taskSearchQ) return [];
    return (schedules || []).filter((s) => String(s.kind || 'todo') === 'event' && String(s.title || '').toLowerCase().includes(taskSearchQ));
  }, [schedules, taskSearchQ]);

  const googleEventsInSelectedMonth = useMemo(() => {
    const [y, m] = String(taskCalendarMonth || '').split('-').map(Number);
    if (!y || !m) return [];
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const monthEnd = toYmd(new Date(y, m, 0));
    return (googleCalendarEvents || []).filter((e) => {
      const { startYmd, endYmd } = eventRangeYmd(e);
      return startYmd && endYmd && startYmd <= monthEnd && endYmd >= monthStart;
    });
  }, [googleCalendarEvents, taskCalendarMonth]);

  const taskBottomLocalTodos = useMemo(() => (schedules || []).filter((s) => {
    if (String(s.kind || 'todo') !== 'todo') return false;
    const inMonth = String(s.due_at || '').slice(0, 7) === taskCalendarMonth;
    const in30 = isCurrentTaskMonth && inNext30Days(s.due_at);
    return inMonth || in30;
  }), [schedules, taskCalendarMonth, isCurrentTaskMonth]);

  const taskBottomLocalEvents = useMemo(() => (schedules || []).filter((s) => {
    if (String(s.kind || 'todo') !== 'event') return false;
    const inMonth = String(s.due_at || '').slice(0, 7) === taskCalendarMonth;
    const in30 = isCurrentTaskMonth && inNext30Days(s.due_at);
    return inMonth || in30;
  }), [schedules, taskCalendarMonth, isCurrentTaskMonth]);

  const taskBottomGoogleTasks = useMemo(() => (googleTasksItems || []).filter((t) => {
    const inMonth = String(t.due_at || '').slice(0, 7) === taskCalendarMonth;
    const in30 = isCurrentTaskMonth && inNext30Days(t.due_at);
    return inMonth || in30;
  }), [googleTasksItems, taskCalendarMonth, isCurrentTaskMonth]);

  const taskBottomGoogleEvents = useMemo(() => (googleCalendarEvents || []).filter((e) => {
    const { startYmd, endYmd } = eventRangeYmd(e);
    const inMonth = startYmd && endYmd && startYmd.slice(0, 7) <= taskCalendarMonth && endYmd.slice(0, 7) >= taskCalendarMonth;
    const in30 = isCurrentTaskMonth && inNext30Days(e.start_at);
    return inMonth || in30;
  }), [googleCalendarEvents, taskCalendarMonth, isCurrentTaskMonth]);

  const taskSearchGoogleEventResults = useMemo(() => {
    if (!taskSearchQ) return [];
    return (googleCalendarEvents || []).filter((e) => String(e.title || '').toLowerCase().includes(taskSearchQ));
  }, [googleCalendarEvents, taskSearchQ]);

  const taskSearchGoogleTaskResults = useMemo(() => {
    if (!taskSearchQ) return [];
    return (googleTasksItems || []).filter((t) => String(t.title || '').toLowerCase().includes(taskSearchQ));
  }, [googleTasksItems, taskSearchQ]);

  return {
    scheduleTitle,
    setScheduleTitle,
    taskSearchQuery,
    setTaskSearchQuery,
    scheduleKind,
    setScheduleKind,
    dueAt,
    setDueAt,
    editingScheduleId,
    setEditingScheduleId,
    taskCalendarMonth,
    setTaskCalendarMonth,
    confirmDeleteScheduleId,
    setConfirmDeleteScheduleId,
    taskDatesInMonth,
    schedulesInSelectedMonth,
    isCurrentTaskMonth,
    taskMonthTitle,
    next30End,
    taskSearchQ,
    taskSearchTodoResults,
    taskSearchEventResults,
    googleEventsInSelectedMonth,
    taskBottomLocalTodos,
    taskBottomLocalEvents,
    taskBottomGoogleTasks,
    taskBottomGoogleEvents,
    taskSearchGoogleEventResults,
    taskSearchGoogleTaskResults,
  };
}

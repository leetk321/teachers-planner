'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';

export default function StudentDetailPage() {
  const [student, setStudent] = useState(null);
  const [notes, setNotes] = useState([]);
  const [photoItems, setPhotoItems] = useState([]);
  const [schoolName, setSchoolName] = useState('우리학교');
  const [teacherName, setTeacherName] = useState('ㅇㅇㅇ');
  const [token, setToken] = useState('');

  const [newNote, setNewNote] = useState('');

  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sid = searchParams.get('sid');
  const slug = params?.slug;
  const year = String(slug || '').slice(0, 4);

  const photoKey = useMemo(() => `teacher_notebook_photos_${slug}`, [slug]);

  const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, { ...options, headers });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
    return j;
  };

  const load = async () => {
    if (!slug || !token) return;

    let s = null;
    if (sid) {
      s = await apiFetch(`/api/students/${encodeURIComponent(sid)}`).catch(() => null);
    }
    if (!s?.id) {
      s = await apiFetch(`/api/students/by-slug/${encodeURIComponent(slug)}`).catch(() => null);
    }

    if (!s?.id) {
      setStudent(null);
      setNotes([]);
      return;
    }
    const n = await apiFetch(`/api/notes?studentId=${encodeURIComponent(s.id)}&year=${encodeURIComponent(year)}`);
    setStudent(s);
    setNotes(Array.isArray(n) ? n : []);
  };

  useEffect(() => {
    const t = localStorage.getItem('teacher_notebook_token_v1') || '';
    setToken(t);
  }, []);

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, year, sid, token]);

  useEffect(() => {
    const raw = localStorage.getItem('teacher_notebook_settings_v1');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (s.schoolName) setSchoolName(String(s.schoolName));
      if (s.teacherDisplayName) setTeacherName(String(s.teacherDisplayName));
    } catch {}
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(photoKey);
    if (!raw) return;
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) setPhotoItems(arr);
    } catch {}
  }, [photoKey]);

  useEffect(() => {
    localStorage.setItem(photoKey, JSON.stringify(photoItems));
  }, [photoItems, photoKey]);

  const addCounselingMemo = async () => {
    if (!student?.id || !newNote.trim()) return;
    await apiFetch('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ academicYear: year, studentId: Number(student.id), category: 'guidance', content: newNote.trim() }),
    });
    setNewNote('');
    await load();
  };

  const onPickPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const toDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });

    const next = [];
    for (const f of files) {
      if (!String(f.type || '').startsWith('image/')) continue;
      if (f.size > 3 * 1024 * 1024) continue;
      const dataUrl = await toDataUrl(f);
      next.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: f.name, createdAt: new Date().toISOString(), dataUrl });
    }

    setPhotoItems((prev) => [...next, ...prev].slice(0, 40));
    e.target.value = '';
  };

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16, fontFamily: 'Pretendard, sans-serif', background: '#f8fafc' }}>
      <section style={{ background: 'linear-gradient(135deg, #1d4ed8, #0f172a)', color: '#fff', borderRadius: 16, padding: 18, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 30 }}>{schoolName} · 디지털 교무수첩</h1>
        <p style={{ marginTop: 8, color: '#dbeafe' }}>{teacherName} 선생님 안녕하세요</p>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/" style={tabLink}>대시보드</a>
        <a href="/" style={tabLink}>학생</a>
        <a href="/" style={tabLink}>상담기록</a>
        <a href="/" style={tabLink}>일정</a>
        <a href="/" style={{ ...tabLink, background: '#dbeafe', borderColor: '#93c5fd', color: '#1d4ed8' }}>학생 상세</a>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <a href="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 700 }}>← 메인으로</a>
        <button onClick={() => router.back()} style={{ border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, padding: '6px 10px', fontWeight: 700, cursor: 'pointer' }}>이전으로</button>
        <div style={{ color: '#64748b' }}>경로: students/{slug}</div>
      </section>

      {!token ? (
        <p>로그인이 필요합니다. 메인에서 로그인 후 다시 시도해주세요.</p>
      ) : !student ? (
        <p>학생 정보를 불러오는 중이거나, 유효하지 않은 경로입니다.</p>
      ) : (
        <>
          <section style={card}>
            <h2 style={{ marginTop: 0 }}>{student.name}</h2>
            <p style={{ margin: 0 }}>{student.class_name} / {student.student_no}번 / 위험도: {student.risk_level === 'watch' ? '관심' : '일반'}</p>
            <p style={{ marginTop: 6, color: '#64748b' }}>태그: {student.tags || '-'}</p>
          </section>

          <section style={card}>
            <h3 style={{ marginTop: 0 }}>사진 추가</h3>
            <input type="file" accept="image/*" multiple onChange={onPickPhotos} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginTop: 10 }}>
              {photoItems.map((p) => (
                <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
                  <img src={p.dataUrl} alt={p.name} style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 6 }} />
                  <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-all' }}>{p.name}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={card}>
            <h3 style={{ marginTop: 0 }}>상담 기록 메모</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="상담 메모 입력" style={{ flex: 1, padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
              <button onClick={addCounselingMemo} style={btn}>메모 추가</button>
            </div>

            <ul style={{ marginTop: 12, lineHeight: 1.6 }}>
              {notes.map((n) => (
                <li key={n.id}>[{n.note_date}] {label(n.category)} - {n.content}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

const label = (k) => ({ general: '일반', class: '수업', guidance: '생활지도', parent: '학부모' }[k] || '일반');
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 12 };
const btn = { padding: '10px 12px', border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
const tabLink = { border: '1px solid #cbd5e1', background: '#fff', borderRadius: 999, padding: '8px 12px', textDecoration: 'none', color: '#334155', fontWeight: 600 };

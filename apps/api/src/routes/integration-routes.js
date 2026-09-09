import { fetchWithTimeout } from '../utils/fetchWithTimeout.js';

const GOOGLE_API_TIMEOUT_MS = 10_000;

export const registerIntegrationRoutes = ({
  app,
  auth,
  phase1Store,
  googleCalendarService,
  schoolDashboardService,
}) => {
  app.get('/api/google-calendar/events', auth, async (req, res) => {
    const settings = phase1Store.getSettings(req.user.id);

    try {
      const events = await googleCalendarService.listEvents(settings);
      res.json(events);
    } catch (error) {
      if (error?.statusCode === 400) {
        return res.status(400).json({ error: error.message || 'Google 캘린더를 불러오지 못했습니다.' });
      }
      res.status(500).json({ error: 'Google 캘린더 응답을 처리하지 못했습니다.' });
    }
  });

  app.get('/api/google-calendar/holidays', auth, async (req, res) => {
    try {
      const year = String(req.query?.year ?? '').trim();
      const holidays = await googleCalendarService.listKoreanHolidays(year);
      res.json({ year: Number(year), holidays });
    } catch (error) {
      if (error?.statusCode === 400) {
        return res.status(400).json({ error: error.message || '한국 공휴일을 불러오지 못했습니다.' });
      }
      res.status(500).json({ error: '한국 공휴일 응답을 처리하지 못했습니다.' });
    }
  });

  app.get('/api/google-tasks', auth, async (req, res) => {
    const cfg = phase1Store.getSettings(req.user.id) || {};
    let accessToken = String(cfg.googleTasksAccessToken || '');
    const clientId = String(cfg.googleTasksClientId || '');
    const clientSecret = String(cfg.googleTasksClientSecret || '');
    const refreshToken = String(cfg.googleTasksRefreshToken || '');
    const listId = encodeURIComponent(String(cfg.googleTasksListId || '@default'));

    try {
      if (clientId && clientSecret && refreshToken) {
        console.log(`[GoogleTasks] Attempting to refresh token for user ${req.user.id}`);
        let tokenRes;
        let tokenJson = {};
        try {
          tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: 'refresh_token',
            }),
          }, {
            timeoutMs: GOOGLE_API_TIMEOUT_MS,
            serviceName: 'Google OAuth',
          });
          tokenJson = await tokenRes.json().catch(() => ({}));
        } catch (error) {
          tokenJson = await error?.response?.json?.().catch(() => ({})) || {};
          console.error(`[GoogleTasks] Token refresh failed for user ${req.user.id}:`, tokenJson?.error || error?.code || error?.status);
          return res.status(400).json({
            error: `Google 토큰 갱신 실패: ${tokenJson?.error || error?.status || error?.code || 'unknown_error'}`,
          });
        }
        if (!tokenJson?.access_token) {
          console.error(`[GoogleTasks] Token response has no access token for user ${req.user.id}`);
          return res.status(400).json({ error: 'Google 토큰 갱신 실패: access_token 누락' });
        }
        accessToken = String(tokenJson.access_token);
        console.log(`[GoogleTasks] Token refreshed successfully for user ${req.user.id}`);
      }

      if (!accessToken) {
        console.warn(`[GoogleTasks] No access token available for user ${req.user.id}`);
        return res.json([]);
      }

      console.log(`[GoogleTasks] Fetching tasks for list ${listId}`);
      let r;
      try {
        r = await fetchWithTimeout(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks?showCompleted=true&maxResults=200`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, {
          timeoutMs: GOOGLE_API_TIMEOUT_MS,
          serviceName: 'Google 할 일',
        });
      } catch (error) {
        const rawErrorText = await error?.response?.text?.().catch(() => '') || error?.message || '응답 내용 없음';
        const errText = String(rawErrorText).slice(0, 2_000);
        console.error(`[GoogleTasks] Fetch failed (Status ${error?.status || 0}):`, errText);
        return res.status(400).json({ error: 'Google 할 일을 불러오지 못했습니다.', details: errText });
      }

      const j = await r.json().catch(() => null);
      if (!j) throw new Error('Google 할 일 응답 형식이 올바르지 않습니다.');
      const tasks = Array.isArray(j?.items) ? j.items : [];
      console.log(`[GoogleTasks] Successfully fetched ${tasks.length} tasks`);
      const rows = tasks.map((t) => ({
        id: t.id,
        title: t.title || '(제목 없음)',
        notes: t.notes || '',
        status: t.status || 'needsAction',
        due_at: t.due || null,
        updated_at: t.updated || null,
        source: 'google_tasks',
      }));
      res.json(rows);
    } catch (err) {
      console.error(`[GoogleTasks] Unexpected error for user ${req.user.id}:`, err);
      res.status(500).json({ error: 'Google 할 일 응답을 처리하지 못했습니다.', message: err.message });
    }
  });

  app.get('/api/neis/today-lunch', auth, async (req, res) => {
    try {
      const requestedSchoolName = String(req.query.schoolName || '').trim();
      const settings = phase1Store.getSettings(req.user.id);
      const schoolName = requestedSchoolName || String(settings?.schoolName || '').trim();
      const payload = await schoolDashboardService.fetchTodayLunchBySchoolName(schoolName);
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e || '급식 정보를 불러오지 못했습니다.') });
    }
  });

  app.get('/api/weather/school', auth, async (req, res) => {
    try {
      const requestedSchoolName = String(req.query.schoolName || '').trim();
      const settings = phase1Store.getSettings(req.user.id);
      const schoolName = requestedSchoolName || String(settings?.schoolName || '').trim();
      const kmaAuthKey = String(
        settings?.kmaAuthKey
        || settings?.kmaServiceKey
        || process.env.KMA_AUTH_KEY
        || '',
      ).trim();
      const payload = await schoolDashboardService.fetchSchoolWeatherBySchoolName(schoolName, kmaAuthKey);
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e?.message || e || '날씨 정보를 불러오지 못했습니다.') });
    }
  });
};

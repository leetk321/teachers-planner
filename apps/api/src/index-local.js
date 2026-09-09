import express from 'express';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createApiApp, registerBaseRoutes } from './app/create-api-app.js';
import { DATA_DIR, LEGACY_JSON_PATH, SQLITE_PATH, STUDENT_PHOTO_DIR, UPLOAD_DIR, ensureRuntimeDirectories } from './config/paths.js';
import { ensureLegacySnapshotSeed, readLegacySnapshot } from './db/legacy-snapshot.js';
import { createPhase1Store } from './db/phase1-store.js';
import { createPhase2Store } from './db/phase2-store.js';
import { createPhase3Store } from './db/phase3-store.js';
import { createPhase4Store } from './db/phase4-store.js';
import { createPhase5SequenceStore } from './db/phase5-sequence-store.js';
import { createPhase6IssuesStore } from './db/phase6-issues-store.js';
import { createPhase8DraftsStore } from './db/phase8-drafts-store.js';
import { createSearchIndexStore } from './db/search-index-store.js';
import { createStudentTimelineStore } from './db/student-timeline-store.js';
import { createTrashStore } from './db/trash-store.js';
import { buildAuthMiddleware } from './middleware/auth-session.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerComtimeRoutes } from './routes/comtime-routes.js';
import { registerDraftRoutes } from './routes/draft-routes.js';
import { registerIntegrationRoutes } from './routes/integration-routes.js';
import { registerSearchRoutes } from './routes/search-routes.js';
import { registerStudentTimelineRoutes } from './routes/student-timeline-routes.js';
import { registerTrashRoutes } from './routes/trash-routes.js';
import { registerPhase1Routes } from './routes/phase1-routes.js';
import { registerPhase2Routes } from './routes/phase2-routes.js';
import { registerPhase3Routes } from './routes/phase3-routes.js';
import { registerPhase6IssuesRoutes } from './routes/phase6-issues-routes.js';
import { createComtimeService } from './services/comtime-service.js';
import { createGoogleCalendarService } from './services/google-calendar-service.js';
import { createSchoolDashboardService } from './services/school-dashboard-service.js';
import { createSearchService } from './services/search-service.js';
import { createTeacherNotebookTrashLifecycle, createTrashService } from './services/trash-service.js';
import { hashPassword, isMasterAdmin, makeSalt, makeToken, normalizeUsername } from './utils/authSecurity.js';
import { createDiskUpload, normalizeStudentPhotoUrlForUser, normalizeUploadedOriginalName, removeOwnedUploadRows, removeStudentPhotoFileByUrl, removeUserDirectories } from './utils/uploadAssets.js';

const app = createApiApp({ jsonLimit: '20mb' });

ensureRuntimeDirectories();

const sqlite = new Database(SQLITE_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');
ensureLegacySnapshotSeed(sqlite, LEGACY_JSON_PATH);

const phase5SequenceStore = createPhase5SequenceStore({ sqlite, dataDir: DATA_DIR, readLegacySnapshot });
const phase1Store = createPhase1Store({ sqlite, dataDir: DATA_DIR, readLegacySnapshot, sequenceStore: phase5SequenceStore });
const phase2Store = createPhase2Store({ sqlite, dataDir: DATA_DIR, readLegacySnapshot, sequenceStore: phase5SequenceStore });
const phase3Store = createPhase3Store({ sqlite, dataDir: DATA_DIR, readLegacySnapshot, sequenceStore: phase5SequenceStore });
const phase4Store = createPhase4Store({ sqlite, dataDir: DATA_DIR, readLegacySnapshot, sequenceStore: phase5SequenceStore });
const phase6Store = createPhase6IssuesStore({ sqlite, dataDir: DATA_DIR, sequenceStore: phase5SequenceStore });
const draftsStore = createPhase8DraftsStore({ sqlite });
const searchIndexStore = createSearchIndexStore({ sqlite });
const studentTimelineStore = createStudentTimelineStore({ sqlite });
const trashStore = createTrashStore({ sqlite });
const trashService = createTrashService({ trashStore });
const trashLifecycle = createTeacherNotebookTrashLifecycle({
  sqlite,
  trashService,
  phase1Store,
  removeOwnedUploadRows,
  removeStudentPhotoFileByUrl,
});

const comtimeService = createComtimeService();
const googleCalendarService = createGoogleCalendarService();
const schoolDashboardService = createSchoolDashboardService();
const searchService = createSearchService({ phase1Store, phase2Store, phase3Store, phase6Store, searchIndexStore });
const auth = buildAuthMiddleware({ phase4Store });

registerBaseRoutes({
  app,
  meta: { name: 'teacher-notebook-api', stage: 'local', version: '3.16.0-local', features: ['auth', 'rbac', 'file-persistence', 'comtime', 'search', 'drafts', 'trash', 'student-timeline'] },
  getHealth: () => {
    const quickCheck = String(sqlite.pragma('quick_check', { simple: true }) || '');
    return { ok: quickCheck === 'ok', ready: quickCheck === 'ok', db: 'sqlite', schemaVersion: Number(sqlite.pragma('user_version', { simple: true }) || 0) };
  },
});

registerAuthRoutes({
  app,
  auth,
  phase1Store,
  phase2Store,
  phase3Store,
  phase4Store,
  phase6Store,
  draftStore: draftsStore,
  trashStore,
  removeOwnedUploadRows,
  removeUserDirectories,
  runOwnerDeletionTransaction: (action) => sqlite.transaction(action)(),
  hashPassword,
  isMasterAdmin,
  makeSalt,
  makeToken,
  normalizeUsername,
});

registerPhase1Routes({
  app,
  auth,
  express,
  fs,
  UPLOAD_DIR,
  phase1Store,
  trashLifecycle,
  createDiskUpload,
  normalizeUploadedOriginalName,
});

registerIntegrationRoutes({
  app,
  auth,
  phase1Store,
  googleCalendarService,
  schoolDashboardService,
});

registerSearchRoutes({
  app,
  auth,
  searchService,
});

registerDraftRoutes({
  app,
  auth,
  draftsStore,
});

registerTrashRoutes({
  app,
  auth,
  trashService,
});

registerPhase2Routes({
  app,
  auth,
  express,
  fs,
  path,
  STUDENT_PHOTO_DIR,
  phase2Store,
  phase3Store,
  trashLifecycle,
  createDiskUpload,
  normalizeStudentPhotoUrlForUser,
  normalizeUploadedOriginalName,
  removeStudentPhotoFileByUrl,
});

registerStudentTimelineRoutes({
  app,
  auth,
  studentTimelineStore,
});

registerPhase3Routes({
  app,
  auth,
  phase3Store,
});

registerPhase6IssuesRoutes({
  app,
  auth,
  phase2Store,
  phase6Store,
  trashLifecycle,
});

registerComtimeRoutes({
  app,
  auth,
  comtimeService,
});

const runTrashExpiryCleanup = () => {
  try {
    const result = trashService.purgeAllExpired();
    if (result.removed.length || result.cleanup_failures.length) {
      console.log(`[Trash] expiry cleanup: owners=${result.owners_checked}, removed=${result.removed.length}, failures=${result.cleanup_failures.length}`);
    }
    if (result.cleanup_failures.length) console.warn('[Trash] expiry cleanup failures', result.cleanup_failures);
  } catch (error) {
    console.error('[Trash] expiry cleanup failed:', String(error?.message || error));
  }
};

setImmediate(runTrashExpiryCleanup);
const trashCleanupTimer = setInterval(runTrashExpiryCleanup, 24 * 60 * 60 * 1000);
trashCleanupTimer.unref();

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`API(local,sqlite) listening on :${port}`);
  console.log(`DB: ${SQLITE_PATH}`);
  console.log(`UPLOAD_DIR: ${UPLOAD_DIR}`);
  console.log(`STUDENT_PHOTO_DIR: ${STUDENT_PHOTO_DIR}`);
});

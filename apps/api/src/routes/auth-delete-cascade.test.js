import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDeleteUserCascade } from './auth-routes.js';
import { removeOwnedUploadRows, removeUserDirectories } from '../utils/uploadAssets.js';

const createStores = (events, { failAt = '' } = {}) => {
  const record = (name) => () => {
    events.push(name);
    if (failAt === name) throw new Error(`failed at ${name}`);
  };
  return {
    phase1Store: {
      listFiles(ownerId, options) {
        events.push(`files:list:${ownerId}:${options.includeAttachments}`);
        return [{ id: 1, owner_id: ownerId, path: 'legacy-file' }];
      },
      deleteOwnerPhase1Data: record('phase1:delete'),
    },
    phase2Store: { deleteOwnerPhase2Data: record('phase2:delete') },
    phase3Store: { deleteOwnerPhase3Data: record('phase3:delete') },
    phase4Store: { deleteOwnerPhase4Data: record('phase4:delete') },
    phase6Store: { deleteOwnerPhase6Data: record('phase6:delete') },
    draftStore: { deleteOwnerData: record('drafts:delete') },
    trashStore: { deleteOwnerData: record('trash:delete') },
  };
};

test('account cascade captures upload rows before database deletion and removes files afterwards', () => {
  const events = [];
  const cascade = createDeleteUserCascade({
    ...createStores(events),
    runOwnerDeletionTransaction(action) {
      events.push('transaction:begin');
      action();
      events.push('transaction:commit');
    },
    removeOwnedUploadRows(ownerId, rows) {
      events.push(`files:remove:${ownerId}:${rows.length}`);
      return rows.length;
    },
    removeUserDirectories(ownerId) {
      events.push(`directories:remove:${ownerId}`);
    },
  });

  assert.deepEqual(cascade(7), { removedFiles: 1, fileRows: 1 });
  assert.deepEqual(events, [
    'files:list:7:true',
    'transaction:begin',
    'drafts:delete',
    'trash:delete',
    'phase6:delete',
    'phase3:delete',
    'phase2:delete',
    'phase1:delete',
    'phase4:delete',
    'transaction:commit',
    'files:remove:7:1',
    'directories:remove:7',
  ]);
});

test('account cascade does not remove physical files when database deletion fails', () => {
  const events = [];
  const cascade = createDeleteUserCascade({
    ...createStores(events, { failAt: 'phase2:delete' }),
    runOwnerDeletionTransaction(action) {
      events.push('transaction:begin');
      action();
    },
    removeOwnedUploadRows() {
      events.push('files:remove');
    },
    removeUserDirectories() {
      events.push('directories:remove');
    },
  });

  assert.throws(() => cascade(8), /failed at phase2:delete/);
  assert.equal(events.includes('files:remove'), false);
  assert.equal(events.includes('directories:remove'), false);
});

const writeOwnedFixture = (root, ownerId) => {
  const locations = {
    uploadDir: path.join(root, 'uploads'),
    studentPhotoDir: path.join(root, 'student-photos'),
    draftDir: path.join(root, 'drafts'),
    trashDir: path.join(root, 'trash'),
  };
  const files = [
    path.join(locations.uploadDir, 'users', String(ownerId), 'nested', 'attachment.txt'),
    path.join(locations.uploadDir, String(ownerId), 'legacy.txt'),
    path.join(locations.studentPhotoDir, String(ownerId), 'photo.png'),
    path.join(locations.draftDir, String(ownerId), 'legacy-draft.bin'),
    path.join(locations.trashDir, String(ownerId), 'retained.bin'),
  ];
  files.forEach((file) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'owned');
  });
  return { ...locations, files };
};

test('account cascade removes owned upload, photo, draft, and trash files only after commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-account-delete-'));
  try {
    const owner = writeOwnedFixture(root, 7);
    const other = writeOwnedFixture(root, 8);
    const stores = createStores([]);
    stores.phase1Store.listFiles = () => [{
      id: 1,
      owner_id: 7,
      path: 'users/7/nested/attachment.txt',
      url: '/api/files/1/download',
    }];
    const cascade = createDeleteUserCascade({
      ...stores,
      runOwnerDeletionTransaction: (action) => action(),
      removeOwnedUploadRows: (ownerId, rows) => removeOwnedUploadRows(ownerId, rows, { uploadDir: owner.uploadDir }),
      removeUserDirectories: (ownerId) => removeUserDirectories(ownerId, { dataDir: root, ...owner }),
    });

    assert.deepEqual(cascade(7), { removedFiles: 1, fileRows: 1 });
    owner.files.forEach((file) => assert.equal(fs.existsSync(file), false));
    other.files.forEach((file) => assert.equal(fs.existsSync(file), true));
    assert.equal(fs.existsSync(path.join(owner.uploadDir, 'users', '7')), false);
    assert.equal(fs.existsSync(path.join(owner.studentPhotoDir, '7')), false);
    assert.equal(fs.existsSync(path.join(owner.draftDir, '7')), false);
    assert.equal(fs.existsSync(path.join(owner.trashDir, '7')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('account cascade keeps all owned physical data when the database transaction fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teacher-notebook-account-rollback-'));
  try {
    const owner = writeOwnedFixture(root, 9);
    const stores = createStores([], { failAt: 'phase2:delete' });
    stores.phase1Store.listFiles = () => [{
      id: 1,
      owner_id: 9,
      path: 'users/9/nested/attachment.txt',
      url: '/api/files/1/download',
    }];
    const cascade = createDeleteUserCascade({
      ...stores,
      runOwnerDeletionTransaction: (action) => action(),
      removeOwnedUploadRows: (ownerId, rows) => removeOwnedUploadRows(ownerId, rows, { uploadDir: owner.uploadDir }),
      removeUserDirectories: (ownerId) => removeUserDirectories(ownerId, { dataDir: root, ...owner }),
    });

    assert.throws(() => cascade(9), /failed at phase2:delete/);
    owner.files.forEach((file) => assert.equal(fs.existsSync(file), true));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

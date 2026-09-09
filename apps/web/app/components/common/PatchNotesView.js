'use client';

import { PatchNotesTab } from '../tabs/PatchNotesTab.js';
import { PATCH_NOTES } from '../../data/patch-notes.js';

export function PatchNotesView({ onScrollTop }) {
  return <PatchNotesTab patchNotes={PATCH_NOTES} onScrollTop={onScrollTop} />;
}

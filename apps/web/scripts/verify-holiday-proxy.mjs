import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pageSource = await readFile(new URL('../app/page.js', import.meta.url), 'utf8');

assert.doesNotMatch(
  pageSource,
  /calendar\.google\.com\/calendar\/ical\/ko\.south_korea/i,
  'page.js must not fetch the Google Korean holiday ICS directly',
);
assert.match(
  pageSource,
  /apiFetch\(`\/api\/google-calendar\/holidays\?year=\$\{encodeURIComponent\(String\(y\)\)\}`\)/,
  'page.js must load holidays through the authenticated API proxy',
);
assert.match(pageSource, /setHolidayMap\(fallback\)/, 'the local Korean holiday fallback must remain active');
assert.match(pageSource, /\[taskCalendarMonth, token\]/, 'holiday loading must retry after authentication');

console.log('Holiday proxy frontend verification passed.');

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dateFromSeoulParts,
  getSeoulCompactDate,
  getSeoulDateText,
  getSeoulWeekday,
  shiftCalendarDateText,
} from './dateTime.js';

test('uses the Seoul calendar date and weekday across the UTC day boundary', () => {
  const instant = new Date('2026-07-22T15:30:00.000Z');
  assert.equal(getSeoulDateText(instant), '2026-07-23');
  assert.equal(getSeoulCompactDate(instant), '20260723');
  assert.equal(getSeoulWeekday(instant), 4);
});

test('creates Seoul-local instants and shifts calendar dates without server timezone dependence', () => {
  assert.equal(dateFromSeoulParts({ year: 2026, month: 7, day: 23 }).toISOString(), '2026-07-22T15:00:00.000Z');
  assert.equal(shiftCalendarDateText('2026-03-01', -1), '2026-02-28');
});

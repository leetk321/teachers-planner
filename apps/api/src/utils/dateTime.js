export const SEOUL_TIME_ZONE = 'Asia/Seoul';

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

const asValidDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError('invalid date');
  return date;
};

export const getTimeZoneDateTimeParts = (value = new Date(), timeZone = SEOUL_TIME_ZONE) => {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(asValidDate(value)).forEach((part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
  });

  return {
    year: String(parts.year || ''),
    month: String(parts.month || '').padStart(2, '0'),
    day: String(parts.day || '').padStart(2, '0'),
    hour: String(parts.hour || '00').padStart(2, '0'),
    minute: String(parts.minute || '00').padStart(2, '0'),
    second: String(parts.second || '00').padStart(2, '0'),
  };
};

export const getSeoulDateText = (value = new Date()) => {
  const { year, month, day } = getTimeZoneDateTimeParts(value, SEOUL_TIME_ZONE);
  return `${year}-${month}-${day}`;
};

export const getSeoulCompactDate = (value = new Date()) => getSeoulDateText(value).replaceAll('-', '');

export const getSeoulWeekday = (value = new Date()) => {
  const { year, month, day } = getTimeZoneDateTimeParts(value, SEOUL_TIME_ZONE);
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12)).getUTCDay();
};

export const shiftCalendarDateText = (dateText, offsetDays) => {
  const match = String(dateText || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new RangeError('invalid calendar date');
  const [, year, month, day] = match;
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + Number(offsetDays || 0), 12));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
};

export const dateFromSeoulParts = ({ year, month, day, hour = 0, minute = 0, second = 0 }) => new Date(
  Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - SEOUL_OFFSET_MS,
);


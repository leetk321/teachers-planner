const SEOUL_TIME_ZONE = 'Asia/Seoul';

const getSeoulParts = (value, includeTime = false) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  });
  return Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
};

export const toSeoulYmd = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = getSeoulParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
};

export const toSeoulYm = (value = new Date()) => toSeoulYmd(value).slice(0, 7);

export const toSeoulDateTimeLocal = (value = new Date()) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const parts = getSeoulParts(value, true);
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : String(value || '').slice(0, 16);
};

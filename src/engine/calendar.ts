// Date helpers. All in-game dates are UTC-midnight epoch milliseconds.
export const DAY = 86400000;
export const utc = (y: number, m: number, d: number): number => Date.UTC(y, m, d);
export const addDays = (t: number, n: number): number => t + n * DAY;
export const dayDiff = (a: number, b: number): number => Math.round((b - a) / DAY);
export const parts = (t: number) => { const d = new Date(t); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
/** 0 = Monday ... 6 = Sunday */
export const weekday = (t: number): number => (new Date(t).getUTCDay() + 6) % 7;
export const startOfWeek = (t: number): number => addDays(t, -weekday(t));
export const startOfMonth = (t: number): number => { const p = parts(t); return utc(p.y, p.m, 1); };
export const daysInMonth = (t: number): number => { const p = parts(t); return new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate(); };
export const addMonths = (t: number, n: number): number => { const p = parts(t); return utc(p.y, p.m + n, 1); };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const dowName = (t: number): string => DOW[weekday(t)];
export const monthName = (t: number): string => `${MONTHS_LONG[parts(t).m]} ${parts(t).y}`;
export const fmtDate = (t: number): string => { const p = parts(t); return `${p.d} ${MONTHS[p.m]} ${p.y}`; };
export const fmtDateShort = (t: number): string => { const p = parts(t); return `${p.d} ${MONTHS[p.m]}`; };
export const fmtDateLong = (t: number): string => `${dowName(t)} ${fmtDate(t)}`;
export const sameDay = (a: number, b: number): boolean => Math.round(a / DAY) === Math.round(b / DAY);

/** Season id = calendar year in which the season starts (2026 = 2026/27). Seasons roll over on 1 July. */
export const seasonOf = (t: number): number => { const p = parts(t); return p.m >= 6 ? p.y : p.y - 1; };
export const seasonLabel = (s: number): string => `${s}/${String(s + 1).slice(2)}`;
export const seasonStart = (s: number): number => utc(s, 6, 1);
export const seasonEnd = (s: number): number => utc(s + 1, 5, 30);

// ---- Transfer windows: summer (1 Jul - 31 Aug) and winter (1 Jan - 31 Jan) ----
export interface WindowInfo { open: boolean; name: string; closesOn?: number; opensOn?: number }
export function windowInfo(t: number): WindowInfo {
  const p = parts(t);
  if (p.m === 6 || p.m === 7) return { open: true, name: 'Summer window', closesOn: utc(p.y, 7, 31) };
  if (p.m === 0) return { open: true, name: 'January window', closesOn: utc(p.y, 0, 31) };
  if (p.m <= 5 && p.m >= 1) return { open: false, name: 'Window closed', opensOn: utc(p.y, 6, 1) };
  // Sep - Dec
  return { open: false, name: 'Window closed', opensOn: utc(p.y + 1, 0, 1) };
}
export const isWindowOpen = (t: number): boolean => windowInfo(t).open;
export function windowLabel(t: number): string {
  const w = windowInfo(t);
  if (w.open) return `${w.name} open - deadline ${fmtDate(w.closesOn!)}`;
  return `Window closed - reopens ${fmtDate(w.opensOn!)}`;
}
export const isDeadlineDay = (t: number): boolean => { const w = windowInfo(t); return w.open && sameDay(w.closesOn!, t); };
export const daysToDeadline = (t: number): number | null => { const w = windowInfo(t); return w.open ? dayDiff(t, w.closesOn!) : null; };

/** Contract end date for a contract of N years signed in the season containing `t`. */
export const contractEndFor = (t: number, years: number): number => utc(seasonOf(t) + years, 5, 30);
export const contractYearsLeft = (end: number | undefined, t: number): number => (end === undefined ? 0 : Math.max(0, parts(end).y - seasonOf(t)));

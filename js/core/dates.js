/**
 * Date helpers. Every date in the app is passed around as an ISO `YYYY-MM-DD`
 * string — that is the only format that sorts correctly as a plain string and
 * survives JSON caching, so parsers convert to it as early as possible and
 * nothing downstream ever handles a raw sheet date again.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { toAsciiDigits } = AUH.text;
  const { DAY_NAMES } = AUH.constants;

  const DAY_NAME_PATTERN = /السبت|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday/gi;

  /** Builds an ISO date string, returning '' when the parts are not a real calendar date. */
  function isoFromParts(y, m, d) {
    const yy = parseInt(y, 10);
    const mm = parseInt(m, 10);
    const dd = parseInt(d, 10);
    if (!yy || !mm || !dd) return '';
    const dt = new Date(yy, mm - 1, dd);
    if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return '';
    return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  /** gviz JSON serializes dates as `Date(2026,7,13)` (month is 0-based). */
  function parseGvizDate(value) {
    const m = String(value || '').match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/i);
    return m ? isoFromParts(m[1], parseInt(m[2], 10) + 1, m[3]) : '';
  }

  /**
   * Pulls an ISO date out of a messy cell: Arabic-Indic digits, an Arabic day
   * name in front, and `/`, `-`, `.` or `\` separators are all accepted.
   * Returns null when nothing date-like is found.
   */
  function extractDate(t) {
    if (!t) return null;

    const gviz = parseGvizDate(t);
    if (gviz) return gviz;

    let c = String(t).replace(DAY_NAME_PATTERN, '');
    c = toAsciiDigits(c);

    let m = c.match(/(\d{4})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

    m = c.match(/(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

    m = c.match(/(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{2})\b/);
    if (m) {
      const y = parseInt(m[3], 10) < 50 ? '20' + m[3] : '19' + m[3];
      return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }

    return null;
  }

  /** Arabic weekday name for an ISO date ('' when unparsable). */
  function getDayName(iso) {
    const dt = new Date(iso + 'T00:00:00');
    return isNaN(dt.getTime()) ? '' : DAY_NAMES[dt.getDay()];
  }

  /** 0 = Sunday … 6 = Saturday, or -1 when unparsable. */
  function getDayIndex(iso) {
    const dt = new Date(iso + 'T00:00:00');
    return isNaN(dt.getTime()) ? -1 : dt.getDay();
  }

  /** The weekend here is Friday + Saturday. */
  function isWeekend(iso) {
    const i = getDayIndex(iso);
    return i === 5 || i === 6;
  }

  /** Whole days between an ISO date and today (0 for future dates, null when unparsable). */
  function daysSinceDate(iso) {
    if (!iso) return null;
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = today.getTime() - d.getTime();
    return diff >= 0 ? Math.floor(diff / 86400000) : 0;
  }

  /** A Date → `YYYY-MM-DD`. */
  function toIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  /** Today as `YYYY-MM-DD`, in the visitor's own timezone. */
  function todayIso() {
    return toIso(new Date());
  }

  /** `YYYY-MM-DD` → `YYYY-MM`. */
  function monthKey(iso) {
    return String(iso || '').slice(0, 7);
  }

  /**
   * Formats a sheet date for display as `DD/MM/YYYY`.
   * Keeps the two transports consistent: CSV hands us `28/06/2026` while gviz
   * JSON hands us an ISO date, and both must look the same on screen.
   * Anything that is not a date is returned untouched.
   */
  function formatDisplayDate(value) {
    const raw = String(value === null || value === undefined ? '' : value).trim();
    if (!raw) return '';
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : parseGvizDate(raw);
    if (!iso) return raw;
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  /** Human timestamp used on exported images. */
  function nowStamp() {
    const now = new Date();
    const time = [now.getHours(), now.getMinutes(), now.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
    return `${toIso(now)} ${time}`;
  }

  AUH.dates = {
    formatDisplayDate,
    isoFromParts,
    parseGvizDate,
    extractDate,
    getDayName,
    getDayIndex,
    isWeekend,
    daysSinceDate,
    toIso,
    todayIso,
    monthKey,
    nowStamp
  };
})(typeof window !== 'undefined' ? window : globalThis);

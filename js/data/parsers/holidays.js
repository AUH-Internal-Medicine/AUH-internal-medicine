/**
 * Official holidays (العطل الرسمية).
 *
 * A tiny two-column tab — date + name — that carries real weight: every date
 * listed here becomes a holiday everywhere in the app, exactly like a Friday or
 * a Saturday. That means holiday duty times and durations (so the computed
 * hours change), the holiday counter in the statistics, the red styling in both
 * calendars, and the named badge in the day view.
 *
 * Adding a holiday is therefore a sheet edit, never a code change.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { extractDate, getDayName } = AUH.dates;
  const { monthKey } = AUH.dates;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  function parseHolidays(table, options) {
    const source = AUH.data.schema.holidays;
    const rows = Array.isArray(table) ? table : [];
    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);

    const list = [];
    const byDate = new Map();
    const skipped = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const rawDate = get(row, 'date');
      const name = get(row, 'name');
      if (!rawDate && !name) continue;

      const date = extractDate(rawDate);
      if (!date) {
        skipped.push(rawDate || '(فارغ)');
        continue;
      }
      if (byDate.has(date)) continue; // first entry wins

      const entry = { date, name: name || 'عطلة رسمية', day: getDayName(date) };
      list.push(entry);
      byDate.set(date, entry);
    }

    list.sort((a, b) => a.date.localeCompare(b.date));

    const model = {
      key: 'holidays',
      list,
      byDate,
      /** Just the dates — merged into the app's holiday set. */
      dates: new Set(byDate.keys()),
      issues: resolution.issues,

      /** True for a date listed in the sheet (weekends are handled elsewhere). */
      isOfficialHoliday(date) {
        return byDate.has(date);
      },

      /** The holiday's name, or '' when the date is not an official holiday. */
      nameFor(date) {
        const entry = byDate.get(date);
        return entry ? entry.name : '';
      },

      /** Every holiday inside a `YYYY-MM` month, in date order. */
      inMonth(key) {
        return list.filter(h => monthKey(h.date) === key);
      },

      /** Holidays from `fromDate` onwards (today by default). */
      upcoming(fromDate, limit) {
        const from = fromDate || '';
        const out = list.filter(h => h.date >= from);
        return typeof limit === 'number' ? out.slice(0, limit) : out;
      }
    };

    if (!(options && options.quiet)) {
      headersApi.logResolution(source, resolution);
      log.debug('holidays', `${list.length} عطلة رسمية`);
      if (skipped.length) log.warn('holidays', 'تواريخ عطل غير مقروءة تم تجاهلها:', skipped);
    }

    return model;
  }

  function emptyHolidays() {
    return parseHolidays([[]], { quiet: true });
  }

  AUH.parse.holidays = parseHolidays;
  AUH.parse.emptyHolidays = emptyHolidays;
})(typeof window !== 'undefined' ? window : globalThis);

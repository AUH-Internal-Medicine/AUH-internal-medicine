/**
 * Residents roster parser (لائحة المقيمين).
 *
 * Produces one normalized record per resident plus a small model object that
 * answers every roster/rotation question the views need, so no view ever has to
 * touch a raw row or a column index again.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, exactNameMatch, smartSearch, safeNum } = AUH.text;
  const { isJoined } = AUH.status;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  const UNSPECIFIED = 'غير محدد';

  /**
   * @param {Array<Array<string>>} table raw `[headerRow, ...rows]`
   * @returns {object} residents model
   */
  const AR_MONTH_NUM = {
    'كانون الثاني': 1, 'شباط': 2, 'آذار': 3, 'نيسان': 4, 'أيار': 5, 'حزيران': 6,
    'تموز': 7, 'آب': 8, 'أيلول': 9, 'تشرين الأول': 10, 'تشرين الثاني': 11, 'كانون الأول': 12
  };

  function parseResidents(table, options) {
    const opts = options || {};
    const source = AUH.data.schema[opts.schemaKey || 'residents'];
    const rows = Array.isArray(table) ? table : [];
    const headerRow = rows[0] || [];
    const resolution = headersApi.resolveColumns(headerRow, source);
    const get = headersApi.createAccessor(resolution.map);

    const shiftMonths = resolution.patterns.shiftByMonth || [];
    const oncallMonths = resolution.patterns.oncallsByMonth || [];
    const namedMonths = (resolution.patterns.oncallsByMonthName || []).map(m => ({
      col: m.col, month: AR_MONTH_NUM[(m.monthName || '').trim()] || 0
    })).filter(m => m.month);
    const skipNames = (source.skipNameValues || []).map(normAr);

    const residents = [];
    const dataRows = rows.slice(1);

    dataRows.forEach((row, i) => {
      if (!row || !row.length) return;
      const name = get(row, 'name');
      if (!name || skipNames.includes(normAr(name))) return;

      const shifts = {};
      shiftMonths.forEach(m => {
        const v = (row[m.col] || '').trim();
        if (v) shifts[m.month] = v;
      });

      const oncallCounts = {};
      oncallMonths.forEach(m => {
        const v = (row[m.col] || '').trim();
        if (v) oncallCounts[m.month] = safeNum(v);
      });
      // Second-year sheets label the columns "تموز 2025" instead of "مناوبات شهر 7".
      namedMonths.forEach(m => {
        const v = (row[m.col] || '').trim();
        if (v) oncallCounts[m.month] = safeNum(v);
      });

      // The sheet's own "ت" column restarts its numbering for each intake batch,
      // so the displayed sequence is a running 1-based index over the roster and
      // the sheet's value is kept alongside it for reference.
      residents.push({
        seq: residents.length + 1,
        sheetSeq: get(row, 'seq'),
        name,
        abbr: get(row, 'abbr'),
        spec: get(row, 'spec'),
        phone: get(row, 'phone'),
        gender: get(row, 'gender'),
        join: get(row, 'join'),
        st: get(row, 'status'),
        university: get(row, 'university'),
        detachDate: get(row, 'detachDate'),
        detachReason: get(row, 'detachReason'),
        shifts,
        oncallCounts,
        year: opts.year || 1,
        rowIndex: i + 1,
        row
      });
    });

    const model = {
      key: 'residents',
      raw: rows,
      headers: resolution.headers,
      columns: resolution.map,
      columnDetail: resolution.columns,
      issues: resolution.issues,
      unknownHeaders: resolution.unknownHeaders,
      residents,
      shiftMonths,
      oncallMonths,
      get,

      /** The shift value for a given resident + month ('' when unassigned). */
      getShift(resident, month) {
        if (!resident) return '';
        const v = (resident.shifts || {})[month] || '';
        return v === UNSPECIFIED ? '' : v;
      },

      /** All discovered "فرز شهر N" months, ascending. */
      getShiftMonths() {
        return shiftMonths.slice();
      },

      /** True when at least one resident has a real (non-placeholder) value that month. */
      hasShiftDataForMonth(month) {
        if (!shiftMonths.some(m => m.month === month)) return false;
        if (this.isFutureMonthAutoCopy(month)) return false;
        return residents.some(r => {
          const v = (r.shifts || {})[month];
          return v && v !== UNSPECIFIED;
        });
      },

      /**
       * Detects a future month whose column is just a copy of the previous month
       * (staff duplicate the column before actually planning it). Such a month is
       * treated as "no data yet" so the UI does not present a fake rotation.
       */
      isFutureMonthAutoCopy(month, currentMonth) {
        const current = Number.isInteger(currentMonth) ? currentMonth : new Date().getMonth() + 1;
        if (month <= current) return false;
        const prev = month === 1 ? 12 : month - 1;
        if (!shiftMonths.some(m => m.month === month) || !shiftMonths.some(m => m.month === prev)) return false;

        let compared = 0;
        let same = 0;
        let hasMeaningful = false;

        for (const r of residents) {
          if (!isJoined(r.st)) continue;
          const cur = (r.shifts || {})[month] || '';
          const prv = (r.shifts || {})[prev] || '';
          if (!cur && !prv) continue;
          if (cur && cur !== UNSPECIFIED) hasMeaningful = true;
          compared++;
          if (cur === prv) same++;
        }

        return hasMeaningful && compared >= 10 && same === compared;
      },

      /**
       * Which month the shift views should show by default: next month when it is
       * already published, otherwise the current month, otherwise the latest
       * month that has data.
       */
      getPreferredShiftMonth(currentMonth) {
        const current = Number.isInteger(currentMonth) ? currentMonth : new Date().getMonth() + 1;
        if (!shiftMonths.length) return current;

        const next = current === 12 ? 1 : current + 1;
        if (this.hasShiftDataForMonth(next)) return next;
        if (this.hasShiftDataForMonth(current)) return current;

        const withData = shiftMonths.filter(m => this.hasShiftDataForMonth(m.month));
        if (withData.length) return withData[withData.length - 1].month;

        return shiftMonths[shiftMonths.length - 1].month;
      },

      /** Rotations actually done so far — every month up to `upToMonth` with a value. */
      getRotationsSoFar(resident, upToMonth) {
        if (!resident) return [];
        const limit = Number.isInteger(upToMonth) ? upToMonth : new Date().getMonth() + 1;
        return shiftMonths
          .filter(m => m.month <= limit)
          .map(m => ({ month: m.month, label: m.label, value: (resident.shifts || {})[m.month] || '' }))
          .filter(x => x.value);
      },

      /** Everyone assigned to the same shift that month, grouped by shift name. */
      groupByShift(month, options) {
        const opts = options || {};
        const groups = {};
        for (const r of residents) {
          if (opts.joinedOnly !== false && !isJoined(r.st)) continue;
          const value = (r.shifts || {})[month];
          if (!value || value === UNSPECIFIED) continue;
          (groups[value] = groups[value] || []).push(r);
        }
        return groups;
      },

      /** Exact lookup used to resolve a name/abbreviation coming from another sheet. */
      findByNameOrAbbr(text) {
        if (!text) return null;
        return (
          residents.find(r => exactNameMatch(r.abbr, text)) ||
          residents.find(r => exactNameMatch(r.name, text)) ||
          null
        );
      },

      /** Fuzzy search over name + abbreviation (used by the search boxes). */
      search(term) {
        if (!term) return residents.slice();
        return residents.filter(r => smartSearch(`${r.name} ${r.abbr}`, term));
      }
    };

    if (!(options && options.quiet)) {
      headersApi.logResolution(source, resolution);
      log.debug('parse', `residents: ${residents.length} صف، أشهر الفرز: ${shiftMonths.map(m => m.month).join(', ') || '—'}`);
    }

    return model;
  }

  /** Empty model so the app can render before any data arrives. */
  function emptyResidents() {
    return parseResidents([[]], { quiet: true });
  }

  AUH.parse.residents = parseResidents;
  AUH.parse.emptyResidents = emptyResidents;
})(typeof window !== 'undefined' ? window : globalThis);

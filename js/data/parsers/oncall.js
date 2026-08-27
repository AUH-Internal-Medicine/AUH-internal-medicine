/**
 * On-call schedule parsers (المناوبات).
 *
 * Both years end up in the SAME canonical shape, whatever the sheet looks like:
 *
 *   headers : ['اليوم', 'التاريخ', ...categoryNames]
 *   rows    : [{ date: 'YYYY-MM-DD', day: 'الأحد', row: [day, date, ...cells] }]
 *
 * Category columns are discovered from the header row, not from fixed positions,
 * so inserting/reordering/renaming a duty column in the sheet cannot silently
 * shift everybody's on-calls by one column.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, splitNames, safeNum } = AUH.text;
  const { extractDate, getDayName } = AUH.dates;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  /* ------------------------------------------------------------- canonical model */

  function createModel(key, headers, rows, extras) {
    const categories = headers.slice(2).map(h => String(h || '').trim());
    const byDate = new Map();
    rows.forEach(r => {
      if (!byDate.has(r.date)) byDate.set(r.date, r);
    });

    return Object.assign(
      {
        key,
        headers,
        categories,
        rows,
        byDate,

        /** The parsed row for an ISO date, or null. */
        getRow(dateIso) {
          return byDate.get(dateIso) || null;
        },

        /** Canonical column index of a category name (normalized compare), or -1. */
        getCategoryCol(name) {
          const target = normAr(name || '');
          if (!target) return -1;
          for (let col = 2; col < headers.length; col++) {
            if (normAr(headers[col] || '') === target) return col;
          }
          return -1;
        },

        /** Raw names listed for a date + category. */
        namesFor(dateIso, category) {
          const row = byDate.get(dateIso);
          if (!row) return [];
          const col = this.getCategoryCol(category);
          if (col < 0) return [];
          return splitNames((row.row[col] || '').trim());
        },

        /** `[headers, ...rows]` — used by the "عرض كجدول" raw view. */
        toTable() {
          return [headers, ...rows.map(r => r.row)];
        },

        get length() {
          return rows.length;
        }
      },
      extras || {}
    );
  }

  function emptyOncall(key) {
    return createModel(key || 'oncall', [], [], { issues: [] });
  }

  /* ------------------------------------------------------------------ year one */

  /**
   * Year-1 on-call tab: one header row, a day-name column, a date column, then
   * one column per duty category.
   */
  function parseOncall(table) {
    const source = AUH.data.schema.oncall;
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) return emptyOncall('oncall');

    const headerRow = rows[0] || [];
    const resolution = headersApi.resolveColumns(headerRow, source);
    const dayCol = Number.isInteger(resolution.map.day) ? resolution.map.day : 0;
    const dateCol = Number.isInteger(resolution.map.date) ? resolution.map.date : 1;

    // Everything that is neither the day nor the date column, and has a header,
    // is a duty category.
    const categoryCols = [];
    resolution.headers.forEach((h, i) => {
      if (i === dayCol || i === dateCol || !h) return;
      categoryCols.push({ col: i, name: h });
    });

    const headers = ['اليوم', 'التاريخ', ...categoryCols.map(c => c.name)];
    const parsed = [];
    const skipped = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      // Some copies of the sheet repeat the header as a second row.
      if (normAr(row[dayCol] || '') === normAr('اليوم')) continue;

      const iso = extractDate(row[dateCol] || '') || extractDate(row[dayCol] || '') || '';
      if (!iso) {
        if ((row[dateCol] || row[dayCol] || '').trim()) skipped.push(row[dateCol] || row[dayCol]);
        continue;
      }

      const canonical = [row[dayCol] || getDayName(iso), iso, ...categoryCols.map(c => (row[c.col] || '').trim())];
      parsed.push({ date: iso, day: canonical[0], row: canonical });
    }

    headersApi.logResolution(source, resolution);
    if (skipped.length) log.warn('oncall', 'صفوف بتاريخ غير مقروء تم تجاهلها:', skipped.slice(0, 10));
    log.debug('oncall', `السنة الأولى: ${parsed.length} يوم، ${categoryCols.length} فئة`);

    return createModel('oncall', headers, parsed, { issues: resolution.issues, skippedDates: skipped });
  }

  /* ------------------------------------------------------------------ year two */

  /**
   * Forward-fills merged header cells: a blank cell inherits the nearest earlier
   * non-blank cell in the same row (that is how Sheets/gviz exports a merged range).
   */
  function forwardFill(row, from) {
    const out = [];
    let last = '';
    for (let i = from; i < row.length; i++) {
      const v = String(row[i] || '').trim();
      if (v) last = v;
      out.push(last);
    }
    return out;
  }

  /**
   * Builds one clean category label per data column from the Year-2 sheet's two
   * merged header rows (row 1 = group, row 2 = sub-role, only meaningful inside
   * "الاسعاف"). Kept for sheets still using the two-row layout.
   */
  function buildYear2CategoryLabels(row1, row2) {
    const labels = [];
    let lastGroup = '';
    let lastShift = '';
    const maxLen = Math.max(row1.length, row2.length);

    for (let col = 1; col < maxLen; col++) {
      const g1 = String(row1[col] || '').trim();
      const g2 = String(row2[col] || '').trim();
      if (g1) lastGroup = g1;

      let label;
      if (normAr(lastGroup) === normAr('الاسعاف')) {
        if (g2) {
          if (g2.includes('نهاري')) {
            lastShift = 'نهاري';
            label = g2;
          } else if (g2.includes('ليلي')) {
            lastShift = 'ليلي';
            label = g2;
          } else if (g2 === 'باب' || g2 === 'بارد') {
            label = `اسعاف ${g2} ${lastShift}`;
          } else {
            label = lastGroup;
          }
        } else {
          label = null;
        }
      } else {
        label = lastGroup;
      }
      labels.push(label);
    }

    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === null) labels[i] = i > 0 ? labels[i - 1] : '';
    }
    return labels;
  }

  /**
   * Year-2 on-call tab (a separate spreadsheet, maintained by another team).
   * Column 0 is the date; every other column is one resident slot.
   *
   * The header is EITHER one row of already-repeated labels OR two merged rows
   * (group + sub-role). Which one is detected at runtime by asking whether row 1
   * starts with a date — that is what makes this parser survive the sheet being
   * restructured, as it was in August 2026.
   */
  function parseOncallYear2(table) {
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) {
      log.warn('oncall', 'مناوبات السنة الثانية: لا توجد بيانات كافية');
      return emptyOncall('oncallYear2');
    }

    const secondRowIsData = !!extractDate((rows[1] || [])[0] || '');
    const labels = secondRowIsData
      ? forwardFill(rows[0] || [], 1)
      : buildYear2CategoryLabels(rows[0] || [], rows[1] || []);
    const dataStart = secondRowIsData ? 1 : 2;

    const headers = ['اليوم', 'التاريخ', ...labels.map(l => String(l || '').trim())];
    const parsed = [];
    const skipped = [];

    for (let i = dataStart; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const rawDate = row[0] || '';
      const iso = extractDate(rawDate) || '';
      if (!iso) {
        if (String(rawDate).trim()) skipped.push(rawDate);
        continue;
      }

      const canonical = ['', iso, ...labels.map((_, idx) => String(row[idx + 1] || '').trim())];
      canonical[0] = getDayName(iso);
      parsed.push({ date: iso, day: canonical[0], row: canonical });
    }

    log.debug('oncall', `السنة الثانية: ${parsed.length} يوم (${secondRowIsData ? 'صف عناوين واحد' : 'صفّا عناوين مدمجان'})`);
    if (skipped.length) log.warn('oncall', 'مناوبات السنة الثانية — تواريخ غير مقروءة:', skipped.slice(0, 10));

    return createModel('oncallYear2', headers, parsed, {
      issues: [],
      skippedDates: skipped,
      headerLayout: secondRowIsData ? 'single' : 'merged'
    });
  }

  /* --------------------------------------------------------------- adjustments */

  /**
   * Manual adjustments: per-person hour corrections, volunteer shifts, and
   * bonus hours.
   *
   * Row kinds (see the schema for the exact wording):
   *   'shift' — a real date + a duty category
   *   'bonus' — the date or the category says "Bonus"; hours are credited to the
   *             person without creating an on-call assignment. A bonus row that
   *             still carries a real date belongs to that month; one written as
   *             `Bonus | Bonus` is undated and only affects the totals.
   */
  function parseOncallAdjustments(table) {
    const source = AUH.data.schema.oncallAdjustments;
    const rows = Array.isArray(table) ? table : [];
    if (!rows.length) return { entries: [], bonuses: [], issues: [] };

    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);
    const bonusWords = (source.bonusKeywords || ['bonus']).map(w => normAr(w).toLowerCase());

    const isBonusWord = value => {
      const v = normAr(value || '').toLowerCase();
      return !!v && bonusWords.some(w => v === w || v.includes(w));
    };

    // If the first row is not a header (no recognizable labels), treat it as data.
    const firstIsHeader = normAr((rows[0] || [])[resolution.map.name || 0] || '').includes(normAr('الاسم'));
    const entries = [];
    const bonuses = [];
    const skipped = [];

    for (let i = firstIsHeader ? 1 : 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const name = get(row, 'name');
      const abbr = get(row, 'abbr');
      if (!name && !abbr) continue;

      const rawDate = get(row, 'date');
      const category = get(row, 'category');
      const hoursRaw = get(row, 'hours');
      if (!hoursRaw) {
        skipped.push(row);
        continue;
      }
      const hours = safeNum(hoursRaw);
      const date = extractDate(rawDate) || '';

      if (isBonusWord(category) || isBonusWord(rawDate)) {
        bonuses.push({ kind: 'bonus', name, abbr, date, hours, label: category });
        continue;
      }

      if (!date || !category) {
        skipped.push(row);
        continue;
      }
      entries.push({ kind: 'shift', name, abbr, date, category, hours });
    }

    headersApi.logResolution(source, resolution);
    log.debug('oncall', `تعديلات: ${entries.length} صف مناوبة، ${bonuses.length} صف بونص`);
    if (skipped.length) log.warn('oncall', 'صفوف تعديل غير مقروءة تم تجاهلها:', skipped);

    return { entries, bonuses, issues: resolution.issues, skipped };
  }

  AUH.parse.oncall = parseOncall;
  AUH.parse.oncallYear2 = parseOncallYear2;
  AUH.parse.oncallAdjustments = parseOncallAdjustments;
  AUH.parse.emptyOncall = emptyOncall;
  AUH.parse.buildYear2CategoryLabels = buildYear2CategoryLabels;
})(typeof window !== 'undefined' ? window : globalThis);

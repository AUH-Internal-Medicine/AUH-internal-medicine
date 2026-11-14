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
  const { normAr, splitNames, safeNum, matchesKeyword } = AUH.text;
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

    const merged = applyCategoryMerges(headers, parsed);

    headersApi.logResolution(source, resolution);
    if (skipped.length) log.warn('oncall', 'صفوف بتاريخ غير مقروء تم تجاهلها:', skipped.slice(0, 10));
    log.debug('oncall', `السنة الأولى: ${parsed.length} يوم، ${merged.headers.length - 2} فئة`);

    return createModel('oncall', merged.headers, merged.rows, { issues: resolution.issues, skippedDates: skipped });
  }

  /**
   * تطبيق كلّ قواعد الدمج (`AUH.domain.oncallSchedule.MERGE_RULES`) — عمودان
   * حقيقيان في الشيت يصيران عموداً واحداً من تاريخ الدمج وبعده، **هنا في
   * المُحلِّل لا في كلّ واجهة**: كلُّ ما يقرأ النموذجَ القانونيّ (الواجهات
   * والإحصائيات و«معلوماتي» والتصدير) يرى النتيجةَ نفسَها بلا سطرٍ إضافيّ عنده.
   *
   * كلّ قاعدةٍ تُطبَّق **لكلّ يومٍ على حدة**:
   *   يومٌ قبل تاريخ الدمج → العمودان كما هما، والعمودُ المدموج فارغ
   *   يومٌ من تاريخ الدمج  → العمودُ المدموج فيه الاسمان معاً، والعمودان فارغان
   * فالخلايا الفارغة يتجاهلها كلُّ المستهلكين أصلاً، فيظهر لكلّ يومٍ شكلُه
   * الصحيح دون أن يعرف أحدٌ منهم بالقاعدة.
   *
   * ولو غاب أحدُ عمودَي قاعدةٍ عن الشيت لا يحدث شيء لتلك القاعدة بعينها —
   * تُعاد المدخلاتُ كما جاءت وتُكمَل بقيّةُ القواعد.
   */
  function applyCategoryMerges(headers, rows) {
    const rules = AUH.domain && AUH.domain.oncallSchedule;
    const mergeRules = (rules && rules.MERGE_RULES) || [];

    let curHeaders = headers;
    let curRows = rows;

    mergeRules.forEach(rule => {
      const partCols = rule.parts
        .map(name => curHeaders.findIndex((h, i) => i >= 2 && normAr(h || '') === normAr(name)))
        .filter(i => i >= 0);
      if (partCols.length < 2) return;

      const at = Math.max.apply(null, partCols) + 1;   // بعد آخر عمودٍ من عائلته
      const newHeaders = curHeaders.slice();
      newHeaders.splice(at, 0, rule.merged);

      let mergedDays = 0;
      const newRows = curRows.map(r => {
        const cells = r.row.slice();
        let mergedCell = '';

        let halves = null;
        if (r.date >= rule.mergeDate) {
          const names = [];
          const parts = [];
          partCols.forEach(c => {
            const own = [];
            splitNames(cells[c] || '').forEach(nm => {
              own.push(nm);
              if (!names.some(x => normAr(x) === normAr(nm))) names.push(nm);
            });
            if (own.length) parts.push({ label: curHeaders[c], names: own });
          });
          if (names.length) {
            mergedCell = names.join('\n');
            partCols.forEach(c => { cells[c] = ''; });
            // الأنصاف تُحفظ مع اليوم: المناوبةُ واحدةٌ الآن، لكنّ الشهرَ
            // الانتقاليّ (إن وُجد) يحتاج أن يُظهر داخل البطاقة من كان في أيّ نصف.
            if (parts.length > 1) halves = parts;
            mergedDays++;
          }
        }

        cells.splice(at, 0, mergedCell);
        const out = { date: r.date, day: r.day, row: cells };
        if (halves) {
          out.mergeHalves = r.mergeHalves || {};
          out.mergeHalves[rule.key] = halves;
        } else if (r.mergeHalves) {
          out.mergeHalves = r.mergeHalves;
        }
        return out;
      });

      log.debug('oncall', `${rule.merged}: دُمج في ${mergedDays} يوماً من ${rule.mergeDate}`);
      curHeaders = newHeaders;
      curRows = newRows;
    });

    return { headers: curHeaders, rows: curRows };
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
   * Bonus/penalty shift adjustments (see schema.js for the full rule). Every
   * row becomes exactly one of:
   *   'penalty' — type cell matches a penalty keyword → −1 shift
   *   'bonus'   — anything else (explicit "Bonus", blank, any other text)
   * A bonus row with both `date` and `realCategory` filled gets resolved
   * against the resident's actual schedule in computeDoctorStats: missing
   * there → counted as a real, full duty (a volunteer shift); already there
   * → the old flat +1 (an hours-only correction). Without those two fields
   * it's a traditional flat +1/−1, and `hours` only matters for the holiday
   * flag (exactly 24 ⇒ holiday shift).
   */
  function parseOncallAdjustments(table) {
    const source = AUH.data.schema.oncallAdjustments;
    const rows = Array.isArray(table) ? table : [];
    if (!rows.length) return { bonuses: [], penalties: [], issues: [] };

    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);
    const penaltyWords = source.penaltyKeywords || ['عقوبة'];
    // عقوبةٌ فقط تحتاج كلمةً صريحة — كل ما عداها (Bonus، فارغ، أي نصٍّ آخر) بونص.
    const isPenaltyWord = value => matchesKeyword(value, penaltyWords);

    // If the first row is not a header (no recognizable labels), treat it as data.
    const firstIsHeader = normAr((rows[0] || [])[resolution.map.name || 0] || '').includes(normAr('الاسم'));
    const bonuses = [];
    const penalties = [];
    const skipped = [];

    for (let i = firstIsHeader ? 1 : 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const name = get(row, 'name');
      const abbr = get(row, 'abbr');
      if (!name && !abbr) continue;

      const category = get(row, 'category');
      const realCategory = (get(row, 'realCategory') || '').trim();
      const date = (get(row, 'date') || '').trim();
      const hoursRaw = get(row, 'hours');
      const notes = (get(row, 'notes') || '').trim();

      // صفٌّ بفئةٍ حقيقية وتاريخٍ لا يحتاج عدد ساعات — المُحدِّد هناك هو
      // وجود المناوبة في جدول الطبيب من عدمه، لا قيمة ٢٤ الخاصّة بالبونص التقليدي.
      if (!hoursRaw && !(realCategory && date)) {
        skipped.push(row);
        continue;
      }
      const hours = safeNum(hoursRaw);
      const isHoliday = hours === 24;

      if (isPenaltyWord(category)) {
        penalties.push({ name, abbr, isHoliday, notes });
      } else {
        bonuses.push({ name, abbr, isHoliday, date, realCategory, notes });
      }
    }

    headersApi.logResolution(source, resolution);
    log.debug('oncall', `تعديلات: ${bonuses.length} بونص، ${penalties.length} عقوبة`);
    if (skipped.length) log.warn('oncall', 'صفوف تعديل غير مقروءة تم تجاهلها (لا Bonus ولا عقوبة، أو بلا عدد ساعات):', skipped);

    return { bonuses, penalties, issues: resolution.issues, skipped };
  }

  AUH.parse.oncall = parseOncall;
  AUH.parse.oncallYear2 = parseOncallYear2;
  AUH.parse.oncallAdjustments = parseOncallAdjustments;
  AUH.parse.emptyOncall = emptyOncall;
  AUH.parse.buildYear2CategoryLabels = buildYear2CategoryLabels;
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Annual evaluation parser (التقييم السنوي).
 *
 * Two things used to go wrong here and both are fixed by parsing properly
 * instead of reading fixed row/column positions:
 *
 *  1. Data used to be read starting at row index 3, which silently dropped the
 *     first resident whenever the sheet had only one intro row above the data.
 *     Rows are now identified by content (a real name, not the "مثال توضيحي"
 *     demo row and not the trailing totals row).
 *
 *  2. "الثناءات" is a COUNT in the sheet today (2, 5, …), but the old code only
 *     counted line breaks, so every praised resident scored 1 in the statistics
 *     tab while the evaluation tab showed the real number. The cell is now read
 *     as a number when it is one, and as a line-per-entry list otherwise.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, isNumeric, safeNum, exactNameMatch, tokenSetMatch, smartSearch } = AUH.text;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  /**
   * Counts entries in a praise/penalty cell.
   * "3" → 3 · "" or "-" → 0 · a multi-line note → one per line.
   */
  function countEntries(cell) {
    const s = String(cell === null || cell === undefined ? '' : cell).trim();
    if (!s || s === '-') return 0;
    if (isNumeric(s)) {
      const n = safeNum(s);
      return n > 0 ? Math.round(n) : 0;
    }
    const lines = s
      .split(/\r?\n+/)
      .map(x => x.trim())
      .filter(Boolean);
    return lines.length || 1;
  }

  function parseEvaluation(table, options) {
    const source = AUH.data.schema.evaluation;
    const rows = Array.isArray(table) ? table : [];
    const headerRow = rows[0] || [];
    const resolution = headersApi.resolveColumns(headerRow, source);
    const get = headersApi.createAccessor(resolution.map);

    const claimed = Object.values(resolution.map).filter(Number.isInteger);
    const skills = headersApi.resolveList(headerRow, source.skills, { claimed });
    const exampleNames = (source.exampleNameValues || []).map(normAr);

    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;

      const name = get(row, 'name');
      // No name → header continuation or the trailing totals row.
      if (!name) continue;
      if (normAr(name) === normAr('الاسم') || normAr(name) === normAr('الاسم الثلاثي')) continue;

      const praiseRaw = get(row, 'praise');
      const penaltyRaw = get(row, 'penalty');

      records.push({
        rowIndex: i,
        seq: get(row, 'seq'),
        name,
        abbr: get(row, 'abbr'),
        spec: get(row, 'spec'),
        isExample: exampleNames.includes(normAr(name)),
        skills: skills.map(s => ({
          key: s.key,
          label: s.label,
          value: s.index >= 0 ? String(row[s.index] || '').trim() : ''
        })),
        total: get(row, 'total'),
        praise: praiseRaw,
        praiseCount: countEntries(praiseRaw),
        penalty: penaltyRaw,
        penaltyCount: countEntries(penaltyRaw)
      });
    }

    const real = records.filter(r => !r.isExample);

    /* Lookup indexes. An abbreviation shared by two people (it happens) is
       excluded from the fast path so nobody inherits someone else's praises. */
    const byAbbr = new Map();
    const duplicateAbbrs = new Set();
    const byName = new Map();

    real.forEach(rec => {
      const a = normAr(rec.abbr);
      if (a) {
        if (byAbbr.has(a)) duplicateAbbrs.add(a);
        else byAbbr.set(a, rec);
      }
      const n = normAr(rec.name);
      if (n && !byName.has(n)) byName.set(n, rec);
    });
    duplicateAbbrs.forEach(a => byAbbr.delete(a));

    const model = {
      key: 'evaluation',
      raw: rows,
      headers: resolution.headers,
      columns: resolution.map,
      skills,
      issues: resolution.issues,
      records,
      /** Real resident rows (the demo row excluded). */
      list: real,
      duplicateAbbrs: Array.from(duplicateAbbrs),

      /**
       * Finds a resident's evaluation row.
       * Full name first (the most reliable key across sheets), then a unique
       * abbreviation, then a token-set fallback for differently ordered names.
       */
      findFor(name, abbr) {
        const byExactName = byName.get(normAr(name));
        if (byExactName) return byExactName;

        const a = normAr(abbr);
        if (a && byAbbr.has(a)) return byAbbr.get(a);

        const nameMatch = real.filter(r => exactNameMatch(r.name, name));
        if (nameMatch.length === 1) return nameMatch[0];

        const fuzzy = real.filter(r => tokenSetMatch(r.name, name));
        if (fuzzy.length === 1) return fuzzy[0];

        // Last resort: every word of the roster name appears in the evaluation
        // name (covers "محمد يمان … دباغ" vs "… محمديمان دباغ"). Only accepted
        // when it points at exactly one row — never "first match wins".
        const loose = real.filter(r => smartSearch(r.name, name));
        if (loose.length === 1) return loose[0];

        return null;
      },

      /** Praise count for a resident (0 when they have no evaluation row). */
      praiseCountFor(name, abbr) {
        const rec = this.findFor(name, abbr);
        return rec ? rec.praiseCount : 0;
      }
    };

    if (!(options && options.quiet)) {
      headersApi.logResolution(source, resolution);
      log.debug('evaluation', `${real.length} صف تقييم، مجموع الثناءات: ${real.reduce((a, r) => a + r.praiseCount, 0)}`);
      if (duplicateAbbrs.size) log.warn('evaluation', 'اختصارات مكررة في شيت التقييم (سيتم المطابقة بالاسم الكامل):', Array.from(duplicateAbbrs));
    }

    return model;
  }

  function emptyEvaluation() {
    return parseEvaluation([[]], { quiet: true });
  }

  AUH.parse.evaluation = parseEvaluation;
  AUH.parse.emptyEvaluation = emptyEvaluation;
  AUH.parse.countEvaluationEntries = countEntries;
})(typeof window !== 'undefined' ? window : globalThis);

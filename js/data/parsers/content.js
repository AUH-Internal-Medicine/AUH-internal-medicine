/**
 * Parsers for the three simple content tabs: links, Q&A and the on-call rules
 * tab (from which only the annual-holiday dates are still read).
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr } = AUH.text;
  const { extractDate } = AUH.dates;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  /* ---------------------------------------------------------------- links */

  function parseLinks(table) {
    const source = AUH.data.schema.links;
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) return { list: [], issues: [] };

    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);

    const list = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.length) continue;
      const name = get(row, 'name');
      if (!name) continue;

      list.push({
        seq: get(row, 'seq'),
        name,
        type: get(row, 'type'),
        purpose: get(row, 'purpose'),
        members: get(row, 'members'),
        url: get(row, 'url')
      });
    }

    headersApi.logResolution(source, resolution);
    return { list, issues: resolution.issues };
  }

  /* ------------------------------------------------------------------ Q&A */

  function parseQA(table) {
    const source = AUH.data.schema.qa;
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) return { list: [], categories: [], issues: [] };

    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);
    const defaultCategory = source.defaultCategory || 'عام';

    const list = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const category = get(row, 'category');
      const question = get(row, 'question');
      const answer = get(row, 'answer');
      if (!question || !answer) continue;
      // Header echoes.
      if (normAr(question) === normAr('السؤال') || normAr(category) === normAr('التصنيف')) continue;

      list.push({ category: category || defaultCategory, question, answer });
    }

    const categories = [...new Set(list.map(x => x.category))].sort();

    headersApi.logResolution(source, resolution);
    return { list, categories, issues: resolution.issues };
  }

  /* ------------------------------------------------------- on-call rules */

  /**
   * Only the "العطل السنوية" section is still used: every row below that label
   * contributes a holiday date from its date column. Duty times/durations are
   * fixed in `domain/oncall-schedule.js`.
   */
  function parseOncallRules(table) {
    const source = AUH.data.schema.oncallRules;
    const rows = Array.isArray(table) ? table : [];
    const section = source.annualHolidaysSection || { label: 'العطل السنوية', dateColumn: 1 };
    const holidays = new Set();

    if (rows.length >= 2) {
      const start = rows.findIndex(r => normAr(((r || [])[0] || '').trim()).includes(normAr(section.label)));
      if (start >= 0) {
        for (let i = start + 1; i < rows.length; i++) {
          const iso = extractDate(((rows[i] || [])[section.dateColumn] || '').trim());
          if (iso) holidays.add(iso);
        }
      }
    }

    log.debug('rules', `عطل سنوية: ${holidays.size}`);
    return { annualHolidays: holidays };
  }

  AUH.parse.links = parseLinks;
  AUH.parse.qa = parseQA;
  AUH.parse.oncallRules = parseOncallRules;
})(typeof window !== 'undefined' ? window : globalThis);

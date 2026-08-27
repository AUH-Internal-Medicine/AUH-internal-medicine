/**
 * On-call adjustments (تعديلات المناوبات).
 *
 * Each row of the adjustments tab is exactly one of two things, decided by
 * whether the person is already listed for that date + category:
 *
 *   override — they ARE on that shift, but their hours differ from the standard
 *              duration (e.g. 3 of 5 people stayed longer)
 *   addition — they are NOT on that shift: a volunteer/extra duty that is
 *              treated everywhere as if it were a real row in the on-call sheet
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, exactNameMatch } = AUH.text;
  const log = AUH.log;

  /** Stable key for an override: date + person + category. */
  function overrideKey(dateIso, abbr, category) {
    return `${dateIso}|${abbr}|${normAr(category)}`;
  }

  /** Is this person already listed in the on-call sheet for that date+category? */
  function isListed(oncall, residents, dateIso, category, abbr) {
    const names = oncall.namesFor(dateIso, category);
    if (!names.length) return false;
    return names.some(n => {
      const resident = residents.findByNameOrAbbr(n);
      return resident ? exactNameMatch(resident.abbr || resident.name, abbr) : normAr(n) === normAr(abbr);
    });
  }

  /**
   * @param {Array} entries parsed shift-adjustment rows
   * @param {object} deps {residents, oncall} models, plus optional `bonuses`
   * @returns {{overrides: Map<string, number>, additions: Array, bonuses: Array}}
   */
  function resolveAdjustments(entries, deps) {
    const overrides = new Map();
    const additions = [];
    const residents = deps.residents;
    const oncall = deps.oncall;

    // Bonus rows carry hours only — they must never become an on-call assignment.
    const bonuses = (deps.bonuses || []).map(bonus => {
      const resident = (bonus.abbr && residents.findByNameOrAbbr(bonus.abbr)) || residents.findByNameOrAbbr(bonus.name);
      return {
        date: bonus.date || '',
        hours: bonus.hours,
        label: bonus.label || 'Bonus',
        name: resident ? resident.name : bonus.name,
        abbr: resident ? resident.abbr || resident.name : bonus.abbr || bonus.name
      };
    });

    (entries || []).forEach(adj => {
      const resident = (adj.abbr && residents.findByNameOrAbbr(adj.abbr)) || residents.findByNameOrAbbr(adj.name);
      const abbr = resident ? resident.abbr || resident.name : adj.abbr || adj.name;
      const name = resident ? resident.name : adj.name;

      if (isListed(oncall, residents, adj.date, adj.category, abbr)) {
        overrides.set(overrideKey(adj.date, abbr, adj.category), adj.hours);
      } else {
        additions.push({ date: adj.date, category: adj.category, name, abbr, hours: adj.hours });
      }
    });

    if ((entries && entries.length) || bonuses.length) {
      log.debug(
        'adjustments',
        `${overrides.size} تعديل ساعات، ${additions.length} مناوبة إضافية/تطوعية، ${bonuses.length} بونص`
      );
    }

    return { overrides, additions, bonuses };
  }

  AUH.domain.adjustments = { resolveAdjustments, overrideKey, isListed };
})(typeof window !== 'undefined' ? window : globalThis);

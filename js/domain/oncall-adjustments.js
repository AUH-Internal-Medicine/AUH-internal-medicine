/**
 * Bonus/penalty shift adjustments (تعديل المناوبات).
 *
 * Each row from the adjustments tab is already classified as a bonus (+1
 * shift) or a penalty (−1 shift) by the parser — this module only resolves
 * the person's canonical name/abbreviation, the way every other sheet does.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;

  function resolvePerson(row, residents) {
    const resident = (row.abbr && residents.findByNameOrAbbr(row.abbr)) || residents.findByNameOrAbbr(row.name);
    return {
      name: resident ? resident.name : row.name,
      abbr: resident ? resident.abbr || resident.name : row.abbr || row.name,
      isHoliday: !!row.isHoliday
    };
  }

  /**
   * @param {object} deps {residents} model, plus `bonuses`/`penalties` rows
   * @returns {{bonuses: Array, penalties: Array}}
   */
  function resolveAdjustments(deps) {
    const residents = deps.residents;
    const bonuses = (deps.bonuses || []).map(row => resolvePerson(row, residents));
    const penalties = (deps.penalties || []).map(row => resolvePerson(row, residents));

    if (bonuses.length || penalties.length) {
      log.debug('adjustments', `${bonuses.length} بونص، ${penalties.length} عقوبة`);
    }

    return { bonuses, penalties };
  }

  AUH.domain.adjustments = { resolveAdjustments };
})(typeof window !== 'undefined' ? window : globalThis);

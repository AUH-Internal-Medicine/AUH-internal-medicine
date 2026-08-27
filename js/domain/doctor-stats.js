/**
 * Doctor statistics — computed by the app, never read from a sheet.
 *
 * One pass over the on-call log, cross-referenced with the roster, produces per
 * resident: shift counts (total / completed / remaining), group breakdown with
 * the exact dates behind each number, holiday and night counts, hours worked and
 * hours planned, plus praise count and rotations done so far.
 *
 * This function is PURE: it takes parsed models and returns a new array. That is
 * what makes it verifiable outside the browser (see tools/verify-data.mjs) and
 * reusable as-is when the data starts coming from a server.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { splitNames, parseDurationHours, exactNameMatch } = AUH.text;
  const { extractDate, daysSinceDate } = AUH.dates;
  const { isJoined } = AUH.status;
  const schedule = AUH.domain.oncallSchedule;
  const { overrideKey } = AUH.domain.adjustments;

  function blankEntry(fields) {
    return Object.assign(
      {
        name: '',
        abbr: '',
        spec: '',
        status: '',
        isDetachedOrNotJoined: false,
        join: '',
        joinDaysSince: null,
        total: 0,
        completed: 0,
        remaining: 0,
        wards: 0,
        icu: 0,
        emergency: 0,
        misc: 0,
        holiday: 0,
        night: 0,
        hoursCompleted: 0,
        hoursTotal: 0,
        // Shift hours on their own, so the card can show "منها بونص".
        hoursShiftsCompleted: 0,
        hoursShiftsTotal: 0,
        bonusHours: 0,
        bonusCompleted: 0,
        bonusByMonth: {},
        bonusEntries: [],
        firstOncall: '',
        lastOncall: '',
        groupDetails: { wards: {}, icu: {}, emergency: {}, misc: {}, other: {} },
        catDates: {},
        praiseCount: 0,
        penaltyCount: 0,
        rotations: [],
        rotationsCount: 0
      },
      fields || {}
    );
  }

  /** Records one on-call assignment on a resident's entry. */
  function addAssignment(entry, assignment) {
    const { date, category, hours, isHoliday, isNight, group, isCompleted } = assignment;

    entry.total++;
    if (isCompleted) entry.completed++;
    else entry.remaining++;

    if (group === 'wards') entry.wards++;
    else if (group === 'icu') entry.icu++;
    else if (group === 'emergency') entry.emergency++;
    else if (group === 'misc') entry.misc++;

    const details = entry.groupDetails[group] || entry.groupDetails.other;
    details[category] = (details[category] || 0) + 1;

    (entry.catDates[category] = entry.catDates[category] || []).push(date);

    if (isHoliday) entry.holiday++;
    if (isNight) entry.night++;

    entry.hoursTotal += hours;
    entry.hoursShiftsTotal += hours;
    if (isCompleted) {
      entry.hoursCompleted += hours;
      entry.hoursShiftsCompleted += hours;
    }

    if (!entry.firstOncall || date < entry.firstOncall) entry.firstOncall = date;
    if (!entry.lastOncall || date > entry.lastOncall) entry.lastOncall = date;
  }

  /**
   * @param {object} ctx
   * @param {object} ctx.residents residents model
   * @param {object} ctx.oncall year-1 on-call model
   * @param {object} ctx.evaluation evaluation model
   * @param {Map} ctx.overrides adjustment hour overrides
   * @param {Array} ctx.additions adjustment volunteer shifts
   * @param {Set} ctx.annualHolidays
   * @param {string} ctx.today ISO date
   * @param {number} ctx.currentMonth 1–12, used for "rotations so far"
   * @returns {Array} one entry per resident
   */
  function computeDoctorStats(ctx) {
    const residents = ctx.residents;
    const oncall = ctx.oncall;
    const evaluation = ctx.evaluation;
    const overrides = ctx.overrides || new Map();
    const additions = ctx.additions || [];
    const holidays = ctx.annualHolidays;
    const today = ctx.today;

    const statsMap = new Map();

    // 1. Everyone on the roster gets an entry, even with zero on-calls.
    (residents.residents || []).forEach(r => {
      if (!r || !r.name) return;
      const rotations = residents.getRotationsSoFar(r, ctx.currentMonth);
      const evalRecord = evaluation && evaluation.findFor ? evaluation.findFor(r.name, r.abbr) : null;

      statsMap.set(r.abbr || r.name, blankEntry({
        name: r.name,
        abbr: r.abbr || '',
        spec: r.spec || '',
        status: r.st || '',
        isDetachedOrNotJoined: r.st ? !isJoined(r.st) : false,
        join: r.join || '',
        joinDaysSince: daysSinceDate(extractDate(r.join)),
        praiseCount: evalRecord ? evalRecord.praiseCount : 0,
        penaltyCount: evalRecord ? evalRecord.penaltyCount : 0,
        rotations,
        rotationsCount: rotations.length
      }));
    });

    // 2. Walk the on-call log: every category column of every day.
    (oncall.rows || []).forEach(dayRow => {
      const date = dayRow.date;
      const isHoliday = schedule.isHolidayDate(date, holidays);
      const isCompleted = date < today;

      for (let col = 2; col < oncall.headers.length; col++) {
        const category = oncall.headers[col] || '';
        const cell = (dayRow.row[col] || '').trim();
        if (!category || !cell) continue;

        const names = splitNames(cell);
        if (!names.length) continue;

        const sched = schedule.getCategorySchedule(category, date, holidays);
        const standardHours = parseDurationHours(sched ? sched.duration : '');
        const isNight = schedule.isNightCategory(category);
        const group = schedule.classifyGroup(category);

        const seen = new Set();
        names.forEach(rawName => {
          const resident = residents.findByNameOrAbbr(rawName);
          const key = resident ? resident.abbr || resident.name : rawName;
          if (seen.has(key)) return; // same person listed twice in one cell
          seen.add(key);

          let entry = statsMap.get(key);
          if (!entry) {
            // Listed in the on-call sheet but missing from the roster (usually an
            // old abbreviation) — still counted, never silently dropped.
            entry = blankEntry({
              name: resident ? resident.name : rawName,
              abbr: resident ? resident.abbr : '',
              spec: resident ? resident.spec : '',
              status: resident ? resident.st : '',
              join: resident ? resident.join : ''
            });
            statsMap.set(key, entry);
          }

          const ok = overrideKey(date, key, category);
          const hours = overrides.has(ok) ? overrides.get(ok) : standardHours;
          addAssignment(entry, { date, category, hours, isHoliday, isNight, group, isCompleted });
        });
      }
    });

    // 3. Volunteer/extra shifts from the adjustments tab.
    additions.forEach(add => {
      const key = add.abbr || add.name;
      let entry = statsMap.get(key);
      if (!entry) {
        entry = blankEntry({ name: add.name, abbr: add.abbr || '' });
        statsMap.set(key, entry);
      }
      addAssignment(entry, {
        date: add.date,
        category: add.category,
        hours: add.hours,
        isHoliday: schedule.isHolidayDate(add.date, holidays),
        isNight: schedule.isNightCategory(add.category),
        group: schedule.classifyGroup(add.category),
        isCompleted: add.date < today
      });
    });

    // 4. Bonus hours: credited to the person without creating an assignment.
    //    An undated bonus counts as already earned; a dated one follows its date.
    (ctx.bonuses || []).forEach(bonus => {
      const key = bonus.abbr || bonus.name;
      let entry = statsMap.get(key);
      if (!entry) {
        entry = blankEntry({ name: bonus.name, abbr: bonus.abbr || '' });
        statsMap.set(key, entry);
      }

      const hours = bonus.hours || 0;
      const earned = !bonus.date || bonus.date <= today;

      entry.bonusHours += hours;
      entry.hoursTotal += hours;
      if (earned) {
        entry.bonusCompleted += hours;
        entry.hoursCompleted += hours;
      }
      if (bonus.date) {
        const month = bonus.date.slice(0, 7);
        entry.bonusByMonth[month] = (entry.bonusByMonth[month] || 0) + hours;
      }
      entry.bonusEntries.push({ date: bonus.date || '', hours, label: bonus.label || 'Bonus' });
    });

    // 5. Ranks by hours (worked, then planned) — bonus included.
    const list = Array.from(statsMap.values());
    list
      .slice()
      .sort((a, b) => b.hoursCompleted - a.hoursCompleted)
      .forEach((e, i) => (e.rankCompleted = i + 1));
    list
      .slice()
      .sort((a, b) => b.hoursTotal - a.hoursTotal)
      .forEach((e, i) => (e.rankTotal = i + 1));

    return list;
  }

  /** Finds a resident's computed entry. */
  function findStatsFor(list, name, abbr) {
    return (
      (list || []).find(x => exactNameMatch(x.name, name) || exactNameMatch(x.abbr, abbr) || exactNameMatch(x.name, abbr)) || null
    );
  }

  AUH.domain.doctorStats = { computeDoctorStats, findStatsFor, blankEntry };
})(typeof window !== 'undefined' ? window : globalThis);

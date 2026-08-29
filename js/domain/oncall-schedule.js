/**
 * On-call duty rules (business logic, not data):
 *   - the fixed duty time/duration tables and the date the system changed
 *   - what counts as a holiday
 *   - which "group" (أجنحة / عنايات / اسعاف / منوع) a category belongs to
 *   - the best-effort Year-1 ↔ Year-2 category correspondence
 *
 * These are fixed in code on purpose: they change once a year at most, and
 * reading them from a sheet proved less reliable than editing them here.
 * To change a duty time or duration, edit the tables below.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr } = AUH.text;
  const { isWeekend } = AUH.dates;

  /**
   * Duty genuinely changed from partial (جزئية) to full (كاملة) shifts on this
   * date. On-call days BEFORE it use the OLD table, days on/after it use the NEW
   * one — compared per on-call day, never against "today".
   */
  const SWITCH_DATE = '2026-07-23';

  const ONCALL_SCHEDULE_OLD = {
    'عناية قلبية':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'عناية مركز':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'عناية داخلية':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'سابع':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'رابع':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'تالت':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'تاني':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'خارجيات':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'ديال':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'أورام':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'إسعاف مركز صباحي':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'إسعاف مركز ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'},
    'اسعاف بارد صباحي':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'اسعاف بارد ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'},
    'إسعاف باب نهاري':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'اسعاف باب ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'},
    'اسعاف داخلي نهاري':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
    'اسعاف داخلي ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'}
  };

  const ONCALL_SCHEDULE_NEW = {
    'عناية قلبية':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'عناية مركز':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'عناية داخلية':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'سابع':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'رابع':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'تالت':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'تاني':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'خارجيات':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'ديال':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'أورام':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
    'إسعاف مركز صباحي':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
    'إسعاف مركز ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'},
    'اسعاف بارد صباحي':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
    'اسعاف بارد ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'},
    'إسعاف باب نهاري':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
    'اسعاف باب ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'},
    // Added 2026-08-29: two new emergency duties, same hours as the باب pair.
    'اسعاف داخلي نهاري':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
    'اسعاف داخلي ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'}
  };

  /**
   * Best-effort correspondence between a Year-1 category and its Year-2
   * equivalent(s) — used only to show "زملاء السنة الثانية" in معلوماتي.
   * The two schedules do not track duty identically, so categories with no clear
   * equivalent are simply omitted rather than guessed. Comparison is
   * Arabic-normalized, so "الديال" matches "ديال" automatically.
   */
  const YEAR2_CATEGORY_MAP = {
    'سابع': ['جناح السابع'],
    'رابع': ['جناح الرابع'],
    'تالت': ['ثالث خاص + خارجيات'],
    'خارجيات': ['ثالث خاص + خارجيات'],
    'تاني': ['ثاني رجال'],
    'ديال': ['الديال', 'ديال'],
    'عناية قلبية': ['عناية قلبية'],
    'عناية مركز': ['عناية المركز'],
    'عناية داخلية': ['عناية داخلية'],
    'إسعاف مركز صباحي': ['اسعاف مركز', 'اسعاف نهاري'],
    'إسعاف مركز ليلي': ['اسعاف مركز', 'اسعاف ليلي'],
    'اسعاف بارد صباحي': ['اسعاف بارد نهاري', 'بارد نهاري'],
    'اسعاف بارد ليلي': ['اسعاف بارد ليلي', 'بارد ليلي'],
    'إسعاف باب نهاري': ['اسعاف باب نهاري', 'باب نهاري'],
    'إسعاف باب ليلي': ['اسعاف باب ليلي', 'باب ليلي']
  };

  /** Group labels used across the statistics UI. */
  const GROUPS = {
    wards: { key: 'wards', label: 'أجنحة', icon: 'fa-bed' },
    icu: { key: 'icu', label: 'عنايات', icon: 'fa-heart-pulse' },
    emergency: { key: 'emergency', label: 'اسعاف', icon: 'fa-truck-medical' },
    misc: { key: 'misc', label: 'منوع', icon: 'fa-shapes' },
    other: { key: 'other', label: 'أخرى', icon: 'fa-circle-question' }
  };

  const WARD_NAMES = ['تاني', 'ثاني', 'تالت', 'ثالث', 'رابع', 'خارجيات', 'سابع'];
  const MISC_NAMES = ['اورام', 'أورام', 'ديال'];

  /** Buckets an on-call category name into one of the four display groups. */
  function classifyGroup(category) {
    const n = normAr(category || '');
    if (!n) return 'other';
    if (n.startsWith(normAr('اسعاف')) || n.startsWith(normAr('إسعاف'))) return 'emergency';
    if (n.includes(normAr('عناية'))) return 'icu';
    if (MISC_NAMES.some(x => n === normAr(x))) return 'misc';
    if (WARD_NAMES.some(x => n === normAr(x))) return 'wards';
    return 'other';
  }

  /** True when a category is a night shift (its own duty times and counter). */
  function isNightCategory(category) {
    return normAr(category || '').includes(normAr('ليلي'));
  }

  /**
   * Holiday = Friday/Saturday, or a date listed under "العطل السنوية" in the
   * rules tab.
   * @param {string} dateIso
   * @param {Set<string>} annualHolidays
   */
  function isHolidayDate(dateIso, annualHolidays) {
    if (!dateIso) return false;
    if (isWeekend(dateIso)) return true;
    return !!(annualHolidays && annualHolidays.has(dateIso));
  }

  /**
   * Duty time + duration for a category on a specific day.
   * @returns {{isHoliday:boolean, time:string, duration:string}|null}
   */
  function getCategorySchedule(category, dateIso, annualHolidays) {
    const table = dateIso && dateIso >= SWITCH_DATE ? ONCALL_SCHEDULE_NEW : ONCALL_SCHEDULE_OLD;
    const target = normAr(category || '');

    let cfg = null;
    const exactKey = Object.keys(table).find(k => normAr(k) === target);
    if (exactKey) cfg = table[exactKey];

    // Unknown emergency sub-type → fall back to any emergency row so the card
    // still shows a plausible duty time instead of nothing.
    if (!cfg && (target.startsWith(normAr('إسعاف')) || target.startsWith(normAr('اسعاف')))) {
      const fallbackKey = Object.keys(table).find(k => {
        const n = normAr(k);
        return n.startsWith(normAr('إسعاف')) || n.startsWith(normAr('اسعاف'));
      });
      if (fallbackKey) cfg = table[fallbackKey];
    }
    if (!cfg) return null;

    const holiday = isHolidayDate(dateIso, annualHolidays);
    return {
      isHoliday: holiday,
      time: holiday ? cfg.holidayTime : cfg.workTime,
      duration: holiday ? cfg.holidayDuration : cfg.workDuration
    };
  }

  /** Year-2 category names that correspond to a Year-1 category. */
  function year2CategoriesFor(year1Category) {
    const target = normAr(year1Category || '');
    const key = Object.keys(YEAR2_CATEGORY_MAP).find(k => normAr(k) === target);
    return key ? YEAR2_CATEGORY_MAP[key] : [];
  }

  AUH.domain.oncallSchedule = {
    SWITCH_DATE,
    ONCALL_SCHEDULE_OLD,
    ONCALL_SCHEDULE_NEW,
    YEAR2_CATEGORY_MAP,
    GROUPS,
    classifyGroup,
    isNightCategory,
    isHolidayDate,
    getCategorySchedule,
    year2CategoriesFor
  };
})(typeof window !== 'undefined' ? window : globalThis);

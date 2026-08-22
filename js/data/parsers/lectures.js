/**
 * Lectures & activities calendar parser (رزنامة المحاضرات والأنشطة الطبية).
 *
 * Dates in this sheet have been typed in every imaginable style, so
 * `parseLectureDate` accepts ISO, `DD/MM/YYYY`, `MM/DD/YYYY`, Arabic/English
 * month names and gviz `Date(y,m,d)` values, and gives up (skipping the row)
 * rather than inventing a date.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, toAsciiDigits } = AUH.text;
  const { extractDate, isoFromParts, parseGvizDate } = AUH.dates;
  const headersApi = AUH.data.headers;
  const log = AUH.log;

  const MONTH_WORDS = {
    'كانون الثاني': 1, يناير: 1, january: 1, jan: 1,
    شباط: 2, فبراير: 2, february: 2, feb: 2,
    اذار: 3, آذار: 3, مارس: 3, march: 3, mar: 3,
    نيسان: 4, ابريل: 4, أبريل: 4, april: 4, apr: 4,
    ايار: 5, أيار: 5, مايو: 5, may: 5,
    حزيران: 6, يونيو: 6, june: 6, jun: 6,
    تموز: 7, يوليو: 7, july: 7, jul: 7,
    اب: 8, آب: 8, اغسطس: 8, أغسطس: 8, august: 8, aug: 8,
    ايلول: 9, أيلول: 9, سبتمبر: 9, september: 9, sep: 9, sept: 9,
    'تشرين الاول': 10, 'تشرين الأول': 10, تشرين: 10, اكتوبر: 10, أكتوبر: 10, october: 10, oct: 10,
    'تشرين الثاني': 11, نوفمبر: 11, november: 11, nov: 11,
    'كانون الاول': 12, 'كانون الأول': 12, ديسمبر: 12, december: 12, dec: 12
  };

  const DAY_WORDS = /السبت|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday/gi;

  /** Best-effort date parsing for a lecture row. Returns '' when unparsable. */
  function parseLectureDate(value) {
    const src = toAsciiDigits(value || '').trim();
    if (!src) return '';

    const gviz = parseGvizDate(src);
    if (gviz) return gviz;

    const ymd = src.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (ymd) {
      const iso = isoFromParts(ymd[1], ymd[2], ymd[3]);
      if (iso) return iso;
    }

    const extracted = extractDate(src);
    if (extracted) return extracted;

    const clean = src
      .replace(/[,،]/g, ' ')
      .replace(DAY_WORDS, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // "12 تموز 2026" style values.
    const normalizedText = normAr(clean).toLowerCase();
    let month = 0;
    for (const [word, m] of Object.entries(MONTH_WORDS)) {
      if (normalizedText.includes(normAr(word).toLowerCase())) {
        month = m;
        break;
      }
    }

    const numbers = clean.match(/\d+/g) || [];
    if (month) {
      const yearRaw = numbers.find(n => n.length === 4) || numbers.find(n => parseInt(n, 10) > 31);
      let year = yearRaw ? parseInt(yearRaw, 10) : NaN;
      if (!Number.isFinite(year)) {
        const short = numbers.find(n => n.length <= 2);
        if (short) year = parseInt(short, 10) + 2000;
      }
      const day = numbers
        .map(n => parseInt(n, 10))
        .filter(n => n >= 1 && n <= 31)
        .find(n => n !== year && n !== year - 2000);

      if (Number.isFinite(year) && day) {
        const iso = isoFromParts(year, month, day);
        if (iso) return iso;
      }
    }

    if (numbers.length < 3) return '';

    const a = parseInt(numbers[0], 10);
    const b = parseInt(numbers[1], 10);
    const c = parseInt(numbers[2], 10);
    if (!a || !b || !c) return '';

    if (a > 999) {
      const iso = isoFromParts(a, b, c);
      if (iso) return iso;
    }

    let year = c;
    if (year < 100) year += year < 50 ? 2000 : 1900;

    // Day-first unless that is impossible (e.g. 5/20/2026).
    let day = a;
    let month2 = b;
    if (a <= 12 && b > 12) {
      month2 = a;
      day = b;
    }
    return isoFromParts(year, month2, day);
  }

  /** "9:00:00 ص" / "2:30 pm" → minutes since midnight, or null. */
  function parseTimeMinutes(value) {
    const s = toAsciiDigits(value).trim();
    if (!s) return null;
    const ampm = /pm|م\b/i.test(s) ? 'pm' : /am|ص\b/i.test(s) ? 'am' : '';
    const m = s.match(/(\d{1,2})(?:[:٫.](\d{1,2}))?/);
    if (!m) return null;

    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** "8 ساعات" / "45 دقيقة" → minutes (defaults to 60). */
  function parseDurationMinutes(value) {
    const s = toAsciiDigits(value).trim();
    if (!s) return 60;
    const n = parseFloat((s.match(/\d+(?:\.\d+)?/) || [])[0] || '');
    if (Number.isNaN(n)) return 60;
    if (/دقيق/.test(s)) return Math.max(1, Math.round(n));
    return Math.max(1, Math.round(n * 60));
  }

  function parseLectures(table) {
    const source = AUH.data.schema.lectures;
    const rows = Array.isArray(table) ? table : [];
    if (rows.length < 2) return { list: [], issues: [] };

    const resolution = headersApi.resolveColumns(rows[0] || [], source);
    const get = headersApi.createAccessor(resolution.map);

    const list = [];
    const skipped = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const title = get(row, 'title');
      const dateRaw = get(row, 'date');
      if (!title || !dateRaw) continue;

      const dateISO = parseLectureDate(dateRaw);
      if (!dateISO) {
        skipped.push(dateRaw);
        continue;
      }

      const timeRaw = get(row, 'time');
      const startMin = parseTimeMinutes(timeRaw);
      const durationMin = parseDurationMinutes(get(row, 'duration'));

      const startAt =
        startMin === null
          ? new Date(`${dateISO}T00:00:00`)
          : new Date(`${dateISO}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}:00`);
      const endAt = startMin === null ? new Date(`${dateISO}T23:59:59`) : new Date(startAt.getTime() + durationMin * 60000);

      list.push({
        dateRaw,
        dateISO,
        category: get(row, 'category'),
        title,
        content: get(row, 'content'),
        speaker: get(row, 'speaker'),
        speakerBio: get(row, 'speakerBio'),
        place: get(row, 'place'),
        time: timeRaw,
        duration: get(row, 'duration'),
        dept: get(row, 'dept'),
        year: get(row, 'year'),
        supervisor: get(row, 'supervisor'),
        regLink: get(row, 'regLink'),
        annLink: get(row, 'annLink'),
        startAt,
        endAt
      });
    }

    headersApi.logResolution(source, resolution);
    if (skipped.length) log.warn('lectures', 'تواريخ محاضرات غير مقروءة تم تجاهلها:', skipped);
    log.debug('lectures', `${list.length} محاضرة/نشاط`);

    return { list, issues: resolution.issues, skippedDates: skipped };
  }

  AUH.parse.lectures = parseLectures;
  AUH.parse.lectureDate = parseLectureDate;
  AUH.parse.lectureTimeMinutes = parseTimeMinutes;
  AUH.parse.lectureDurationMinutes = parseDurationMinutes;
})(typeof window !== 'undefined' ? window : globalThis);

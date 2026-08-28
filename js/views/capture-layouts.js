/**
 * Print-quality layouts for the PNG exports.
 *
 * These build a **separate**, self-contained DOM tree instead of screenshotting
 * the live card. That is deliberate:
 *
 *   • the on-screen calendar shows coloured dots (compact, tap-friendly), while
 *     the exported one spells out the duty name under each day — two different
 *     jobs, two different layouts;
 *   • every style here is inline, so the export never depends on styles.css,
 *     dark mode, the viewport width, or whatever the visitor had collapsed;
 *   • a fixed page width means text wraps predictably — no overlap, no clipping.
 *
 * Everything returns an HTML string; `views/exports.js` renders it off-screen,
 * rasterizes it and downloads it.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml } = AUH.text;
  const { getDayName } = AUH.dates;
  const AM = AUH.constants.MONTH_NAMES;

  // Same identity as the site: paper, ink, one duty green, one stamp red, ochre
  // for what was earned. Kept literal here because the export must not depend on
  // the visitor's theme.
  const C = {
    ink: '#15181b',
    muted: '#59616b',
    line: '#ddd8cd',
    soft: '#f6f4ef',
    green: '#14563f',
    greenSoft: '#e4efe9',
    greenLine: '#8fbfa9',
    navy: '#14563f',
    gold: '#9a6b15',
    goldSoft: '#f6efdf',
    red: '#a62b22',
    redSoft: '#f7e9e7',
    white: '#ffffff'
  };

  const FONT = "'IBM Plex Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif";
  const CAL_HEADERS = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

  /** `2026-08-22 07:44 PM` — shown at the top of every exported image. */
  function stamp() {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} · ${time}`;
  }

  /**
   * Duty times mix Arabic and English ("2:30 pm حتى 8:30 am", "9 صباحاً حتى 10 ليلاً"),
   * and the bidi algorithm scrambles that inside an RTL card. Both forms are
   * normalized to one clean, purely-LTR range so the exported image always reads
   * left-to-right: `2:30 PM → 8:30 AM`.
   */
  function formatDutyTime(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';

    const toClock = part => {
      const s = String(part).trim();
      const m = s.match(/(\d{1,2})(?::(\d{2}))?/);
      if (!m) return '';
      let hour = parseInt(m[1], 10);
      const minutes = m[2] || '00';

      const isPm = /pm|مساء|ليل|ظهر/i.test(s);
      const isAm = /am|صباح|فجر/i.test(s);
      if (isPm && hour < 12) hour += 12;
      if (isAm && hour === 12) hour = 0;
      // No marker at all: on-call duty starting at 1–11 means the afternoon.
      if (!isPm && !isAm && hour >= 1 && hour <= 11) hour += 12;

      const suffix = hour >= 12 ? 'PM' : 'AM';
      const display = hour % 12 === 0 ? 12 : hour % 12;
      return `${display}:${minutes} ${suffix}`;
    };

    const parts = raw.split(/حتى|الى|إلى|until|to|-|–|—/i).filter(p => /\d/.test(p));
    if (parts.length >= 2) {
      const from = toClock(parts[0]);
      const to = toClock(parts[1]);
      if (from && to) return `${from} → ${to}`;
    }
    const single = toClock(raw);
    return single || raw;
  }

  function monthTitle(monthKey) {
    const [year, month] = String(monthKey || '').split('-');
    const index = Math.max(0, parseInt(month || '1', 10) - 1);
    return `${AM[index] || month || ''} ${year || ''}`.trim();
  }

  /**
   * The page frame: header band (title + subtitle + timestamp) and the body.
   * `width` is the CSS width the capture runs at — the rasterizer multiplies it.
   */
  function buildShell(options) {
    const o = options || {};
    const width = o.width || 900;

    return (
      `<div dir="rtl" style="width:${width}px;box-sizing:border-box;background:${C.white};font-family:${FONT};` +
      `color:${C.ink};padding:0;margin:0;border-radius:18px;overflow:hidden;border:1px solid ${C.line};">` +
        `<div style="background:${C.green};color:#fff;padding:22px 26px;border-bottom:3px solid ${C.gold};">` +
          `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;">` +
            `<div style="min-width:0;">` +
              `<div style="font-size:26px;font-weight:800;line-height:1.35;">${escapeHtml(o.title || '')}</div>` +
              (o.subtitle ? `<div style="font-size:16px;font-weight:600;opacity:.92;margin-top:4px;">${escapeHtml(o.subtitle)}</div>` : '') +
            `</div>` +
            `<div style="text-align:left;flex-shrink:0;">` +
              `<div style="font-size:12px;font-weight:700;opacity:.85;letter-spacing:.4px;">GENERATED</div>` +
              `<div dir="ltr" style="font-size:15px;font-weight:700;margin-top:2px;">${escapeHtml(stamp())}</div>` +
            `</div>` +
          `</div>` +
        `</div>` +
        `<div style="padding:22px 26px 26px;">${o.body || ''}</div>` +
        `<div style="padding:12px 26px 18px;color:${C.muted};font-size:12px;font-weight:600;text-align:center;border-top:1px solid ${C.line};">` +
          `أطباء قسم الداخلية — السنة الأولى · مشفى حلب الجامعي` +
        `</div>` +
      `</div>`
    );
  }

  /**
   * The exported month calendar: an on-call day is a green cell with the duty
   * name spelled out under the date number.
   *
   * @param {object} o
   * @param {string} o.monthKey  'YYYY-MM'
   * @param {Array}  o.oncalls   [{date, cat, schedule}]
   * @param {string} o.today     ISO date, for the "today" ring
   * @param {function} o.isHoliday
   */
  function buildCalendar(o) {
    const monthKey = o.monthKey;
    const [yearStr, monthStr] = String(monthKey).split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const leading = firstDay === 0 ? 6 : firstDay - 1;

    const byDate = {};
    (o.oncalls || []).forEach(item => {
      (byDate[item.date] = byDate[item.date] || []).push(item);
    });

    const cell = (content, style) => `<div style="box-sizing:border-box;${style}">${content}</div>`;

    let html =
      `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">`;

    CAL_HEADERS.forEach((name, i) => {
      const weekend = i === 4 || i === 5;
      html += cell(
        escapeHtml(name),
        `padding:9px 4px;text-align:center;font-size:13px;font-weight:800;border-radius:9px;` +
          `background:${weekend ? C.redSoft : C.soft};color:${weekend ? C.red : C.navy};`
      );
    });

    for (let i = 0; i < leading; i++) html += cell('', 'min-height:86px;');

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const weekday = new Date(year, month, day).getDay();
      const isWeekend = weekday === 5 || weekday === 6;
      const isToday = iso === o.today;
      const isPast = iso < o.today;
      const items = byDate[iso] || [];
      const onCall = items.length > 0;
      const holiday = o.isHoliday ? !!o.isHoliday(iso) : isWeekend;

      const holidayName = o.holidayName ? o.holidayName(iso) : '';

      let background = C.white;
      let border = `1px solid ${C.line}`;
      let numberColor = isWeekend ? C.red : C.ink;

      if (onCall) {
        background = C.greenSoft;
        border = `2px solid ${C.green}`;
        numberColor = C.green;
      } else if (holidayName) {
        background = C.redSoft;
        numberColor = C.red;
      } else if (isWeekend) {
        background = '#fdf7f7';
      }
      if (holidayName) border = `2px solid ${C.red}`;

      const ring = isToday ? `box-shadow:0 0 0 3px rgba(27,58,92,.35);` : '';
      const labels = items
        .map(item => {
          const done = isPast ? '✓ ' : '';
          return (
            `<div style="background:${C.green};color:#fff;border-radius:7px;padding:3px 5px;margin-top:3px;` +
            `font-size:11.5px;font-weight:700;line-height:1.35;word-break:break-word;">${escapeHtml(done + item.cat)}</div>`
          );
        })
        .join('');

      const holidayDot = holiday && onCall && !holidayName ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${C.red};margin-inline-start:4px;vertical-align:middle;"></span>` : '';
      const holidayLabel = holidayName
        ? `<div style="background:${C.red};color:#fff;border-radius:6px;padding:2px 5px;margin-top:3px;font-size:10px;font-weight:800;line-height:1.25;word-break:break-word;">★ ${escapeHtml(holidayName)}</div>`
        : '';

      html += cell(
        `<div style="display:flex;align-items:center;justify-content:space-between;">` +
          `<span style="font-size:17px;font-weight:800;color:${numberColor};">${day}</span>${holidayDot}` +
        `</div>${holidayLabel}${labels}`,
        `min-height:86px;padding:7px 7px 8px;border-radius:11px;background:${background};border:${border};${ring}`
      );
    }

    html += '</div>';

    const legend =
      `<div style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:16px;font-size:12.5px;font-weight:700;color:${C.muted};">` +
        `<span><span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${C.greenSoft};border:2px solid ${C.green};vertical-align:-2px;"></span> يوم مناوبة</span>` +
        `<span><span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${C.redSoft};border:2px solid ${C.red};vertical-align:-2px;"></span> ★ عطلة رسمية</span>` +
        `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${C.red};vertical-align:-1px;"></span> عطلة أسبوعية</span>` +
        `<span>✓ مناوبة تمّت</span>` +
        `<span><span style="display:inline-block;width:12px;height:12px;border-radius:4px;background:#fff;border:1px solid ${C.line};box-shadow:0 0 0 3px rgba(27,58,92,.35);vertical-align:-2px;"></span> اليوم</span>` +
      `</div>`;

    return html + legend;
  }

  /** Compact summary strip: total / done / remaining for the month. */
  function buildSummary(oncalls, today) {
    const total = oncalls.length;
    const done = oncalls.filter(o => o.date < today).length;
    const box = (value, label, color) =>
      `<div style="flex:1;background:${C.soft};border:1px solid ${C.line};border-radius:12px;padding:12px 10px;text-align:center;">` +
        `<div style="font-size:24px;font-weight:800;color:${color};line-height:1.2;">${value}</div>` +
        `<div style="font-size:12.5px;font-weight:700;color:${C.muted};margin-top:2px;">${escapeHtml(label)}</div>` +
      `</div>`;

    return (
      `<div style="display:flex;gap:10px;margin-bottom:16px;">` +
        box(total, 'مناوبات الشهر', C.navy) +
        box(done, 'تمّت', C.green) +
        box(total - done, 'متبقية', C.gold) +
      `</div>`
    );
  }

  /** The detail rows under the calendar: one line per on-call. */
  function buildOncallList(oncalls, options) {
    const o = options || {};
    if (!oncalls.length) {
      return `<div style="padding:18px;text-align:center;color:${C.muted};font-weight:700;">لا توجد مناوبات في هذا الشهر.</div>`;
    }

    const rows = oncalls
      .map(item => {
        const isPast = item.date < o.today;
        const holiday = item.schedule && item.schedule.isHoliday;
        const day = item.day || getDayName(item.date);

        const badges = [];
        if (isPast) badges.push(`<span style="background:${C.greenSoft};color:${C.green};border:1px solid ${C.greenLine};border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:800;">تمّت ✓</span>`);
        const holidayName = o.holidayName ? o.holidayName(item.date) : '';
        if (holiday) badges.push(`<span style="background:${C.redSoft};color:${C.red};border:1px solid #f0b7b1;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:800;">${holidayName ? '★ ' + escapeHtml(holidayName) : 'عطلة'}</span>`);
        if (item.schedule && item.schedule.isVolunteer) badges.push(`<span style="background:${C.goldSoft};color:${C.gold};border:1px solid #e6cd9a;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:800;">تطوعية</span>`);
        else if (item.schedule && item.schedule.isAdjusted) badges.push(`<span style="background:${C.goldSoft};color:${C.gold};border:1px solid #e6cd9a;border-radius:6px;padding:1px 7px;font-size:11.5px;font-weight:800;">ساعات معدّلة</span>`);

        const clock = formatDutyTime(item.schedule && item.schedule.time);
        const time = item.schedule && (clock || item.schedule.duration)
          ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;">` +
            (clock
              ? `<span dir="ltr" style="unicode-bidi:isolate;background:${C.soft};border:1px solid ${C.line};border-radius:7px;` +
                `padding:2px 9px;font-size:12.5px;font-weight:800;color:${C.navy};white-space:nowrap;">🕐 ${escapeHtml(clock)}</span>`
              : '') +
            (item.schedule.duration
              ? `<span style="background:${C.soft};border:1px solid ${C.line};border-radius:7px;padding:2px 9px;` +
                `font-size:12.5px;font-weight:800;color:${C.muted};white-space:nowrap;">⏱ ${escapeHtml(item.schedule.duration)}</span>`
              : '') +
            `</div>`
          : '';

        const colleagues = o.withColleagues && item.colleagues && item.colleagues.length
          ? `<div style="font-size:12.5px;color:${C.ink};margin-top:5px;line-height:1.6;">` +
            `<span style="font-weight:800;color:${C.navy};">الزملاء: </span>` +
            escapeHtml(item.colleagues.map(c => c.name + (c.abbr ? ` (${c.abbr})` : '')).join(' · ')) +
            `</div>`
          : '';

        const year2 = o.withColleagues && item.year2Colleagues && item.year2Colleagues.length
          ? `<div style="font-size:12.5px;color:${C.muted};margin-top:3px;line-height:1.6;">` +
            `<span style="font-weight:800;">السنة الثانية: </span>${escapeHtml(item.year2Colleagues.join(' · '))}</div>`
          : '';

        return (
          `<div style="border:1px solid ${C.line};border-inline-start:5px solid ${isPast ? C.green : C.navy};` +
          `border-radius:12px;padding:12px 14px;margin-bottom:9px;background:${isPast ? '#fbfdfc' : C.white};page-break-inside:avoid;">` +
            `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">` +
              `<div style="font-size:15px;font-weight:800;color:${C.navy};">` +
                `<span dir="ltr">${escapeHtml(item.date)}</span> — ${escapeHtml(day)}</div>` +
              `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">` +
                `<span style="background:${C.navy};color:#fff;border-radius:8px;padding:3px 10px;font-size:13px;font-weight:800;">${escapeHtml(item.cat)}</span>` +
                badges.join('') +
              `</div>` +
            `</div>${time}${colleagues}${year2}` +
          `</div>`
        );
      })
      .join('');

    return rows;
  }

  function sectionTitle(text) {
    return (
      `<div style="display:flex;align-items:center;gap:10px;margin:22px 0 12px;">` +
        `<span style="width:5px;height:20px;border-radius:3px;background:${C.green};"></span>` +
        `<span style="font-size:18px;font-weight:800;color:${C.navy};">${escapeHtml(text)}</span>` +
      `</div>`
    );
  }

  AUH.capture = { buildShell, buildCalendar, buildOncallList, buildSummary, sectionTitle, monthTitle, stamp, formatDutyTime, COLORS: C, FONT };
})(typeof window !== 'undefined' ? window : globalThis);

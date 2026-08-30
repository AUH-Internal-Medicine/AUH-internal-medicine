/**
 * طلب تبديل / شيل مناوبة — the swap request page (swap.html).
 *
 * Reads the SAME live sheets the dashboard reads (no second source of truth),
 * then does three things a Google Form cannot:
 *   1. type-ahead on the real roster, filling the abbreviation automatically
 *   2. draws each doctor's actual duty calendar to pick from
 *   3. refuses a swap that would break the department's own scheduling rules
 *      (two duties on the same day, or on two consecutive days)
 *
 * The submission itself still goes to the existing Google Form, so the sheet
 * and the green/red review workflow stay exactly as they are.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ config
   * Fill these in from the Google Form (see docs/SWAP-FORM-SETUP.md):
   *   action  — the form's /formResponse URL
   *   fields  — the entry.NNNN id of each question, in the same order below
   * Leave `action` empty and the page still works end-to-end; it just hands the
   * doctor a copyable summary instead of posting.                            */
  const SWAP_FORM = {
    action: 'https://docs.google.com/forms/d/e/1FAIpQLSclXHWjHBOg82PmFW9l8MXeikxAca66qTNDnNl1BegWYumVQw/formResponse',
    fields: {
      fromName:  'entry.859931834',    // اسم صاحب المناوبة الاساسي
      fromAbbr:  'entry.59272369',     // اختصار صاحب المناوبة الاساسي
      shiftType: 'entry.13175464',     // نوع المناوبة (اختيار من متعدد)
      shiftDate: 'entry.4419424',      // تاريخ المناوبة (سؤال تاريخ)
      reason:    'entry.1810277956',   // سبب التبديل
      kind:      'entry.153438464',    // شيل أم تبديل
      toName:    'entry.567645653',    // اسم المناوب الجديد
      toAbbr:    'entry.1808162085',   // اختصار المناوب الجديد
      conditions:'entry.796695184',    // هل تحقق الشرطين (نعم/لا)
      backType:  'entry.1367484913',   // نوع المناوبة المقابلة
      backDate:  'entry.59105158',     // التاريخ المقابل (سؤال تاريخ)
      notes:     'entry.311724736'     // ملاحظات
    },
    // Google date questions arrive as three parameters, not one string.
    dateFields: ['shiftDate', 'backDate'],
    /**
     * The form's "نوع المناوبة" is a fixed choice list whose wording differs
     * from the sheet's headers in two places. Anything else matches once the
     * hamza is normalised, so only the genuine exceptions are listed here.
     */
    categoryAliases: {
      'تالت': 'ثالث',
      'إسعاف باب نهاري': 'اسعاف باب صباحي'
    },
    categoryOptions: ['عناية قلبية', 'عناية مركز', 'عناية داخلية', 'تاني', 'ثالث', 'رابع', 'سابع',
      'خارجيات', 'ديال', 'أورام', 'اسعاف مركز صباحي', 'اسعاف مركز ليلي', 'اسعاف بارد صباحي',
      'اسعاف بارد ليلي', 'اسعاف باب صباحي', 'اسعاف باب ليلي', 'اسعاف داخلي نهاري', 'اسعاف داخلي ليلي']
  };

  const AUH = global.AUH;
  const { normAr, smartSearch, splitNames, escapeHtml } = AUH.text;
  const { getDayName } = AUH.dates;
  const schedule = AUH.domain.oncallSchedule;

  const HARD = ['إسعاف داخلي ليلي', 'إسعاف داخلي نهاري', 'إسعاف باب ليلي', 'إسعاف باب نهاري',
    'اسعاف بارد ليلي', 'اسعاف بارد صباحي'].map(normAr);

  const $ = id => document.getElementById(id);
  const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب',
    'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const DOW = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  const dayNum = iso => Math.round(new Date(iso + 'T00:00:00Z') / 86400000);
  const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fmt = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  const today = new Date().toISOString().slice(0, 10);

  /* -------------------------------------------------------------- app state */
  const S = {
    roster: [],          // [{name, abbr, spec, status}]
    duties: new Map(),   // key -> [{date, cat, group, night, holiday, hard, hours}]
    months: [],          // ['2026-07', ...] present in the on-call sheet
    kind: 'شيل',
    from: null, to: null,
    shift: null,         // the duty being given away  {date, cat, ...}
    back: null,          // the duty coming back (تبديل متبادل only)
    m1: 0, m2: 0         // calendar month index into S.months
  };

  /* ---------------------------------------------------------------- loading */
  async function boot() {
    try {
      const fetched = await AUH.data.repository.fetchAll();
      const ds = AUH.data.repository.parseAll(fetched.tables);
      index(ds);
      $('boot').hidden = true;
      $('form').hidden = false;
      wire();
      applyLink();
    } catch (err) {
      $('boot').innerHTML =
        '<div class="verdict no"><h3><i class="fas fa-triangle-exclamation"></i> تعذر تحميل البيانات</h3>' +
        '<div>تأكد من الاتصال بالإنترنت ثم أعد تحميل الصفحة. ' +
        escapeHtml(err && err.message ? err.message : '') + '</div></div>';
    }
  }

  /** One pass over the on-call sheet → every doctor's duties, in date order. */
  function index(ds) {
    const residents = ds.residents;
    const oncall = ds.oncall;
    const holidays = new Set(((ds.holidays && ds.holidays.list) || []).map(h => h.date).filter(Boolean));

    S.roster = (residents.residents || [])
      .filter(r => r && r.name)
      .map(r => ({
        name: r.name, abbr: r.abbr || '', spec: r.spec || '', status: r.st || '',
        // a detached / not-yet-joined resident must never be offered a duty
        joined: r.st ? AUH.status.isJoined(r.st) : true
      }));

    const months = new Set();
    (oncall.rows || []).forEach(dayRow => {
      const date = dayRow.date;
      if (!date) return;
      months.add(date.slice(0, 7));
      const holiday = schedule.isHolidayDate(date, holidays);

      for (let col = 2; col < oncall.headers.length; col++) {
        const cat = (oncall.headers[col] || '').trim();
        const cell = (dayRow.row[col] || '').trim();
        if (!cat || !cell) continue;

        const sch = schedule.getCategorySchedule(cat, date, holidays);
        const duty = {
          date, cat, group: schedule.classifyGroup(cat),
          night: schedule.isNightCategory(cat), holiday,
          hard: HARD.includes(normAr(cat)),
          hours: AUH.text.parseDurationHours(sch ? sch.duration : '')
        };

        const seen = new Set();
        splitNames(cell).forEach(raw => {
          const r = residents.findByNameOrAbbr(raw);
          const key = r ? (r.abbr || r.name) : raw;
          if (seen.has(key)) return;
          seen.add(key);
          if (!S.duties.has(key)) S.duties.set(key, []);
          S.duties.get(key).push(duty);
        });
      }
    });

    S.duties.forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
    S.months = Array.from(months).sort();
    // open on the month that actually matters: the first one with a future duty
    const upcoming = S.months.findIndex(m => m >= today.slice(0, 7));
    S.m1 = S.m2 = upcoming < 0 ? Math.max(0, S.months.length - 1) : upcoming;
  }

  /** The sheet's category name in the exact wording the Google Form expects. */
  function formCategory(cat) {
    const raw = (cat || '').trim();
    const alias = Object.keys(SWAP_FORM.categoryAliases)
      .find(k => normAr(k) === normAr(raw));
    if (alias) return SWAP_FORM.categoryAliases[alias];
    const exact = SWAP_FORM.categoryOptions.find(o => normAr(o) === normAr(raw));
    return exact || raw;
  }

  /**
   * Open the calendar where the swappable duties actually are: the month of the
   * next future duty — unless only one is left there and a later month has more.
   */
  function openBestMonth(doc) {
    const future = dutiesOf(doc).filter(d => d.date >= today);
    if (!future.length) return;
    const month = future[0].date.slice(0, 7);
    const here = future.filter(d => d.date.startsWith(month)).length;
    const laterMonth = S.months.find(m => m > month);
    const later = laterMonth ? future.filter(d => d.date.startsWith(laterMonth)).length : 0;
    const chosen = here < 2 && later > here ? laterMonth : month;
    const i = S.months.indexOf(chosen);
    if (i >= 0) S.m1 = S.m2 = i;
  }

  const keyOf = doc => (doc.abbr || doc.name);
  const dutiesOf = doc => (doc ? (S.duties.get(keyOf(doc)) || []) : []);

  /* --------------------------------------------------------------- combobox */
  function combo(inputId, listId, onPick) {
    const input = $(inputId), list = $(listId);
    let items = [], active = -1;

    const close = () => { list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); active = -1; };

    const render = term => {
      const q = term.trim();
      items = q.length < 1 ? [] : S.roster.filter(r => smartSearch(`${r.name} ${r.abbr}`, q)).slice(0, 40);
      if (!q) { close(); return; }
      if (!items.length) {
        list.innerHTML = '<div class="combo-empty">لا يوجد طبيب بهذا الاسم في اللائحة</div>';
      } else {
        list.innerHTML = items.map((r, i) => {
          const n = dutiesOf(r).length;
          return `<div class="combo-opt${i === active ? ' active' : ''}" data-i="${i}">` +
            `<span class="nm">${escapeHtml(r.name)}</span>` +
            `<span class="meta">${escapeHtml(r.abbr)}${n ? ` · ${n} مناوبة` : ''}</span></div>`;
        }).join('');
      }
      list.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    };

    const choose = i => {
      const r = items[i];
      if (!r) return;
      input.value = r.name;
      close();
      onPick(r);
    };

    input.addEventListener('input', () => { onPick(null); render(input.value); });
    input.addEventListener('focus', () => { if (input.value.trim()) render(input.value); });
    input.addEventListener('keydown', e => {
      if (!list.classList.contains('open')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
        render(input.value);
        const el = list.querySelector('.combo-opt.active');
        if (el) el.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        choose(active < 0 ? 0 : active);
      } else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', e => {
      const opt = e.target.closest('.combo-opt');
      if (opt) { e.preventDefault(); choose(+opt.dataset.i); }
    });
    document.addEventListener('click', e => { if (!input.closest('.combo').contains(e.target)) close(); });
  }

  /* ------------------------------------------------------------ swap rules */
  /**
   * Can `taker` take a duty on `date`?
   * Hard rules block the pick; soft rules only warn.
   * `ignore` is the date the taker gives away in a mutual swap — they will not
   * have it any more, so it must not count against them.
   */
  function evaluate(taker, date, cat, ignore) {
    const list = dutiesOf(taker).filter(d => d.date !== ignore);
    const blocks = [], warns = [];
    const at = iso => list.filter(d => d.date === iso);
    const n = dayNum(date);
    const near = list.filter(d => Math.abs(dayNum(d.date) - n) <= 3 && d.date !== date);

    const same = at(date);
    if (same.length) blocks.push(`لديه مناوبة في نفس اليوم (${escapeHtml(same[0].cat)})`);

    const prev = list.find(d => dayNum(d.date) === n - 1);
    const next = list.find(d => dayNum(d.date) === n + 1);
    if (prev) blocks.push(`لديه مناوبة في اليوم السابق ${fmt(prev.date)} — تصبح مناوبتان متتاليتان`);
    if (next) blocks.push(`لديه مناوبة في اليوم التالي ${fmt(next.date)} — تصبح مناوبتان متتاليتان`);

    const p2 = list.find(d => dayNum(d.date) === n - 2);
    const n2 = list.find(d => dayNum(d.date) === n + 2);
    if (p2 || n2) warns.push('يوم راحة واحد فقط قبلها أو بعدها');

    if (cat) {
      const rep = near.find(d => normAr(d.cat) === normAr(cat));
      if (rep) warns.push(`نفس نوع المناوبة (${escapeHtml(cat)}) لديه في ${fmt(rep.date)}`);
      if (HARD.includes(normAr(cat))) {
        const hardNear = near.find(d => d.hard && Math.abs(dayNum(d.date) - n) <= 2);
        if (hardNear) warns.push(`مناوبة صعبة أخرى قريبة (${escapeHtml(hardNear.cat)} في ${fmt(hardNear.date)})`);
      }
      if (schedule.isNightCategory(cat)) {
        const nightNear = near.find(d => d.night && Math.abs(dayNum(d.date) - n) <= 3);
        if (nightNear) warns.push(`ليلية أخرى خلال ٣ أيام (${fmt(nightNear.date)})`);
      }
    }

    const month = date.slice(0, 7);
    const inMonth = list.filter(d => d.date.startsWith(month));
    if (schedule.isHolidayDate(date, new Set())) {
      const hol = inMonth.filter(d => d.holiday).length;
      if (hol >= 3) warns.push(`لديه ${hol} مناوبات عطلة هذا الشهر قبل الإضافة`);
    }
    if (date < today) warns.push('هذا التاريخ مضى');

    return { ok: !blocks.length, blocks, warns, after: inMonth.length + 1 };
  }

  /**
   * Everyone who can take the selected duty, best candidate first.
   * With ~26 duties a month per resident, most colleagues are blocked on any
   * given date — so listing the ones who are free is the difference between a
   * form you can use and a guessing game.
   */
  function eligibleFor(shift, exclude) {
    const month = shift.date.slice(0, 7);
    const out = [];
    S.roster.forEach(doc => {
      if (exclude && keyOf(doc) === keyOf(exclude)) return;
      if (!doc.joined) return;                       // منفك / غير ملتحق
      const v = evaluate(doc, shift.date, shift.cat, null);
      if (!v.ok) return;
      const inMonth = dutiesOf(doc).filter(d => d.date.startsWith(month));
      out.push({
        doc,
        warns: v.warns,
        monthCount: inMonth.length,
        hard: inMonth.filter(d => d.hard).length,
        gap: Math.min(...dutiesOf(doc).map(d => Math.abs(dayNum(d.date) - dayNum(shift.date))).concat([99]))
      });
    });
    // fewest warnings, then the lightest month, then the widest gap: the
    // fairest person to ask is the one carrying the least right now.
    out.sort((a, b) => a.warns.length - b.warns.length || a.monthCount - b.monthCount || b.gap - a.gap);
    return out;
  }

  function renderEligible() {
    const host = $('elig');
    if (!host) return;
    if (!S.shift) { host.innerHTML = ''; return; }

    if (S.shift.date < today) {
      host.innerHTML = '<div class="verdict warn" style="margin-top:0"><h3><i class="fas fa-clock-rotate-left"></i> مناوبة مضت</h3>' +
        '<div>لا يمكن تبديل مناوبة تاريخها في الماضي. اختر مناوبة قادمة من الرزنامة.</div></div>';
      return;
    }
    const list = eligibleFor(S.shift, S.from);
    const clean = list.filter(x => !x.warns.length);
    if (!list.length) {
      host.innerHTML = '<div class="verdict no" style="margin-top:0"><h3><i class="fas fa-user-slash"></i> لا يوجد طبيب متاح</h3>' +
        '<div>كل الأطباء لديهم مناوبة في هذا اليوم أو في اليوم الذي قبله أو بعده. جرّب مناوبة أخرى.</div></div>';
      return;
    }
    const chip = x => {
      const w = x.warns.length;
      return `<button type="button" class="cand${w ? ' has-warn' : ''}" data-key="${escapeHtml(keyOf(x.doc))}">` +
        `<span class="cn">${escapeHtml(x.doc.name)}</span>` +
        `<span class="cm"><span class="num">${x.monthCount}</span> مناوبة هذا الشهر` +
        (w ? ` · <i class="fas fa-triangle-exclamation"></i> ${w} تنبيه` : '') + `</span></button>`;
    };
    host.innerHTML =
      `<div class="elig-head"><i class="fas fa-user-check"></i> <b>${list.length}</b> طبيباً يمكنهم أخذ هذه المناوبة` +
      (clean.length ? ` — منهم <b>${clean.length}</b> بلا أي تنبيه` : '') +
      `<span class="elig-note">مرتّبون من الأخفّ عبئاً هذا الشهر</span></div>` +
      `<div class="cands">${list.slice(0, 24).map(chip).join('')}</div>` +
      (list.length > 24 ? `<div class="elig-note" style="margin-top:8px">…و${list.length - 24} آخرون — اكتب الاسم في المربع أعلاه.</div>` : '');

    host.querySelectorAll('.cand').forEach(btn => btn.addEventListener('click', () => {
      const doc = S.roster.find(r => keyOf(r) === btn.dataset.key);
      if (!doc) return;
      S.to = doc; S.back = null;
      $('q2').value = doc.name;
      chosenBox($('ch2'), doc, () => { $('q2').value = ''; S.to = null; refresh(); });
      const i = S.months.indexOf(S.shift.date.slice(0, 7));
      if (i >= 0) S.m2 = i;
      refresh();
      $('verdict').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }

  /* -------------------------------------------------------------- calendars */
  /**
   * @param {object} opts
   *   doctor, monthIdx, mode: 'pick' (choose own duty) | 'check' (validate against target)
   *   selected: iso of the chosen duty · target: {date, cat} being taken (check mode)
   */
  function calendar(host, titleEl, opts) {
    const month = S.months[opts.monthIdx];
    if (!month) { host.innerHTML = '<div class="empty-cal">لا توجد بيانات لهذا الشهر</div>'; return; }

    const [y, m] = month.split('-').map(Number);
    titleEl.textContent = `${AR_MONTHS[m - 1]} ${y}`;

    const duties = dutiesOf(opts.doctor).filter(d => d.date.startsWith(month));
    if (!duties.length && opts.mode === 'pick') {
      host.innerHTML = `<div class="empty-cal"><i class="fas fa-calendar-xmark"></i><br>لا توجد مناوبات لهذا الطبيب في ${AR_MONTHS[m - 1]}.<br>جرّب شهراً آخر بالأسهم أعلاه.</div>`;
      return;
    }

    const byDate = {};
    duties.forEach(d => (byDate[d.date] = byDate[d.date] || []).push(d));

    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push(`<div class="dow">${DOW[i]}</div>`);
    for (let i = 0; i < first; i++) cells.push('<div class="day pad"></div>');

    for (let d = 1; d <= days; d++) {
      const iso = isoOf(y, m, d);
      const mine = byDate[iso] || [];
      const holiday = schedule.isHolidayDate(iso, new Set());
      const cls = ['day'];
      let why = '', click = '';

      if (holiday) cls.push('hol');
      if (iso < today) cls.push('past');

      if (opts.mode === 'pick') {
        if (mine.length && iso >= today) { cls.push('pick'); click = ` data-date="${iso}"`; }
        else if (mine.length) { cls.push('gone'); why = 'مضت'; }
        if (iso === opts.selected) cls.push('sel');
      } else {
        const v = evaluate(opts.doctor, iso, opts.target ? opts.target.cat : '', opts.ignore);
        if (!v.ok) { cls.push('blocked'); why = v.blocks[0].replace(/\s*\(.*\)/, ''); }
        else if (v.warns.length) cls.push('warnday');
        if (opts.clickable && v.ok) { cls.push('pick'); click = ` data-date="${iso}"`; }
        if (iso === opts.selected) cls.push('sel');
      }

      const tags = mine.map(x => `<span class="tag">${escapeHtml(x.cat)}</span>`).join('');
      cells.push(`<div class="${cls.join(' ')}"${click}><span class="dn">${d}</span>${tags}` +
        (why ? `<span class="why">${escapeHtml(why)}</span>` : '') + '</div>');
    }

    host.className = 'cal';
    host.innerHTML = cells.join('');
  }

  /* ----------------------------------------------------------------- render */
  function chosenBox(host, doc, onClear) {
    if (!doc) { host.innerHTML = ''; return; }
    const n = dutiesOf(doc).length;
    host.innerHTML = `<div class="chosen"><i class="fas fa-user-doctor"></i>` +
      `<span><b>${escapeHtml(doc.name)}</b>${doc.spec ? ` — ${escapeHtml(doc.spec)}` : ''} · ` +
      `<span class="num">${n}</span> مناوبة في الجدول</span>` +
      `<button type="button" class="x" title="إلغاء الاختيار"><i class="fas fa-xmark"></i></button></div>`;
    host.querySelector('.x').addEventListener('click', onClear);
  }

  function verdictBox() {
    const host = $('verdict');
    if (!S.to || !S.shift) { host.innerHTML = ''; return; }

    const v = evaluate(S.to, S.shift.date, S.shift.cat, S.kind === 'تبديل' && S.back ? S.back.date : null);
    const head = `${escapeHtml(S.to.name)} — مناوبة ${escapeHtml(S.shift.cat)} يوم ` +
      `${getDayName(S.shift.date)} <span class="num">${fmt(S.shift.date)}</span>`;

    if (!v.ok) {
      host.innerHTML = `<div class="verdict no"><h3><i class="fas fa-ban"></i> لا يمكن هذا التبديل</h3>` +
        `<div>${head}</div><ul>${v.blocks.map(b => `<li>${b}</li>`).join('')}</ul>` +
        `<div style="margin-top:7px;font-size:12.5px">اختر طبيباً آخر، أو مناوبة أخرى.</div></div>`;
    } else if (v.warns.length) {
      host.innerHTML = `<div class="verdict warn"><h3><i class="fas fa-triangle-exclamation"></i> ممكن — مع تنبيه</h3>` +
        `<div>${head}</div><ul>${v.warns.map(w => `<li>${w}</li>`).join('')}</ul>` +
        `<div style="margin-top:7px;font-size:12.5px">يصبح مجموع مناوباته هذا الشهر <span class="num">${v.after}</span>.</div></div>`;
    } else {
      host.innerHTML = `<div class="verdict ok"><h3><i class="fas fa-circle-check"></i> التبديل ممكن</h3>` +
        `<div>${head}</div><div style="margin-top:6px;font-size:12.5px">لا تعارض: لا مناوبة في نفس اليوم، ولا في اليوم السابق أو التالي. ` +
        `يصبح مجموع مناوباته هذا الشهر <span class="num">${v.after}</span>.</div></div>`;
    }
    return v;
  }

  function summary() {
    const host = $('sumbox');
    if (!S.from || !S.to || !S.shift) { host.innerHTML = ''; return; }
    const back = S.kind === 'تبديل' && S.back
      ? `<div class="what">ويأخذ بدلاً منها: ${escapeHtml(S.back.cat)} — <span class="num">${fmt(S.back.date)}</span></div>` : '';
    host.innerHTML =
      `<div class="sum-box"><div class="who">${escapeHtml(S.from.name)}</div>` +
      `<div class="what">يعطي: ${escapeHtml(S.shift.cat)} — ${getDayName(S.shift.date)} <span class="num">${fmt(S.shift.date)}</span></div>${back}</div>` +
      `<div class="sum-arrow"><i class="fas fa-arrow-left"></i></div>` +
      `<div class="sum-box"><div class="who">${escapeHtml(S.to.name)}</div>` +
      `<div class="what">${S.kind === 'تبديل' ? 'يتبادل معه المناوبة' : 'يأخذ المناوبة'}</div></div>`;
  }

  function refresh() {
    const lock = (id, on) => $(id).classList.toggle('locked', on);
    const done = (id, on) => $(id).classList.toggle('done', on);

    done('s2', !!S.from);
    lock('s3', !S.from);
    done('s3', !!S.shift);
    lock('s4', !S.shift);
    done('s4', !!S.to);
    lock('s5', !S.to);
    lock('s6', !(S.from && S.to && S.shift));

    $('ab1').value = S.from ? S.from.abbr : '';
    $('ab2').value = S.to ? S.to.abbr : '';

    if (S.from) calendar($('cal1'), $('cal1t'), { doctor: S.from, monthIdx: S.m1, mode: 'pick', selected: S.shift && S.shift.date });
    else { $('cal1').innerHTML = ''; $('cal1t').textContent = '—'; }

    const mutual = S.kind === 'تبديل';
    $('s5t').textContent = mutual ? 'اختر المناوبة المقابلة من رزنامته' : 'رزنامة الطبيب الجديد';
    $('s5h').textContent = mutual
      ? `يجب أن تكون من النوع نفسه (${S.shift ? S.shift.cat : '—'}) — هذا شرط القسم. الأيام المشطوبة مخالفة.`
      : 'الأيام المشطوبة ممنوعة: مناوبة في نفس اليوم، أو في اليوم الذي قبله أو بعده.';

    if (S.to) {
      if (mutual) {
        // pick one of B's duties — blocked when handing it to A would break A's rules
        const month = S.months[S.m2];
        const duties = dutiesOf(S.to).filter(d => d.date.startsWith(month));
        const byDate = {};
        duties.forEach(d => (byDate[d.date] = d));
        calendarMutual($('cal2'), $('cal2t'), byDate);
      } else {
        calendar($('cal2'), $('cal2t'), {
          doctor: S.to, monthIdx: S.m2, mode: 'check',
          target: S.shift, selected: S.shift && S.shift.date
        });
      }
    } else { $('cal2').innerHTML = ''; $('cal2t').textContent = '—'; }

    renderEligible();
    verdictBox();
    summary();
    validateSend();
  }

  /** In a mutual swap the second calendar offers B's duties, judged for A. */
  function calendarMutual(host, titleEl, byDate) {
    const month = S.months[S.m2];
    if (!month) { host.innerHTML = '<div class="empty-cal">لا توجد بيانات</div>'; return; }
    const [y, m] = month.split('-').map(Number);
    titleEl.textContent = `${AR_MONTHS[m - 1]} ${y}`;

    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push(`<div class="dow">${DOW[i]}</div>`);
    for (let i = 0; i < first; i++) cells.push('<div class="day pad"></div>');

    for (let d = 1; d <= days; d++) {
      const iso = isoOf(y, m, d);
      const duty = byDate[iso];
      const cls = ['day'];
      let why = '', click = '';
      if (schedule.isHolidayDate(iso, new Set())) cls.push('hol');
      if (iso < today) cls.push('past');

      if (duty) {
        const sameType = S.shift && normAr(duty.cat) === normAr(S.shift.cat);
        const v = evaluate(S.from, iso, duty.cat, S.shift ? S.shift.date : null);
        if (!sameType) { cls.push('blocked'); why = 'نوع مختلف'; }
        else if (!v.ok) { cls.push('blocked'); why = v.blocks[0].replace(/\s*\(.*\)/, ''); }
        else { cls.push('pick'); click = ` data-date="${iso}"`; if (v.warns.length) cls.push('warnday'); }
        if (S.back && S.back.date === iso) cls.push('sel');
      }

      cells.push(`<div class="${cls.join(' ')}"${click}><span class="dn">${d}</span>` +
        (duty ? `<span class="tag">${escapeHtml(duty.cat)}</span>` : '') +
        (why ? `<span class="why">${escapeHtml(why)}</span>` : '') + '</div>');
    }
    host.className = 'cal';
    host.innerHTML = cells.join('');
  }

  function validateSend() {
    const v = S.to && S.shift ? evaluate(S.to, S.shift.date, S.shift.cat, S.kind === 'تبديل' && S.back ? S.back.date : null) : null;
    const mutualOk = S.kind !== 'تبديل' || !!S.back;
    const ready = !!(S.from && S.to && S.shift && v && v.ok && mutualOk &&
      $('agree').checked && $('reason').value && $('phone').value.trim().length >= 6 &&
      keyOf(S.from) !== keyOf(S.to));
    $('send').disabled = !ready;
  }

  /* ------------------------------------------------------------------- send */
  function payload() {
    // "شيل" still has to fill the counterpart questions — the form requires
    // them, and its own instructions say to repeat the original duty there.
    const back = S.kind === 'تبديل' && S.back ? S.back : S.shift;
    const notes = [
      $('notes').value.trim(),
      $('phone').value.trim() ? `هاتف مُقدّم الطلب: ${$('phone').value.trim()}` : '',
      `تم التحقق آلياً: لا مناوبة في نفس اليوم، ولا في اليوم السابق أو التالي.`
    ].filter(Boolean).join('\n');

    return {
      kind: S.kind,
      fromName: S.from.name, fromAbbr: S.from.abbr,
      shiftDate: S.shift.date, shiftType: formCategory(S.shift.cat),
      toName: S.to.name, toAbbr: S.to.abbr,
      backDate: back.date, backType: formCategory(back.cat),
      conditions: 'نعم',
      reason: $('reason').value,
      notes
    };
  }

  function send() {
    const data = payload();

    if (!SWAP_FORM.action) {
      const text =
        `طلب ${data.kind} مناوبة\n` +
        `صاحب المناوبة: ${data.fromName} (${data.fromAbbr})\n` +
        `المناوبة: ${data.shiftType} — ${data.shiftDate} (${getDayName(data.shiftDate)})\n` +
        `الطبيب الجديد: ${data.toName} (${data.toAbbr})\n` +
        `المناوبة المقابلة: ${data.backType} — ${data.backDate}\n` +
        `السبب: ${data.reason}\n` +
        (data.notes ? `ملاحظات: ${data.notes}\n` : '');
      navigator.clipboard.writeText(text)
        .then(() => toast('لم يُربط النموذج بعد — نُسخت تفاصيل الطلب، أرسلها للمسؤول.'))
        .catch(() => toast('لم يُربط النموذج بعد. راجع docs/SWAP-FORM-SETUP.md', true));
      return;
    }

    // Posting through a hidden iframe keeps Google's cross-origin response out
    // of the way — the request still reaches the sheet.
    const frameName = 'swapSink';
    let frame = document.getElementById(frameName);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.name = frameName; frame.id = frameName; frame.style.display = 'none';
      document.body.appendChild(frame);
    }
    const form = document.createElement('form');
    form.action = SWAP_FORM.action;
    form.method = 'POST';
    form.target = frameName;
    const add = (name, value) => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.appendChild(input);
    };
    Object.entries(SWAP_FORM.fields).forEach(([key, entry]) => {
      if (!entry || data[key] === undefined || data[key] === '') return;
      if (SWAP_FORM.dateFields.indexOf(key) >= 0) {
        // a date question wants entry.N_year / _month / _day
        const [y, m, d] = data[key].split('-');
        add(`${entry}_year`, y); add(`${entry}_month`, String(+m)); add(`${entry}_day`, String(+d));
      } else {
        add(entry, data[key]);
      }
    });
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 1500);

    $('form').hidden = true;
    $('done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Deep link: swap.html?from=<abbr|name>&date=YYYY-MM-DD&to=<abbr|name>
   * Lets a doctor share a half-filled request, and lets the reviewer reopen one
   * exactly as it was submitted.
   */
  function applyLink() {
    const p = new URLSearchParams(location.search);
    const find = v => {
      const q = (v || '').trim();
      if (!q) return null;
      return S.roster.find(r => normAr(r.abbr) === normAr(q) || normAr(r.name) === normAr(q)) ||
        S.roster.find(r => smartSearch(`${r.name} ${r.abbr}`, q)) || null;
    };

    const from = find(p.get('from'));
    if (from) {
      S.from = from;
      $('q1').value = from.name;
      openBestMonth(from);
      chosenBox($('ch1'), from, () => { $('q1').value = ''; S.from = null; refresh(); });
    }

    const date = (p.get('date') || '').trim();
    if (S.from && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const duty = dutiesOf(S.from).find(d => d.date === date);
      if (duty) {
        S.shift = duty;
        const i = S.months.indexOf(date.slice(0, 7));
        if (i >= 0) S.m1 = S.m2 = i;
      }
    }

    const to = find(p.get('to'));
    if (to && S.from && keyOf(to) !== keyOf(S.from) && to.joined) {
      S.to = to;
      $('q2').value = to.name;
      chosenBox($('ch2'), to, () => { $('q2').value = ''; S.to = null; refresh(); });
    }

    if (from || date || to) refresh();
  }

  function toast(msg, bad) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 4200);
  }

  /* ------------------------------------------------------------------ wiring */
  function wire() {
    combo('q1', 'l1', doc => {
      S.from = doc; S.shift = null; S.back = null;
      if (doc) openBestMonth(doc);
      chosenBox($('ch1'), doc, () => { $('q1').value = ''; S.from = null; S.shift = null; refresh(); });
      refresh();
    });

    combo('q2', 'l2', doc => {
      if (doc && S.from && keyOf(doc) === keyOf(S.from)) {
        toast('لا يمكن اختيار نفس الطبيب في الطرفين', true);
        $('q2').value = ''; S.to = null; refresh(); return;
      }
      if (doc && !doc.joined) {
        toast(`${doc.name}: ${doc.status || 'غير ملتحق'} — لا يمكن إسناد مناوبة له`, true);
        $('q2').value = ''; S.to = null; refresh(); return;
      }
      S.to = doc; S.back = null;
      if (doc && S.shift) { const i = S.months.indexOf(S.shift.date.slice(0, 7)); if (i >= 0) S.m2 = i; }
      chosenBox($('ch2'), doc, () => { $('q2').value = ''; S.to = null; refresh(); });
      refresh();
    });

    $('kind').addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      S.kind = b.dataset.kind;
      S.back = null;
      $('kind').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      refresh();
    });

    $('cal1').addEventListener('click', e => {
      const cell = e.target.closest('.day[data-date]');
      if (!cell) return;
      const date = cell.dataset.date;
      const list = dutiesOf(S.from).filter(d => d.date === date);
      if (!list.length) return;
      if (date < today) { toast('لا يمكن تبديل مناوبة مضى تاريخها', true); return; }
      // more than one duty on the same day is possible; ask which
      S.shift = list.length === 1 ? list[0] : list[0];
      if (S.to) { const i = S.months.indexOf(date.slice(0, 7)); if (i >= 0) S.m2 = i; }
      refresh();
      $('s4').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('cal2').addEventListener('click', e => {
      const cell = e.target.closest('.day[data-date]');
      if (!cell || S.kind !== 'تبديل') return;
      const date = cell.dataset.date;
      const duty = dutiesOf(S.to).find(d => d.date === date) || null;
      if (duty && S.shift && normAr(duty.cat) !== normAr(S.shift.cat)) {
        toast('التبديل المتبادل يجب أن يكون بين مناوبتين من النوع نفسه', true);
        return;
      }
      S.back = duty;
      refresh();
    });

    const step = (which, delta) => {
      if (which === 1) S.m1 = Math.min(S.months.length - 1, Math.max(0, S.m1 + delta));
      else S.m2 = Math.min(S.months.length - 1, Math.max(0, S.m2 + delta));
      refresh();
    };
    $('p1').addEventListener('click', () => step(1, -1));
    $('n1').addEventListener('click', () => step(1, 1));
    $('p2').addEventListener('click', () => step(2, -1));
    $('n2').addEventListener('click', () => step(2, 1));

    ['agree', 'reason', 'phone', 'notes'].forEach(id =>
      $(id).addEventListener('input', validateSend));
    $('agree').addEventListener('change', validateSend);
    $('send').addEventListener('click', send);

    refresh();
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})(typeof window !== 'undefined' ? window : globalThis);

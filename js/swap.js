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
        phone: r.phone || '',
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
   * The one rule that matters: nobody may end up with two duties on the same
   * day, or on two consecutive days. Nothing else blocks, and nothing warns —
   * a request either passes or it does not.
   *
   * `ignore` is the date the person hands over in a mutual swap; they will not
   * have it any more, so it must not count against them.
   */
  function evaluate(taker, date, ignore) {
    const list = dutiesOf(taker).filter(d => d.date !== ignore);
    const blocks = [];
    const n = dayNum(date);

    const same = list.find(d => d.date === date);
    if (same) blocks.push(`مناوبة في نفس اليوم (${same.cat})`);

    const prev = list.find(d => dayNum(d.date) === n - 1);
    if (prev) blocks.push(`مناوبة في اليوم السابق ${fmt(prev.date)}`);

    const next = list.find(d => dayNum(d.date) === n + 1);
    if (next) blocks.push(`مناوبة في اليوم التالي ${fmt(next.date)}`);

    const month = date.slice(0, 7);
    return { ok: !blocks.length, blocks, after: list.filter(d => d.date.startsWith(month)).length + 1 };
  }

  /**
   * A mutual swap is only real when it works in BOTH directions:
   *   • the colleague can take my duty, after giving up the one they hand me
   *   • I can take one of theirs, after giving up mine
   * Returns every duty of `to` that satisfies both. Empty means this colleague
   * must not be offered at all — however free their own day looks.
   */
  function feasibleSwaps(from, shift, to) {
    // Never the same date. Trading two duties that fall on the one day changes
    // nothing for either of us — we both still work that day — and reads as
    // being handed back my own shift.
    return dutiesOf(to)
      .filter(d => d.date >= today && d.date !== shift.date)
      .filter(d => evaluate(to, shift.date, d.date).ok)    // they take mine
      .filter(d => evaluate(from, d.date, shift.date).ok); // I take theirs
  }

  /** The duty list someone ends up with — what "بعد التبديل" draws. */
  function dutiesAfter(doc, add, remove) {
    const list = dutiesOf(doc).filter(d => !remove || d.date !== remove.date);
    return (add ? list.concat([add]) : list).sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ------------------------------------------------------- who can take it */
  /**
   * Everyone who may be offered for this duty.
   *   شيل  → the colleague simply has to be free around my duty.
   *   تبديل → additionally, at least one of THEIR duties must be one that I can
   *           take in return. A colleague who can take mine but has nothing I
   *           can take is not a swap — so they are not listed at all.
   */
  function eligibleFor(shift, from) {
    const month = shift.date.slice(0, 7);
    const mutual = S.kind === 'تبديل';
    const out = [];

    S.roster.forEach(doc => {
      if (from && keyOf(doc) === keyOf(from)) return;
      if (!doc.joined) return;                            // منفك / غير ملتحق

      let options = null;
      if (mutual) {
        options = feasibleSwaps(from, shift, doc);
        if (!options.length) return;
      } else if (!evaluate(doc, shift.date, null).ok) {
        return;
      }

      out.push({
        doc,
        monthCount: dutiesOf(doc).filter(d => d.date.startsWith(month)).length,
        options
      });
    });

    // lightest month first — the fairest colleague to ask is the least loaded
    out.sort((a, b) => a.monthCount - b.monthCount ||
      (a.doc.name || '').localeCompare(b.doc.name || '', 'ar'));
    return out;
  }

  function renderEligible() {
    const host = $('elig');
    if (!host) return;
    if (!S.shift) { host.innerHTML = ''; return; }

    if (S.shift.date < today) {
      host.innerHTML = '<div class="verdict no" style="margin-top:0"><h3><i class="fas fa-clock-rotate-left"></i> مناوبة مضت</h3>' +
        '<div>لا يمكن تبديل مناوبة تاريخها في الماضي. اختر مناوبة قادمة من الرزنامة.</div></div>';
      return;
    }

    const mutual = S.kind === 'تبديل';
    const list = eligibleFor(S.shift, S.from);

    if (!list.length) {
      host.innerHTML = '<div class="verdict no" style="margin-top:0"><h3><i class="fas fa-user-slash"></i> لا يوجد طبيب متاح</h3>' +
        `<div>${mutual
          ? 'لا يوجد زميل يستطيع أخذ هذه المناوبة ولديه في المقابل مناوبة تستطيع أنت أخذها. جرّب «شيل مناوبة» بدلاً من التبديل المتبادل.'
          : 'كل الأطباء لديهم مناوبة في هذا اليوم أو في اليوم الذي قبله أو بعده. جرّب مناوبة أخرى.'}</div></div>`;
      return;
    }

    const chip = x => {
      const phone = (x.doc.phone || '').trim();
      const opts = mutual
        ? `<span class="cm-alt"><i class="fas fa-right-left"></i> <span class="num">${x.options.length}</span> مناوبة قابلة للتبادل</span>`
        : '';
      return `<div class="cand" data-key="${escapeHtml(keyOf(x.doc))}" tabindex="0">` +
        `<span class="cn">${escapeHtml(x.doc.name)}</span>` +
        `<span class="cm"><span class="num">${x.monthCount}</span> مناوبة هذا الشهر</span>${opts}` +
        (phone
          ? `<span class="cand-phone"><a href="tel:${escapeHtml(phone)}" class="num" onclick="event.stopPropagation()">${escapeHtml(phone)}</a>` +
            `<button type="button" class="copy" data-phone="${escapeHtml(phone)}" title="نسخ الرقم"><i class="fas fa-copy"></i></button></span>`
          : '<span class="cand-phone none"><i class="fas fa-phone-slash"></i> لا يوجد رقم في اللائحة</span>') +
        '</div>';
    };

    host.innerHTML =
      `<div class="elig-head"><i class="fas fa-user-check"></i> <b>${list.length}</b> ${mutual ? 'زميلاً يمكن التبادل معهم' : 'طبيباً يمكنهم أخذ هذه المناوبة'}` +
      `<span class="elig-note">${mutual
        ? 'يستطيعون أخذ مناوبتك، ولديهم مناوبة تستطيع أنت أخذها'
        : 'لا مناوبة لديهم في نفس اليوم ولا في اليوم السابق أو التالي'} — مرتّبون من الأخفّ عبئاً</span></div>` +
      `<div class="cands">${list.slice(0, 30).map(chip).join('')}</div>` +
      (list.length > 30 ? `<div class="elig-note" style="margin-top:8px">…و${list.length - 30} آخرون — اكتب الاسم في المربع أعلاه.</div>` : '');

    host.querySelectorAll('.copy').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.phone)
        .then(() => toast(`نُسخ الرقم ${btn.dataset.phone}`))
        .catch(() => toast('تعذّر النسخ', true));
    }));

    const choose = el => {
      const doc = S.roster.find(r => keyOf(r) === el.dataset.key);
      if (!doc) return;
      S.to = doc; S.back = null;
      $('q2').value = doc.name;
      chosenBox($('ch2'), doc, () => { $('q2').value = ''; S.to = null; refresh(); });
      const idx = S.months.indexOf(S.shift.date.slice(0, 7));
      if (idx >= 0) S.m2 = idx;
      refresh();
      $('s5').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    host.querySelectorAll('.cand').forEach(el => {
      el.addEventListener('click', () => choose(el));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(el); }
      });
    });
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
        const v = evaluate(opts.doctor, iso, opts.ignore);
        if (!v.ok) { cls.push('blocked'); why = v.blocks[0].replace(/\s*\(.*\)/, ''); }
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

    const mutual = S.kind === 'تبديل';
    const give = mutual && S.back ? S.back.date : null;
    const v = evaluate(S.to, S.shift.date, give);
    const back = mutual && S.back ? evaluate(S.from, S.back.date, S.shift.date) : null;

    const head = `${escapeHtml(S.to.name)} — ${escapeHtml(S.shift.cat)} يوم ` +
      `${getDayName(S.shift.date)} <span class="num">${fmt(S.shift.date)}</span>`;

    // In a mutual swap the colleague is only judged once the counterpart duty is
    // known — until then the duty they are about to hand over still counts
    // against them, which would report a clash that the swap itself removes.
    if (mutual && !S.back) {
      host.innerHTML = `<div class="verdict warn"><h3><i class="fas fa-hand-pointer"></i> اختر المناوبة المقابلة</h3>` +
        `<div>${escapeHtml(S.to.name)} يستطيع أخذ مناوبتك. اختر الآن من رزنامته أدناه المناوبة التي تأخذها أنت — الأخضر فقط متاح.</div></div>`;
      return;
    }

    if (!v.ok || (back && !back.ok)) {
      const why = !v.ok ? v.blocks : back.blocks;
      const who = !v.ok ? escapeHtml(S.to.name) : 'أنت';
      host.innerHTML = `<div class="verdict no"><h3><i class="fas fa-ban"></i> لا يمكن هذا التبديل</h3>` +
        `<div>${head}</div><ul>${why.map(b => `<li>${who}: ${b}</li>`).join('')}</ul></div>`;
      return;
    }

    const backLine = mutual && S.back
      ? `<div style="margin-top:5px">وتأخذ أنت: <b>${escapeHtml(S.back.cat)}</b> يوم ${getDayName(S.back.date)} <span class="num">${fmt(S.back.date)}</span></div>`
      : '';
    host.innerHTML = `<div class="verdict ok"><h3><i class="fas fa-circle-check"></i> ${mutual ? 'التبديل ممكن' : 'الشيل ممكن'}</h3>` +
      `<div>${head}</div>${backLine}` +
      `<div style="margin-top:6px;font-size:12.5px">لا مناوبة في نفس اليوم، ولا في اليوم السابق أو التالي، للطرفين.</div></div>`;
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
    $('s5t').textContent = mutual ? 'رزنامته: اختر المناوبة المقابلة' : 'رزنامته قبل الشيل وبعده';
    $('s5h').textContent = mutual
      ? 'على اليمين جدوله الحالي — اضغط على مناوبة خضراء لتأخذها أنت. على اليسار النتيجة بعد التبديل.'
      : 'على اليمين جدوله كما هو الآن، وعلى اليسار كما يصبح بعد أخذه المناوبة.';

    if (S.to && S.shift) renderBeforeAfter();
    else { $('cal2').innerHTML = ''; $('cal2t').textContent = '—'; }
    $('saveImg').disabled = !(S.to && S.shift);

    renderEligible();
    verdictBox();
    summary();
    validateSend();
  }

  /**
   * The taker's month drawn twice: as it stands, and as it would be after the
   * request goes through. In a mutual swap the "قبل" grid is also the picker —
   * only the duties I could actually take in return are selectable.
   */
  function renderBeforeAfter() {
    const host = $('cal2');
    const month = S.months[S.m2];
    if (!S.to || !S.shift || !month) { host.innerHTML = ''; $('cal2t').textContent = '—'; return; }

    const [y, m] = month.split('-').map(Number);
    $('cal2t').textContent = `${AR_MONTHS[m - 1]} ${y}`;

    const mutual = S.kind === 'تبديل';
    const options = mutual ? feasibleSwaps(S.from, S.shift, S.to) : [];
    const optionDates = new Set(options.map(d => d.date));

    const before = dutiesOf(S.to);
    const takes = S.shift.date.startsWith(month);
    const after = dutiesAfter(S.to, S.shift, mutual ? S.back : null);

    const grid = (duties, opts) => {
      const byDate = {};
      duties.filter(d => d.date.startsWith(month)).forEach(d => (byDate[d.date] = byDate[d.date] || []).push(d));
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const cells = [];
      for (let i2 = 0; i2 < 7; i2++) cells.push(`<div class="dow">${DOW[i2]}</div>`);
      for (let i2 = 0; i2 < first; i2++) cells.push('<div class="day pad"></div>');

      for (let d = 1; d <= days; d++) {
        const iso = isoOf(y, m, d);
        const mine = byDate[iso] || [];
        const cls = ['day'];
        let click = '', badge = '';

        if (schedule.isHolidayDate(iso, new Set())) cls.push('hol');
        if (iso < today) cls.push('past');

        if (opts.picker) {
          // choosing what I take in return
          if (mine.length && optionDates.has(iso)) { cls.push('pick', 'swappable'); click = ` data-date="${iso}"`; }
          else if (mine.length && iso >= today) { cls.push('blocked'); badge = 'لا يناسب جدولك'; }
          else if (mine.length) cls.push('gone');
          if (S.back && S.back.date === iso) cls.push('sel');
        } else if (opts.after) {
          if (iso === S.shift.date) { cls.push('added'); badge = 'مناوبة مضافة'; }
          else if (mutual && S.back && iso === S.back.date) { cls.push('removed'); badge = 'انتقلت إليك'; }
        }

        const tags = mine.map(x => `<span class="tag">${escapeHtml(x.cat)}</span>`).join('');
        cells.push(`<div class="${cls.join(' ')}"${click}><span class="dn">${d}</span>${tags}` +
          (badge ? `<span class="why">${escapeHtml(badge)}</span>` : '') + '</div>');
      }
      return `<div class="cal">${cells.join('')}</div>`;
    };

    const need = mutual && !S.back;
    host.innerHTML =
      '<div class="ba">' +
      `<div class="ba-side"><div class="ba-h"><span class="ba-t">قبل</span>` +
      `<span class="ba-n"><span class="num">${before.filter(d => d.date.startsWith(month)).length}</span> مناوبة</span></div>` +
      grid(before, { picker: mutual, after: false }) +
      (mutual ? `<div class="ba-note">${need ? 'اختر من مناوباته ما تأخذه أنت — الأخضر فقط متاح' : 'المناوبة المختارة بالأخضر الغامق'}</div>` : '') +
      '</div>' +
      `<div class="ba-side"><div class="ba-h"><span class="ba-t after">بعد</span>` +
      `<span class="ba-n"><span class="num">${after.filter(d => d.date.startsWith(month)).length}</span> مناوبة</span></div>` +
      grid(after, { picker: false, after: true }) +
      `<div class="ba-note">${takes ? 'المضافة بالأخضر' : 'المناوبة المضافة في شهر آخر'}${mutual && S.back ? ' · التي انتقلت إليك بالأحمر' : ''}</div>` +
      '</div></div>';
  }

  /* ---------------------------------------------------------- save as image */
  /**
   * Draws "قبل" and "بعد" onto a canvas and hands it to the resident as a PNG.
   * Everything is drawn by hand rather than screenshotted: no dependency, it
   * works offline and from file://, and the output stays legible on a phone.
   */
  function drawSchedule() {
    if (!S.to || !S.shift) return null;
    const month = S.months[S.m2];
    if (!month) return null;

    const [y, m] = month.split('-').map(Number);
    const mutual = S.kind === 'تبديل';
    const before = dutiesOf(S.to);
    const after = dutiesAfter(S.to, S.shift, mutual ? S.back : null);

    const PAD = 34, GAP = 7, COLS = 7, CELL_H = 74, DOW_H = 26;
    const W = 900;
    const cellW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const rows = Math.ceil((first + days) / COLS);
    const gridH = DOW_H + rows * (CELL_H + GAP);
    const HEAD = 118, SECT = 46, FOOT = 58;
    const H = HEAD + (SECT + gridH + 26) * 2 + FOOT;

    // Always 2×: the file is meant to be read on a phone, so it must stay
    // crisp even when the browser reports a 1× screen.
    const dpr = 2;
    const cv = document.createElement('canvas');
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.direction = 'rtl';
    c.textBaseline = 'top';

    const FONT = '"Cairo", "Segoe UI", system-ui, sans-serif';
    const font = (size, weight) => `${weight || 400} ${size}px ${FONT}`;
    const round = (x, yy, w, h, r) => {
      c.beginPath();
      c.moveTo(x + r, yy);
      c.arcTo(x + w, yy, x + w, yy + h, r);
      c.arcTo(x + w, yy + h, x, yy + h, r);
      c.arcTo(x, yy + h, x, yy, r);
      c.arcTo(x, yy, x + w, yy, r);
      c.closePath();
    };

    // background
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, W, H);

    // header
    c.fillStyle = '#1b5e43';
    c.fillRect(0, 0, W, 6);
    c.textAlign = 'right';
    c.fillStyle = '#14251d';
    c.font = font(27, 700);
    c.fillText(S.to.name, W - PAD, 30);
    c.fillStyle = '#5c6b64';
    c.font = font(15, 500);
    c.fillText(`جدول المناوبات — ${AR_MONTHS[m - 1]} ${y}`, W - PAD, 68);
    c.textAlign = 'left';
    c.font = font(13, 600);
    c.fillStyle = '#1b5e43';
    c.fillText(mutual ? 'تبديل متبادل' : 'شيل مناوبة', PAD, 34);
    c.fillStyle = '#5c6b64';
    c.font = font(12, 400);
    const gives = `${S.shift.cat} — ${fmt(S.shift.date)}`;
    c.fillText(mutual && S.back ? `${gives}  ⇄  ${S.back.cat} — ${fmt(S.back.date)}` : gives, PAD, 56);

    const grid = (list, top, isAfter) => {
      const byDate = {};
      list.filter(d => d.date.startsWith(month))
        .forEach(d => { (byDate[d.date] = byDate[d.date] || []).push(d); });

      c.textAlign = 'center';
      c.font = font(12, 700);
      c.fillStyle = '#5c6b64';
      for (let i = 0; i < COLS; i++) {
        const x = W - PAD - (i + 1) * cellW - i * GAP;
        c.fillText(DOW[i], x + cellW / 2, top + 5);
      }

      for (let d = 1; d <= days; d++) {
        const idx = first + d - 1;
        const col = idx % COLS, row = Math.floor(idx / COLS);
        const x = W - PAD - (col + 1) * cellW - col * GAP;
        const yy = top + DOW_H + row * (CELL_H + GAP);
        const iso = isoOf(y, m, d);
        const duties = byDate[iso] || [];
        const isAdded = isAfter && iso === S.shift.date;
        const isBack = isAfter && mutual && S.back && iso === S.back.date;
        const holiday = schedule.isHolidayDate(iso, new Set());

        let fill = '#ffffff', stroke = '#e3e8e5', dn = '#5c6b64';
        if (isAdded) { fill = '#e8f3ed'; stroke = '#1b5e43'; dn = '#14432f'; }
        else if (isBack) { fill = '#fdeeec'; stroke = '#c0392b'; dn = '#c0392b'; }
        else if (holiday) { fill = '#fdf6f5'; stroke = '#f3ddda'; dn = '#c0392b'; }

        round(x, yy, cellW, CELL_H, 9);
        c.fillStyle = fill; c.fill();
        c.strokeStyle = stroke; c.lineWidth = isAdded || isBack ? 2 : 1; c.stroke();

        c.textAlign = 'right';
        c.font = font(13, 700);
        c.fillStyle = dn;
        c.fillText(String(d), x + cellW - 8, yy + 6);

        c.textAlign = 'center';
        duties.slice(0, 2).forEach((duty, k) => {
          const ty = yy + 26 + k * 22;
          round(x + 5, ty, cellW - 10, 19, 5);
          c.fillStyle = isAdded ? '#1b5e43' : '#eef4f1'; c.fill();
          c.fillStyle = isAdded ? '#ffffff' : '#1b5e43';
          c.font = font(10.5, 700);
          let label = duty.cat || '';
          while (c.measureText(label).width > cellW - 16 && label.length > 3) label = label.slice(0, -1);
          if (label !== duty.cat) label = label.slice(0, -1) + '…';
          c.fillText(label, x + cellW / 2, ty + 3);
        });
        if (isAdded) {
          c.fillStyle = '#1b5e43'; c.font = font(9, 700);
          c.fillText('مضافة', x + cellW / 2, yy + CELL_H - 15);
        }
      }
    };

    const section = (label, count, top, accent) => {
      c.textAlign = 'right';
      c.font = font(17, 700);
      c.fillStyle = accent;
      c.fillText(label, W - PAD, top);
      c.font = font(13, 500);
      c.fillStyle = '#5c6b64';
      c.fillText(`${count} مناوبة في الشهر`, W - PAD - c.measureText(label).width - 90, top + 3);
      c.strokeStyle = accent; c.lineWidth = 2;
      c.beginPath(); c.moveTo(PAD, top + 30); c.lineTo(W - PAD, top + 30); c.stroke();
    };

    const inMonth = l => l.filter(d => d.date.startsWith(month)).length;
    let top = HEAD;
    section('قبل التبديل', inMonth(before), top, '#5c6b64');
    grid(before, top + SECT, false);
    top += SECT + gridH + 26;
    section('بعد التبديل', inMonth(after), top, '#1b5e43');
    grid(after, top + SECT, true);

    c.textAlign = 'center';
    c.font = font(11.5, 400);
    c.fillStyle = '#8b978f';
    c.fillText('قسم الأمراض الداخلية — مشفى حلب الجامعي · هذه صورة توضيحية، والجدول الرسمي هو المعتمد',
      W / 2, H - FOOT + 20);
    return cv;
  }

  /** Shows the drawn schedule so it can be checked, then saved. */
  function showImage() {
    const cv = drawSchedule();
    if (!cv) { toast('اختر المناوبة والطبيب أولاً', true); return; }

    const name = `مناوبات-${(S.to.name || '').replace(/\s+/g, '-')}-${S.months[S.m2]}.png`;
    const box = $('imgModal');
    const img = $('imgPreview');
    img.src = cv.toDataURL('image/png');
    img.alt = `جدول مناوبات ${S.to.name}`;
    box.hidden = false;
    document.body.style.overflow = 'hidden';

    $('imgSave').onclick = () => {
      cv.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('حُفظت الصورة');
      }, 'image/png');
    };
  }

  function closeImage() {
    $('imgModal').hidden = true;
    document.body.style.overflow = '';
    $('imgPreview').src = '';
  }

  function validateSend() {
    let ok = !!(S.from && S.to && S.shift) && keyOf(S.from) !== keyOf(S.to) && S.shift.date >= today;
    if (ok) {
      const mutual = S.kind === 'تبديل';
      const give = mutual && S.back ? S.back.date : null;
      ok = evaluate(S.to, S.shift.date, give).ok;
      if (ok && mutual) ok = !!S.back && evaluate(S.from, S.back.date, S.shift.date).ok;
    }
    const ready = ok && $('agree').checked && !!$('reason').value && $('phone').value.trim().length >= 6;
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
      // The department reads "نفس نوع المناوبة" as the same GROUP
      // (عنايات / إسعاف / أجنحة), not the exact category.
      conditions: (S.kind !== 'تبديل' || !S.back || S.back.group === S.shift.group) ? 'نعم' : 'لا',
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

    $('saveImg').addEventListener('click', showImage);
    $('imgClose').addEventListener('click', closeImage);
    $('imgModal').addEventListener('click', e => { if (e.target.id === 'imgModal') closeImage(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('imgModal').hidden) closeImage(); });

    $('cal2').addEventListener('click', e => {
      const cell = e.target.closest('.day[data-date]');
      if (!cell || S.kind !== 'تبديل') return;
      S.back = dutiesOf(S.to).find(d => d.date === cell.dataset.date) || null;
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

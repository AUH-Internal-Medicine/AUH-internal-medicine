/**
 * معلوماتي — the personal card: identity, cumulative counters, on-call
 * distribution, evaluation, rotation, the month calendar and the on-call list.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, splitNames, escapeHtml, exactNameMatch, smartSearch } = AUH.text;
  const { getDayName, getDayIndex, extractDate, daysSinceDate, nowStamp, formatDisplayDate } = AUH.dates;
  const { isJoined, getStatusBadgeClass } = AUH.status;
  const { mcn, showToast } = AUH.ui;
  const AM = AUH.constants.MONTH_NAMES;

  /** One request: its state, the counterpart, the dates and any note. */
  function requestCard(req, me) {
    const ST = AUH.data.swapRequests.STATUS;
    const meta = {
      [ST.approved]: { cls: 'ok', icon: 'fa-circle-check', label: 'تم' },
      [ST.rejected]: { cls: 'no', icon: 'fa-circle-xmark', label: 'مرفوض' },
      [ST.pending]: { cls: 'wait', icon: 'fa-hourglass-half', label: 'قيد المراجعة' }
    }[req.status];

    const mine = exactNameMatch(req.name, me.name) || exactNameMatch(req.abbr, me.abbr);
    const other = (mine ? req.toName : req.name) || '—';
    const mutual = (req.kind || '').indexOf('تبديل') >= 0;

    // Said the way a resident would say it, from their own side:
    //   شيل   → «شال عنك فلان» / «شلت عن فلان»
    //   تبديل → «بدّلت مع فلان»
    const headline = mutual
      ? `بدّلت مع <b>${escapeHtml(other)}</b>`
      : (mine ? `شال عنك <b>${escapeHtml(other)}</b>` : `شلت عن <b>${escapeHtml(other)}</b>`);

    // What leaves, and what comes back — always from this resident's side.
    const gave = { type: req.type, date: req.date };
    const got = mutual && req.backDate ? { type: req.backType, date: req.backDate } : null;
    const out = mine ? gave : got;
    const back = mine ? got : gave;

    const leg = (d, label, dir) => d && (d.type || d.date)
      ? `<div class="sr-leg ${dir}"><span class="sr-leg-l">${label}</span>` +
        `<span class="sr-leg-v">${escapeHtml(d.type || '—')}</span>` +
        `<span class="sr-leg-d">${escapeHtml(d.date || '')}</span></div>`
      : '';

    const note = req.notes
      ? `<div class="sr-note ${req.status === ST.rejected ? 'why' : ''}">` +
        (req.status === ST.rejected ? '<b>سبب الرفض:</b> ' : '') + escapeHtml(req.notes) + '</div>'
      : '';

    return `<article class="sr ${meta.cls}">` +
      `<header class="sr-top">` +
        `<span class="sr-badge"><i class="fas ${meta.icon}"></i>${meta.label}</span>` +
        `<span class="sr-with"><i class="fas fa-user-doctor"></i>${headline}</span>` +
        `<span class="sr-kind">${mutual ? 'تبديل' : 'شيل'}</span>` +
      `</header>` +
      `<div class="sr-legs">${leg(out, 'أعطيت', 'out')}${leg(back, 'أخذت', 'in')}</div>` +
      (req.reason ? `<div class="sr-reason"><i class="fas fa-quote-right"></i>${escapeHtml(req.reason)}</div>` : '') +
      note +
      (req.stamp ? `<footer class="sr-stamp">أُرسل ${escapeHtml(req.stamp)}</footer>` : '') +
      '</article>';
  }

  AUH.views.myInfo = {
    /**
     * Loads the swap-request sheet and shows this resident's own requests.
     * Failures are reported in place — never thrown at the page.
     */
    /**
     * Loads this resident's swap requests. Only the newest is shown; the rest
     * stay behind «عرض المزيد». Failures report in place, never thrown.
     */
    async loadSwapRequests(force) {
      const body = document.getElementById('swapTrackBody');
      const me = this.currentMyInfo;
      if (!body || !me) return;

      if (force) body.innerHTML = '<div class="swap-track-loading"><i class="fas fa-spinner fa-spin"></i> جاري التحديث…</div>';

      try {
        if (force || !this._swapCache) this._swapCache = await AUH.data.swapRequests.fetchAll();
        const cache = this._swapCache;
        const mine = AUH.data.swapRequests.forResident(cache.list, me.name, me.abbr);
        this._swapMine = mine;
        this._swapOpen = false;

        if (!mine.length) {
          body.innerHTML = '<div class="swap-track-empty"><i class="fas fa-inbox"></i>' +
            '<span>لا توجد لك طلبات تبديل بعد.</span></div>';
          return;
        }

        const ST = AUH.data.swapRequests.STATUS;
        const n = st => mine.filter(r => r.status === st).length;
        const pill = (cls, icon, count, label) => count
          ? `<span class="sw-pill ${cls}"><i class="fas ${icon}"></i>${count} ${label}</span>` : '';

        body.innerHTML =
          `<div class="swap-track-sum">${pill('ok', 'fa-circle-check', n(ST.approved), 'تم')}` +
          `${pill('wait', 'fa-hourglass-half', n(ST.pending), 'قيد المراجعة')}` +
          `${pill('no', 'fa-circle-xmark', n(ST.rejected), 'مرفوض')}</div>` +
          `<div class="sr-list" id="srList">${requestCard(mine[0], me)}</div>` +
          (mine.length > 1
            ? `<button type="button" class="sw-more" id="srMore" onclick="app.toggleSwapHistory()">` +
              `<i class="fas fa-chevron-down"></i> عرض الطلبات السابقة (${mine.length - 1})</button>`
            : '') +
          // Only worth explaining when nothing resolved: if the sheet's status
          // column (or its colours) answered, the box speaks for itself.
          (mine.some(r => r.statusSource !== 'none') ? '' :
            '<div class="swap-track-hint"><i class="fas fa-circle-info"></i> لم تُسجَّل حالة هذه الطلبات بعد. ' +
            'تُقرأ الحالة من عمود «الحالة» في جدول الطلبات، أو من ألوان الصفوف إن نُشر الجدول على الويب.</div>');
      } catch (err) {
        body.innerHTML = '<div class="swap-track-empty"><i class="fas fa-triangle-exclamation"></i>' +
          '<span>تعذّر تحميل الطلبات. تحقق من الاتصال ثم اضغط تحديث.</span></div>';
      }
    },

    /** Expands or collapses everything older than the newest request. */
    toggleSwapHistory() {
      const list = document.getElementById('srList');
      const btn = document.getElementById('srMore');
      const mine = this._swapMine || [];
      const me = this.currentMyInfo;
      if (!list || !btn || !me || mine.length < 2) return;

      this._swapOpen = !this._swapOpen;
      list.innerHTML = (this._swapOpen ? mine : mine.slice(0, 1)).map(r => requestCard(r, me)).join('');
      btn.innerHTML = this._swapOpen
        ? '<i class="fas fa-chevron-up"></i> إخفاء الطلبات السابقة'
        : `<i class="fas fa-chevron-down"></i> عرض الطلبات السابقة (${mine.length - 1})`;
    },

  searchMe(term) {
    const t = term.toLowerCase().trim();
    const rl = document.getElementById('searchResultsList');
    const rd = document.getElementById('myInfoResult');

    if (t.length < 1) {
      rl.innerHTML = '';
      rd.classList.remove('show');
      return;
    }

    const mt = this.res.filter(r => smartSearch(r.name + ' ' + r.abbr, t));
    if (!mt.length) {
      rl.innerHTML = '<div class="no-results"><i class="fas fa-magnifying-glass"></i> لا يوجد نتائج مطابقة.</div>';
      rd.classList.remove('show');
      return;
    }

    if (mt.length === 1) {
      rl.innerHTML = '';
      this.showMe(mt[0]);
    } else {
      this._sm = mt;
      rl.innerHTML = mt
        .map((m, i) => `<div class="search-result-item" onclick="app.selectMe(${i})"><span><strong>${m.name}</strong> (${m.abbr})</span><span style="color:var(--primary);">${m.spec}</span></div>`)
        .join('');
      rd.classList.remove('show');
    }
  },

  selectMe(i) {
    if (this._sm && this._sm[i]) {
      document.getElementById('searchResultsList').innerHTML = '';
      this.showMe(this._sm[i]);
    }
  },

  buildOncallCategoryBreakdown(list) {
    const counts = {};
    (list || []).forEach(o => {
      counts[o.cat] = (counts[o.cat] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  },

  renderMyInfoMonthBreakdown() {
    if (!this.currentMyInfoOncallStats) return '';

    const target = this.currentMyInfoOncallStats.monthTotal || [];
    const title = 'توزيع مناوبات هذا الشهر';
    if (!target.length) {
      return `<div class="myinfo-breakdown-box"><h4><i class="fas fa-chart-pie"></i> ${title}</h4><p>لا توجد بيانات لعرض التوزيع.</p></div>`;
    }

    return `<div class="myinfo-breakdown-box"><h4><i class="fas fa-chart-pie"></i> ${title}</h4><div class="myinfo-breakdown-grid">${target
      .map(([type, count]) => `<div class="myinfo-breakdown-item"><span>${type}</span><strong>${count}</strong></div>`)
      .join('')}</div></div>`;
  },

  /** Moves to the previous/next month that actually has on-calls. */
  stepMyInfoMonth(delta) {
    if (!this.currentMyInfo) return;
    const select = document.getElementById('myInfoMonthSelect');
    if (!select) return;
    const months = Array.from(select.options).map(o => o.value);
    const index = months.indexOf(this.myInfoMonthKey);
    const next = months[Math.min(months.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta))];
    if (next && next !== this.myInfoMonthKey) this.setMyInfoMonth(next);
  },

  setMyInfoMonth(key) {
    if (!this.currentMyInfo || !key) return;
    this.myInfoMonthKey = key;
    this.showMe(this.currentMyInfo, { keepScroll: true });
  },

  /**
   * العطل الرسمية — the holidays panel under the on-call section.
   * Shows this month's holidays first, then what is coming next, and flags the
   * ones the resident is actually on call for (those pay holiday hours).
   */
  /**
   * ساعات Bonus — hours credited from the "تعديل الساعات والبونص" sheet.
   * Shown per month (dated bonuses) and as an undated total, with the running
   * grand total, so the numbers in the statistics card can be traced back.
   */
  renderMyInfoBonus(doctorStats) {
    const total = doctorStats?.bonusHours || 0;
    if (!total) return '';

    const entries = (doctorStats.bonusEntries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const byMonth = Object.entries(doctorStats.bonusByMonth || {}).sort((a, b) => b[0].localeCompare(a[0]));
    const undated = entries.filter(b => !b.date).reduce((sum, b) => sum + b.hours, 0);

    const monthLabel = key => {
      const [year, month] = key.split('-');
      return `${AM[Math.max(0, parseInt(month, 10) - 1)] || key} ${year}`;
    };

    const monthRows = byMonth
      .map(
        ([key, hours]) =>
          `<div class="bonus-row"><span class="bonus-month">${escapeHtml(monthLabel(key))}</span>` +
          `<span class="bonus-hours">${this.formatNumDisplay(hours)} ساعة</span></div>`
      )
      .join('');

    const undatedRow = undated
      ? `<div class="bonus-row"><span class="bonus-month">Bonus غير مؤرّخ</span><span class="bonus-hours">${this.formatNumDisplay(undated)} ساعة</span></div>`
      : '';

    return (
      `<div class="collapsible-section bonus-section"><button class="collapsible-btn open" onclick="toggleCollapsible(this)">` +
        `<span><i class="fas fa-gift"></i> ساعات Bonus (${this.formatNumDisplay(total)} ساعة)</span><i class="fas fa-chevron-down"></i></button>` +
        `<div class="collapsible-content show">` +
          `<div class="bonus-total"><i class="fas fa-gift"></i> إجمالي Bonus: <strong>${this.formatNumDisplay(total)}</strong> ساعة` +
          (doctorStats.bonusCompleted !== total ? ` <span class="bonus-pending">(المحتسب حتى الآن: ${this.formatNumDisplay(doctorStats.bonusCompleted)})</span>` : '') +
          `</div>` +
          `<div class="bonus-list">${monthRows}${undatedRow}</div>` +
          `<div class="holiday-note"><i class="fas fa-circle-info"></i> ساعات Bonus مضافة إلى ساعاتك الإجمالية وإلى ترتيبك في الإحصائيات.</div>` +
        `</div></div>`
    );
  },

  renderMyInfoHolidays(monthOncalls) {
    // Shown only when the selected month actually contains an official holiday —
    // an empty "no holidays this month" panel on every card is just noise.
    const monthHolidays = this.getHolidaysInMonth(this.myInfoMonthKey);
    if (!monthHolidays.length) return '';
    const upcoming = this.holidaysModel.upcoming(this.today, 3).filter(h => !monthHolidays.some(m => m.date === h.date));

    const onCallDates = new Set((monthOncalls || []).map(o => o.date));

    const card = (holiday, muted) => {
      const isPast = holiday.date < this.today;
      const isToday = holiday.date === this.today;
      const onCall = onCallDates.has(holiday.date);
      const badges =
        (isToday ? '<span class="holiday-chip today">اليوم</span>' : '') +
        (onCall ? '<span class="holiday-chip oncall"><i class="fas fa-user-doctor"></i> لديك مناوبة</span>' : '') +
        (isPast && !isToday ? '<span class="holiday-chip past">مضت</span>' : '');

      return (
        `<div class="holiday-item${muted ? ' upcoming' : ''}${isPast && !isToday ? ' is-past' : ''}${onCall ? ' has-oncall' : ''}">` +
          `<div class="holiday-icon"><i class="fas fa-star"></i></div>` +
          `<div class="holiday-body">` +
            `<div class="holiday-name">${escapeHtml(holiday.name)}</div>` +
            `<div class="holiday-date"><span dir="ltr">${escapeHtml(holiday.date)}</span> · ${escapeHtml(holiday.day || getDayName(holiday.date))}</div>` +
          `</div>` +
          `<div class="holiday-chips">${badges}</div>` +
        `</div>`
      );
    };

    const monthPart = `<div class="holiday-list">${monthHolidays.map(h => card(h, false)).join('')}</div>`;

    const upcomingPart = upcoming.length
      ? `<div class="holiday-subtitle"><i class="fas fa-forward"></i> العطل القادمة</div>` +
        `<div class="holiday-list">${upcoming.map(h => card(h, true)).join('')}</div>`
      : '';

    return (
      `<div class="collapsible-section holidays-section"><button class="collapsible-btn open" onclick="toggleCollapsible(this)">` +
        `<span><i class="fas fa-star"></i> العطل الرسمية (${monthHolidays.length})</span><i class="fas fa-chevron-down"></i></button>` +
        `<div class="collapsible-content show">${monthPart}${upcomingPart}` +
        `<div class="holiday-note"><i class="fas fa-circle-info"></i> مناوبات هذه الأيام تُحسب بتوقيت ومدة العطلة تلقائياً.</div>` +
        `</div></div>`
    );
  },

  renderMyInfoMonthCalendar(monthOncalls, monthKey) {
    const parts = String(monthKey || this.today.slice(0, 7)).split('-');
    const yr = parseInt(parts[0], 10);
    const mo = parseInt(parts[1], 10) - 1;
    const dim = new Date(yr, mo + 1, 0).getDate();
    const fd = new Date(yr, mo, 1).getDay();
    const afd = fd === 0 ? 6 : fd - 1;
    const dns = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

    const byDate = {};
    (monthOncalls || []).forEach(o => {
      if (!byDate[o.date]) byDate[o.date] = [];
      if (!byDate[o.date].includes(o.cat)) byDate[o.date].push(o.cat);
    });

    let h = `<div class="myinfo-month-calendar"><div class="calendar-header"><h3><i class="fas fa-calendar-days"></i> رزنامة مناوبات ${AM[mo]}</h3></div><div class="calendar-grid">`;
    dns.forEach((d, i) => {
      h += `<div class="calendar-day-header${i === 4 || i === 5 ? ' weekend' : ''}">${d}</div>`;
    });

    for (let i = 0; i < afd; i++) h += '<div class="calendar-day empty"></div>';

    for (let day = 1; day <= dim; day++) {
      const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(yr, mo, day);
      const di = d.getDay();
      const isToday = ds === this.today;
      const isPast = ds < this.today;
      const cats = byDate[ds] || [];
      const hasOncall = cats.length > 0;

      const holidayName = this.getHolidayName(ds);

      let cls = 'calendar-day';
      if (isToday) cls += ' today';
      if (isPast && !isToday) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';
      if (holidayName) cls += ' official-holiday';
      if (hasOncall) cls += ' has-oncall';

      // Dot indicators instead of text labels
      let dotsHtml = '';
      if (hasOncall) {
        const dotColors = ['#2f7d5c', '#1b3a5c', '#d4a24c', '#c06b4a', '#4f9d7a'];
        const maxDots = Math.min(cats.length, 4);
        dotsHtml = '<div class="calendar-day-dots">';
        for (let ci = 0; ci < maxDots; ci++) {
          dotsHtml += `<span class="calendar-day-dot" style="background:${dotColors[ci % dotColors.length]}"></span>`;
        }
        if (cats.length > 4) {
          dotsHtml += `<span class="calendar-day-dot-more">+${cats.length - 4}</span>`;
        }
        dotsHtml += '</div>';
      }

      const click = hasOncall ? `onclick="app.focusMyInfoOncallDate('${ds}')"` : '';
      const tip = [holidayName, cats.join('، ')].filter(Boolean).join(' — ');
      const datatipAttr = tip ? `data-tip="${this.escapeHtml(tip)}" title="${this.escapeHtml(tip)}"` : '';
      const holidayMark = holidayName ? `<span class="calendar-holiday-star"><i class="fas fa-star"></i></span>` : '';
      h += `<div class="${cls}${this.myInfoFocusedOncallDate === ds ? ' selected-day' : ''}" data-date="${ds}" ${click} ${datatipAttr}>${day}${holidayMark}${dotsHtml}</div>`;
    }

    h += '</div></div>';
    return h;
  },

  focusMyInfoOncallDate(dateIso) {
    this.myInfoFocusedOncallDate = dateIso;
    document.querySelectorAll('#myInfoContent .calendar-day[data-date]').forEach(day => {
      day.classList.toggle('selected-day', day.getAttribute('data-date') === dateIso);
    });

    const rows = Array.from(document.querySelectorAll('#myInfoOncallsList .oncall-info-row'));
    if (!rows.length) return;

    const matches = rows.filter(r => r.getAttribute('data-oncall-date') === dateIso);
    if (!matches.length) {
      showToast('لا توجد بطاقة مناوبة لهذا اليوم في القائمة الحالية.');
      return;
    }

    rows.forEach(r => r.classList.remove('myinfo-row-focus'));
    matches.forEach(r => r.classList.add('myinfo-row-focus'));
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => matches.forEach(r => r.classList.remove('myinfo-row-focus')), 1900);
  },

  /**
   * Year-2 colleagues on the same date, for a Year-1 category.
   * Category names are compared Arabic-normalized against the mapping in
   * domain/oncall-schedule.js, so a renamed/re-spaced Year-2 column still matches.
   */
  getYear2ColleaguesForDate(dateIso, year1Category) {
    const targets = AUH.domain.oncallSchedule.year2CategoriesFor(year1Category).map(normAr);
    if (!targets.length || !this.oncHeaders2.length) return [];

    const row = this.oncall2Model.getRow(dateIso);
    if (!row) return [];

    const names = [];
    for (let col = 2; col < this.oncHeaders2.length; col++) {
      const category = normAr(this.oncHeaders2[col] || '');
      if (!category || !targets.includes(category)) continue;
      splitNames((row.row[col] || '').trim()).forEach(n => {
        if (n && !names.includes(n)) names.push(n);
      });
    }
    return names;
  },

  showMe(r, options) {
    const opts = options || {};
    const keepScroll = opts.keepScroll ? window.scrollY : null;
    const rd = document.getElementById('myInfoResult');
    if (!rd) return;

    const ok = isJoined(r.st);
    this.currentMyInfo = r;

    const allOncalls = [];
    for (const onc of this.oncRows) {
      for (let col = 2; col < this.oncHeaders.length; col++) {
        const cc = (onc.row[col] || '').trim();
        if (!cc) continue;
        const names = splitNames(cc);
        if (!names.length) continue;

        const found = names.some(n => exactNameMatch(n, r.abbr) || exactNameMatch(n, r.name));
        if (!found) continue;

        const cn = this.oncHeaders[col] || 'أخرى';
        const colleagues = this.getColleaguesForDateCategory(onc.date, cn, r.abbr);

        const schedule = this.getCategorySchedule(cn, onc.date);
        const overrideKey = `${onc.date}|${r.abbr}|${normAr(cn)}`;
        if (schedule && this.adjustmentOverrides.has(overrideKey)) {
          schedule.duration = `${this.formatNumDisplay(this.adjustmentOverrides.get(overrideKey))} ساعة`;
          schedule.isAdjusted = true;
        }
        const year2Colleagues = this.getYear2ColleaguesForDate(onc.date, cn);
        allOncalls.push({
          date: onc.date,
          day: onc.day || getDayName(onc.date),
          dayIdx: getDayIndex(onc.date),
          cat: cn,
          colleagues,
          year2Colleagues,
          schedule
        });
      }
    }

    this.adjustmentAdditions
      .filter(a => a.abbr === r.abbr || a.name === r.name)
      .forEach(a => {
        const colleagues = this.getColleaguesForDateCategory(a.date, a.category, r.abbr);
        allOncalls.push({
          date: a.date,
          day: getDayName(a.date),
          dayIdx: getDayIndex(a.date),
          cat: a.category,
          colleagues,
          year2Colleagues: this.getYear2ColleaguesForDate(a.date, a.category),
          schedule: { isHoliday: this.isHolidayDate(a.date), time: '', duration: `${this.formatNumDisplay(a.hours)} ساعة`, isAdjusted: true, isVolunteer: true }
        });
      });

    allOncalls.sort((a, b) => a.date.localeCompare(b.date));

    const firstOncallDate = allOncalls.length ? allOncalls[0].date : '-';
    const lastOncallDate = allOncalls.length ? allOncalls[allOncalls.length - 1].date : '-';

    const oncallMonths = [...new Set(allOncalls.map(o => o.date.slice(0, 7)))].sort();
    if (!oncallMonths.includes(this.myInfoMonthKey)) this.myInfoMonthKey = oncallMonths.includes(this.today.slice(0, 7)) ? this.today.slice(0, 7) : oncallMonths[0] || this.today.slice(0, 7);

    const monthOncalls = allOncalls.filter(o => o.date.slice(0, 7) === this.myInfoMonthKey).sort((a, b) => a.date.localeCompare(b.date));

    // What the PNG exports render from (see views/capture-layouts.js).
    this._myInfoExport = { resident: r, monthKey: this.myInfoMonthKey, monthOncalls, allOncalls };
    const monthDone = monthOncalls.filter(o => o.date < this.today);
    const monthRemaining = monthOncalls.filter(o => o.date >= this.today);
    const visibleCounts = {};
    monthOncalls.forEach(o => {
      visibleCounts[o.cat] = (visibleCounts[o.cat] || 0) + 1;
    });
    const totVisible = monthOncalls.length;

    this.currentMyInfoOncallStats = {
      monthTotal: this.buildOncallCategoryBreakdown(monthOncalls),
      monthDone: this.buildOncallCategoryBreakdown(monthDone),
      monthRemaining: this.buildOncallCategoryBreakdown(monthRemaining)
    };

    const ts = nowStamp();

    const evalInfo = this.getEvalForResident(r.name, r.abbr);
    const doctorStats = this.getDoctorStatsForResident(r.name, r.abbr);
    const cumDetails = this.buildOncallCategoryBreakdown(allOncalls);
    const catDates = doctorStats?.catDates || {};
    const joinDateIso = extractDate(r.join) || extractDate(doctorStats?.join) || '';
    const joinDays = daysSinceDate(joinDateIso);
    const miUid = (r.abbr || r.name || '').replace(/[^a-zA-Z0-9أ-ي]/g, '_');

    if (!monthOncalls.find(o => o.date === this.myInfoFocusedOncallDate)) {
      this.myInfoFocusedOncallDate = monthOncalls[0]?.date || '';
    }

    const bonusTotal = doctorStats?.bonusHours || 0;
    const bonusDone = doctorStats?.bonusCompleted || 0;
    const bonusByMonth = doctorStats?.bonusByMonth || {};
    const bonusThisMonth = bonusByMonth[this.myInfoMonthKey] || 0;
    const bonusUndated = (doctorStats?.bonusEntries || []).filter(b => !b.date).reduce((a, b) => a + b.hours, 0);

    const cumTotal = doctorStats?.total ?? allOncalls.length;
    const cumHours = doctorStats?.hoursTotal ?? 0;
    const doneTotal = doctorStats?.completed ?? allOncalls.filter(o => o.date < this.today).length;
    const doneHours = doctorStats?.hoursCompleted ?? 0;

    let h = `<div id="myInfoContent" style="padding:8px;"><div class="myinfo-profile-head"><div class="myinfo-heading-row"><h3><i class="fas fa-user"></i> ${r.name}</h3><span class="myinfo-heading-abbr">(${this.escapeHtml(r.abbr || '-')})</span><span class="myinfo-heading-seq">#${this.escapeHtml(String(r.seq || '-'))}</span></div></div><div class="myinfo-top-stats myinfo-top-stats-3"><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${this.formatNumDisplay(cumTotal)}</div><div class="cum-lbl">المناوبات التراكمية</div><div class="cum-sub">${this.formatNumDisplay(cumHours)} ساعة</div>${bonusTotal ? `<div class="cum-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(bonusTotal)} ساعة Bonus</div>` : ''}</div><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${this.formatNumDisplay(doneTotal)}</div><div class="cum-lbl">المناوبات التي تمّت</div><div class="cum-sub">${this.formatNumDisplay(doneHours)} ساعة</div>${bonusDone ? `<div class="cum-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(bonusDone)} ساعة Bonus</div>` : ''}</div><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${joinDays ?? 0}</div><div class="cum-lbl">عدد الأيام منذ الالتحاق</div></div></div><div class="myinfo-breakdown-box"><h4><i class="fas fa-list"></i> توزيع المناوبات التراكمية</h4>${cumDetails.length ? `<div class="myinfo-breakdown-grid">${cumDetails.map(([k, v], idx) => {
      const dates = (catDates[k] || []).slice().sort();
      const detId = `miCatDates-${miUid}-${idx}`;
      return `<button type="button" class="myinfo-breakdown-item" onclick="toggleCollapsible(this)"><span>${this.escapeHtml(k)}</span><strong>${v}</strong></button><div class="collapsible-content myinfo-breakdown-detail" id="${detId}">${dates.length ? dates.map(d => `<span class="dsc-detail-chip">${d}</span>`).join('') : '<span class="dsc-detail-empty">لا توجد تواريخ</span>'}</div>`;
    }).join('')}</div>` : '<p>لا توجد بيانات لعرض التوزيع.</p>'}</div>`;

    h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-circle-info"></i> معلومات إضافية</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid"><div class="info-item"><div class="info-label">الاسم</div><div class="info-value">${r.name}</div></div><div class="info-item"><div class="info-label">الاختصار</div><div class="info-value">${r.abbr || '-'}</div></div><div class="info-item"><div class="info-label">الرقم التسلسلي</div><div class="info-value">#${r.seq || '-'}</div></div><div class="info-item"><div class="info-label">الاختصاص</div><div class="info-value">${r.spec}</div></div><div class="info-item"><div class="info-label">الهاتف</div><div class="info-value"><span dir="ltr">${r.phone}</span> <button class="copy-btn" onclick="copyPhone('${r.phone}',this)"><i class="fas fa-copy"></i></button></div></div><div class="info-item"><div class="info-label">تاريخ الالتحاق</div><div class="info-value">${formatDisplayDate(r.join) || '-'}</div></div><div class="info-item"><div class="info-label">الحالة</div><div class="info-value"><span class="status-badge ${ok ? 'status-joined' : getStatusBadgeClass(r.st)}">${ok ? '<i class="fas fa-circle-check"></i>' : '<i class="fas fa-hourglass-half"></i>'} ${r.st || 'غير محدد'}</span></div></div></div></div></div>`;

    if (evalInfo) {
      h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-chart-line"></i> التقييم السنوي</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid">`;
      for (const skill of evalInfo.skills) h += `<div class="info-item"><div class="info-label">${skill.label}</div><div class="info-value">${skill.value}</div></div>`;
      h += `</div>`;
      if (evalInfo.praise && evalInfo.praise.trim()) h += `<div style="margin-top:10px;padding:10px 14px;background:var(--primary-soft);border-radius:10px;border-inline-start:4px solid var(--primary);"><strong style="color:var(--primary);"><i class="fas fa-star"></i> الثناءات:</strong><br><span style="font-weight:600;color:var(--primary);">${evalInfo.praise}</span></div>`;
      if (evalInfo.penalty && evalInfo.penalty.trim()) h += `<div style="margin-top:6px;padding:10px 14px;background:var(--signal-soft);border-radius:10px;border-inline-start:4px solid var(--signal);"><strong style="color:var(--signal);"><i class="fas fa-triangle-exclamation"></i> العقوبات:</strong><br><span style="font-weight:600;color:var(--signal);">${evalInfo.penalty}</span></div>`;
      h += `<div class="stat-card" style="margin-top:10px;"><div class="stat-num">${evalInfo.total}</div><div class="stat-lbl">المحصلة الاجمالية</div></div></div></div>`;
    }

    if (doctorStats) {
      h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-chart-column"></i> احصائيات المناوبات</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="myinfo-stat-card-wrap">${this.doctorStatCardHtml(doctorStats)}</div></div></div>`;
    }

    const allMonths = this.getAllShiftMonths();
    const cm = this.getPreferredShiftMonth();
    h += `<div class="collapsible-section"><button class="collapsible-btn open" onclick="toggleCollapsible(this)"><span><i class="fas fa-clipboard-list"></i> الفرز</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content show">`;
    if (allMonths.length > 0) {
      h += `<div style="margin-bottom:12px;"><select class="month-selector" id="myInfoShiftMonth" onchange="app.updateMyInfoShift('${r.name.replace(/'/g, "\\'")}', '${r.abbr.replace(/'/g, "\\'")}')">${allMonths.map(m => `<option value="${m.month}"${m.month === cm ? ' selected' : ''}>${m.label || 'فرز شهر ' + m.month}</option>`).join('')}</select></div><div id="myInfoShiftContent"></div>`;
    } else {
      h += '<p style="color:var(--text-secondary);">لا توجد بيانات فروز.</p>';
    }
    h += '</div></div>';

    h += `<div class="collapsible-section"><button class="collapsible-btn open" onclick="toggleCollapsible(this)"><span><i class="fas fa-calendar-days"></i> المناوبات (${totVisible})</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content show">`;

    if (allOncalls.length) {
      const monthIndex = oncallMonths.indexOf(this.myInfoMonthKey);
      const prevDisabled = monthIndex <= 0 ? ' disabled' : '';
      const nextDisabled = monthIndex < 0 || monthIndex >= oncallMonths.length - 1 ? ' disabled' : '';

      h += `<div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div><div class="myinfo-calendar-controls"><label class="myinfo-month-label" for="myInfoMonthSelect">الشهر</label><span class="month-stepper"><button type="button" class="cal-nav-btn" aria-label="الشهر السابق" title="الشهر السابق"${prevDisabled} onclick="app.stepMyInfoMonth(-1)"><i class="fas fa-chevron-right"></i></button><select class="month-selector" id="myInfoMonthSelect" onchange="app.setMyInfoMonth(this.value)">${oncallMonths
        .map(m => {
          const p = m.split('-');
          const y = p[0] || '';
          const mi = Math.max(0, parseInt(p[1] || '1', 10) - 1);
          const lbl = `${AM[mi] || m} ${y}`;
          return `<option value="${m}"${m === this.myInfoMonthKey ? ' selected' : ''}>${lbl}</option>`;
        })
        .join('')}</select><button type="button" class="cal-nav-btn" aria-label="الشهر التالي" title="الشهر التالي"${nextDisabled} onclick="app.stepMyInfoMonth(1)"><i class="fas fa-chevron-left"></i></button></span><button type="button" class="download-btn download-btn-inline" onclick="app.downloadMyInfoCalendarImage(this)"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل الرزنامة كصورة</button></div>`;

      // Only shown when this particular month actually has bonus hours.
      const bonusCard = bonusThisMonth
        ? `<div class="stat-card myinfo-static-stat myinfo-bonus-box"><div class="stat-num">${this.formatNumDisplay(bonusThisMonth)}</div><div class="stat-lbl"><i class="fas fa-gift"></i> ساعات Bonus هذا الشهر</div></div>`
        : '';
      h += `<div class="myinfo-monthly-stats-grid"><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthOncalls.length}</div><div class="stat-lbl">عدد مناوبات الشهر</div></div><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthDone.length}</div><div class="stat-lbl">عدد المناوبات التي تمت</div></div><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthRemaining.length}</div><div class="stat-lbl">عدد المناوبات المتبقية</div></div>${bonusCard}</div>`;

      h += this.renderMyInfoMonthBreakdown();
      h += this.renderMyInfoMonthCalendar(monthOncalls, this.myInfoMonthKey);

      h += '<div id="myInfoOncallsList">';

      monthOncalls.forEach((o, idx) => {
        const we = this.isHolidayDate(o.date);
        const sch = o.schedule;
        const isPast = o.date < this.today;
        const rowId = `myInfoOncall-${o.date}-${idx}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        h += `<div class="oncall-info-row${we ? ' holiday' : ''}${isPast ? ' past done' : ''}" id="${rowId}" data-oncall-date="${o.date}"><div class="oc-header"><span class="oc-date${we ? ' weekend' : ''}">${we ? '<span class="day-dot holiday"></span>' : ''}<i class="fas fa-calendar-day"></i> ${o.date} - ${o.day}${we ? '<span class="oncall-holiday-badge">عطلة</span>' : ''}</span><span class="oc-type">${o.cat}${isPast ? ' <span class="oncall-done-badge"><i class="fas fa-check"></i> تم</span>' : ''}${sch && sch.isVolunteer ? ' <span class="oncall-volunteer-badge"><i class="fas fa-hand-holding-heart"></i> تطوعية</span>' : sch && sch.isAdjusted ? ' <span class="oncall-adjusted-badge"><i class="fas fa-pen"></i> ساعات معدّلة</span>' : ''}</span></div>`;
        if (sch && (sch.time || sch.duration)) h += `<div class="myinfo-oncall-meta${sch.isHoliday ? ' holiday' : ''}"><span><i class="fas fa-clock"></i> ${sch.time || '-'}</span><span><i class="fas fa-hourglass-half"></i> ${sch.duration || '-'}</span></div>`;
        if (o.colleagues.length) h += `<div class="colleague-row"><span class="cl-label"><i class="fas fa-users"></i> الزملاء:</span><span class="cl-names">${o.colleagues.map((c, i) => `${i > 0 ? '<span class="cl-sep"> - </span>' : ''}${mcn(c.name, c.phone, c.abbr)}`).join('')}</span></div>`;
        if (o.year2Colleagues && o.year2Colleagues.length) h += `<div class="colleague-row colleague-row-y2"><span class="cl-label"><i class="fas fa-user-graduate"></i> السنة الثانية:</span><span class="cl-names">${o.year2Colleagues.map((n, i) => `${i > 0 ? '<span class="cl-sep"> - </span>' : ''}${this.escapeHtml(n)}`).join('')}</span></div>`;
        h += '</div>';
      });
      h += '</div>';
    } else h += '<p style="color:var(--text-secondary);">لا توجد مناوبات مسجلة.</p>';

    h += '</div></div>';

    h += this.renderMyInfoBonus(doctorStats);
    h += this.renderMyInfoHolidays(monthOncalls);
    h += `<button class="download-btn" onclick="app.downloadMyInfoImage(this)"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل الرزنامة والتفاصيل كصورة</button>`;

    // Swap request — opens the dedicated page with this doctor already filled in.
    const who = encodeURIComponent(r.abbr || r.name);
    h += `<a class="swap-cta" href="swap.html?from=${who}" target="_blank" rel="noopener">` +
      `<span class="swap-cta-icon"><i class="fas fa-right-left"></i></span>` +
      `<span class="swap-cta-text"><b>طلب تبديل أو شيل مناوبة</b>` +
      `<span class="swap-cta-note">اختر المناوبة من رزنامتك، وسيعرض النظام من يستطيع أخذها</span></span>` +
      `<span class="swap-cta-go"><i class="fas fa-chevron-left"></i></span></a>`;

    // Request tracking — filled in asynchronously by loadSwapRequests().
    h += `<div class="swap-track" id="swapTrack"><div class="swap-track-head">` +
      `<h4><i class="fas fa-list-check"></i> متابعة طلبات التبديل</h4>` +
      `<button type="button" class="swap-refresh" onclick="app.loadSwapRequests(true)" title="تحديث">` +
      `<i class="fas fa-rotate"></i></button></div>` +
      `<div id="swapTrackBody"><div class="swap-track-loading"><i class="fas fa-spinner fa-spin"></i> جاري تحميل طلباتك...</div></div></div></div>`;
    // the sheet read happens once this HTML is in the DOM
    setTimeout(() => this.loadSwapRequests(false), 0);

    rd.innerHTML = h;
    rd.classList.add('show');
    document.getElementById('searchResultsList').innerHTML = '';

    this.updateMyInfoShift(r.name, r.abbr);
    if (keepScroll !== null) window.scrollTo(0, keepScroll);
  },

  /**
   * The "الفرز" section inside معلوماتي: the resident's rotation for the chosen
   * month plus everyone else in the same rotation.
   */
  updateMyInfoShift(name, abbr) {
    const container = document.getElementById('myInfoShiftContent');
    const select = document.getElementById('myInfoShiftMonth');
    if (!container || !select) return;

    const month = parseInt(select.value, 10);
    const model = this.residentsModel;
    const hasColumn = model.getShiftMonths().some(m => m.month === month);

    if (!hasColumn || model.isFutureMonthAutoCopy(month, this.m + 1)) {
      container.innerHTML = '<p style="color:var(--text-secondary);">لا توجد بيانات لهذا الشهر.</p>';
      return;
    }

    const me = model.findByNameOrAbbr(abbr) || model.findByNameOrAbbr(name);
    const shiftName = model.getShift(me, month);

    const members = shiftName
      ? (model.groupByShift(month, { joinedOnly: true })[shiftName] || []).filter(
          m => !exactNameMatch(m.abbr, abbr) && !exactNameMatch(m.name, name)
        )
      : [];

    let html = shiftName
      ? `<div class="shift-card-full" style="margin-bottom:10px;"><h3>${escapeHtml(shiftName)}</h3></div>`
      : '<p style="color:var(--text-secondary);margin-bottom:10px;">لا يوجد فرز للشهر المحدد.</p>';

    if (members.length) {
      const list = members.map(m => `<li>${mcn(m.name, m.phone, m.abbr)}</li>`).join('');
      html += `<div class="names-dropdown" style="margin-top:8px;"><button class="names-dropdown-btn"><span><i class="fas fa-users"></i> الزملاء في نفس الفرز (${members.length})</span><i class="fas fa-chevron-down"></i></button><ul class="names-dropdown-content">${list}</ul></div>`;
    }

    container.innerHTML = html;
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

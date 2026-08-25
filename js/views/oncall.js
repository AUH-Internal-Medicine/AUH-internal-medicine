/**
 * المناوبات — month calendar, per-day breakdown, the raw table modal and the
 * Year-1 / Year-2 filter.
 *
 * The day view reads the canonical on-call model (`this.oncHeaders` / `this.oncRows`,
 * where index 0 is the day name, 1 the ISO date and 2+ are duty categories), so it
 * treats both years identically.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, splitNames, escapeHtml } = AUH.text;
  const { getDayName, nowStamp } = AUH.dates;
  const { mcn } = AUH.ui;
  const AM = AUH.constants.MONTH_NAMES;

  AUH.views.oncall = {
  getOncRow(ds) {
    return this.oncRows.find(r => r.date === ds) || null;
  },

  /** Previous / next month from the arrows next to the month selector. */
  stepOncallMonth(delta) {
    const selector = document.getElementById('monthSelector');
    if (!selector) return;
    const next = (parseInt(selector.value, 10) + delta + 12) % 12;
    selector.value = next;
    this.changeMonth();
  },

  changeMonth() {
    this.currentDisplayMonth = parseInt(document.getElementById('monthSelector').value, 10);
    const yr = parseInt(this.today.split('-')[0], 10);
    this.selectedOncallDate = `${yr}-${String(this.currentDisplayMonth + 1).padStart(2, '0')}-01`;
    document.getElementById('oncallDatePicker').value = this.selectedOncallDate;
    document.getElementById('oncallMonthTitle').textContent = this.currentDisplayMonth + 1;
    this.renderMonthlyCalendar();
    this.showOncallDate(this.selectedOncallDate);
  },

  selectDayFromCalendar() {
    const v = document.getElementById('oncallDatePicker').value;
    if (!v) return;

    const m = parseInt(v.split('-')[1], 10) - 1;
    this.selectedOncallDate = v;

    if (m !== this.currentDisplayMonth) {
      this.currentDisplayMonth = m;
      document.getElementById('monthSelector').value = m;
      document.getElementById('oncallMonthTitle').textContent = m + 1;
    }

    this.renderMonthlyCalendar();
    this.showOncallDate(v);

    setTimeout(() => {
      const el = document.getElementById('oncallDayDisplay');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  },

  clickCalendarDay(ds) {
    document.getElementById('oncallDatePicker').value = ds;
    this.selectedOncallDate = ds;
    this.selectDayFromCalendar();
  },

  renderMonthlyCalendar() {
    const container = document.getElementById('monthlyCalendar');
    if (!container) return;

    const yr = parseInt(this.today.split('-')[0], 10);
    const mo = this.currentDisplayMonth;
    const dim = new Date(yr, mo + 1, 0).getDate();
    const fd = new Date(yr, mo, 1).getDay();
    const afd = fd === 0 ? 6 : fd - 1;
    const dns = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

    const tn = parseInt(this.today.split('-')[2], 10);
    const tm = parseInt(this.today.split('-')[1], 10) - 1;

    let h = `<div class="monthly-calendar"><div class="calendar-header"><h3><i class="fas fa-calendar-days"></i> ${AM[mo]} ${yr}</h3></div><div class="calendar-grid">`;
    dns.forEach((d, i) => {
      h += `<div class="calendar-day-header${i === 4 || i === 5 ? ' weekend' : ''}">${d}</div>`;
    });

    for (let i = 0; i < afd; i++) h += '<div class="calendar-day empty"></div>';

    for (let day = 1; day <= dim; day++) {
      const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(yr, mo, day);
      const di = d.getDay();
      const it = day === tn && mo === tm;
      const sel = ds === this.selectedOncallDate;
      const pa = ds < this.today;

      const hasVolunteer = this.adjustmentAdditions.some(a => a.date === ds);
      const holidayName = this.getHolidayName(ds);

      let cls = 'calendar-day';
      if (it) cls += ' today';
      if (sel) cls += ' selected-day';
      if (pa && !sel) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';
      if (holidayName) cls += ' official-holiday';
      if (hasVolunteer) cls += ' has-volunteer';

      const holidayMark = holidayName
        ? `<span class="calendar-holiday-star" title="${escapeHtml(holidayName)}"><i class="fas fa-star"></i></span>` +
          `<span class="calendar-holiday-name">${escapeHtml(holidayName)}</span>`
        : '';

      h += `<div class="${cls}" onclick="app.clickCalendarDay('${ds}')"${holidayName ? ` title="${escapeHtml(holidayName)}"` : ''}>${day}${holidayMark}${hasVolunteer ? '<span class="calendar-volunteer-dot" title="مناوبة تطوعية إضافية"></span>' : ''}</div>`;
    }

    h += '</div></div>';
    container.innerHTML = h;
  },

  formatOncallRawDateCell(v) {
    const s = String(v || '').trim();
    if (!s) return '';

    const dm = s.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (dm) {
      const y = parseInt(dm[1], 10);
      const m = parseInt(dm[2], 10) + 1;
      const d = parseInt(dm[3], 10);
      return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    }

    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[1]}/${iso[2]}/${iso[3]}`;

    return s;
  },

  formatOncallRawNamesCell(v) {
    const s = String(v || '').trim();
    if (!s) return '';

    const parts = s
      .split(/[\n\r]+|[،,;؛]+/)
      .map(x => x.trim())
      .filter(Boolean);

    if (parts.length <= 1) return s;
    return parts.join('، ');
  },

  getOncallRawLastUsedCol(d, startIdx) {
    let lastUsed = -1;
    const headers = d[0] || [];

    for (let j = 0; j < headers.length; j++) {
      if (String(headers[j] || '').trim()) lastUsed = j;
    }

    for (let i = startIdx; i < d.length; i++) {
      const row = d[i] || [];
      for (let j = 0; j < row.length; j++) {
        if (String(row[j] || '').trim()) lastUsed = Math.max(lastUsed, j);
      }
    }

    return Math.max(lastUsed, 1);
  },

  oncallRawTableHtml(d, startIdx) {
    if (!d || d.length <= startIdx) return '<p style="padding:16px;color:#888;">لا توجد بيانات.</p>';

    const headers = d[0] || [];
    const lastUsedCol = this.getOncallRawLastUsedCol(d, startIdx);

    let html = '<div class="table-wrapper oncall-raw-table-wrap"><table class="oncall-raw-table"><thead><tr>';
    for (let j = 0; j <= lastUsedCol; j++) {
      const h = headers[j] || '';
      const cls = j === 0 ? 'oncall-raw-sticky-col-1' : j === 1 ? 'oncall-raw-sticky-col-2' : '';
      const st = j === 0 ? 'style="min-width:110px;width:110px;"' : j === 1 ? 'style="min-width:140px;width:140px;"' : '';
      html += `<th class="${cls}" ${st}>${this.escapeHtml(h || '-')}</th>`;
    }
    html += '</tr></thead><tbody>';

    let anyRow = false;
    for (let i = startIdx; i < d.length; i++) {
      const row = d[i] || [];
      if (!row.slice(0, lastUsedCol + 1).some(x => String(x || '').trim())) continue;
      anyRow = true;
      html += '<tr>';
      for (let j = 0; j <= lastUsedCol; j++) {
        const raw = (row[j] || '').toString();
        let val = raw;
        if (j === 1) val = this.formatOncallRawDateCell(raw);
        else if (j >= 2) val = this.formatOncallRawNamesCell(raw);
        const cls = j === 0 ? 'oncall-raw-sticky-col-1' : j === 1 ? 'oncall-raw-sticky-col-2' : '';
        const st = j === 0 ? 'style="min-width:110px;width:110px;"' : j === 1 ? 'style="min-width:140px;width:140px;"' : '';
        html += `<td class="${cls}" ${st}>${this.escapeHtml(val)}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    return anyRow ? html : '<p style="padding:16px;color:#888;">لا توجد بيانات.</p>';
  },

  /**
   * Renders the "عرض كجدول" modal from the canonical models, so both years use
   * the same code path and the same one-header-row convention.
   */
  renderOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    if (!wrap) return;

    const showY1 = this.oncallYearFilter === 'y1' || this.oncallYearFilter === 'y1y2';
    const showY2 = this.oncallYearFilter === 'y2' || this.oncallYearFilter === 'y1y2';
    const showBoth = this.oncallYearFilter === 'y1y2';

    let body = '';
    if (showY1) {
      if (showBoth) body += '<h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الأولى</h4>';
      body += this.oncallRawTableHtml(this.oncallModel.toTable(), 1);
    }
    if (showY2) {
      if (showBoth) body += '<h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الثانية</h4>';
      body += this.oncallRawTableHtml(this.oncall2Model.toTable(), 1);
    }

    const head = '<div class="oncall-raw-modal-head"><h4><i class="fas fa-table"></i> جدول المناوبات كاملاً</h4><button class="oncall-raw-close-btn" onclick="app.toggleOncallRawTable()" aria-label="إغلاق"><i class="fas fa-xmark"></i></button></div>';
    wrap.innerHTML = head + body;
  },

  toggleOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    if (!wrap) return;
    if (wrap.style.display === 'none' || !wrap.style.display) {
      this.renderOncallRawTable();
      wrap.style.display = 'block';
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      wrap.style.display = 'none';
    }
  },

  buildOncallCategoriesForDate(dstr, oncRows, oncHeaders, applyAdjustments) {
    const row = (oncRows || []).find(r => r.date === dstr);
    const cats = {};

    if (row) {
      for (let col = 2; col < oncHeaders.length; col++) {
        const cn = oncHeaders[col] || 'أخرى';
        const cc = (row.row[col] || '').trim();
        if (!cc) continue;
        const names = splitNames(cc);
        if (!names.length) continue;

        if (!cats[cn]) cats[cn] = [];
        for (const n of names) {
          const resident = this.findRbyExact(n);
          const fn = resident ? resident.name : n;
          const ph = resident ? resident.phone : '';
          const ab = resident ? resident.abbr : n;
          if (cats[cn].find(x => x.abbr === ab)) continue;

          const entryObj = { abbr: ab, name: fn, phone: ph, resAbbr: ab };
          if (applyAdjustments) {
            const overrideKey = `${dstr}|${ab}|${normAr(cn)}`;
            if (this.adjustmentOverrides.has(overrideKey)) entryObj.hoursOverride = this.adjustmentOverrides.get(overrideKey);
          }
          cats[cn].push(entryObj);
        }
      }
    }

    if (applyAdjustments) {
      this.adjustmentAdditions
        .filter(a => a.date === dstr)
        .forEach(a => {
          if (!cats[a.category]) cats[a.category] = [];
          if (cats[a.category].find(x => x.abbr === a.abbr)) return;
          cats[a.category].push({ abbr: a.abbr, name: a.name, phone: '', resAbbr: a.abbr, isVolunteer: true, hoursOverride: a.hours });
        });
    }

    return cats;
  },

  oncallCategoriesSectionHtml(catEntries, dstr, isYear1) {
    if (!catEntries.length) return '';
    let h = '<div class="oncall-categories-grid">';
    for (const [cn, names] of catEntries) {
      const schedule = isYear1 ? this.getCategorySchedule(cn, dstr) : null;
      const scheduleHtml = schedule && (schedule.time || schedule.duration) ? `<div class="oncall-schedule-meta${schedule.isHoliday ? ' holiday' : ''}"><span>${schedule.time || '-'}</span><span>${schedule.duration || '-'}</span></div>` : '';

      h += `<div class="oncall-category${schedule && schedule.isHoliday ? ' holiday' : ''}"><h4><span>${cn}</span><span class="cat-count">${names.length}</span></h4>${scheduleHtml}<div class="oncall-names-list">`;
      for (const n of names) {
        let extra = '';
        if (n.isVolunteer) extra = ` <span class="oncall-mini-badge volunteer">تطوعي · ${this.formatNumDisplay(n.hoursOverride)} س</span>`;
        else if (n.hoursOverride !== undefined) extra = ` <span class="oncall-mini-badge adjusted">${this.formatNumDisplay(n.hoursOverride)} س</span>`;
        h += `<span class="oncall-name-tag">${mcn(n.name, n.phone, n.resAbbr)}${extra}</span>`;
      }
      h += '</div></div>';
    }
    h += '</div>';
    return h;
  },

  getColleaguesForDateCategory(dateIso, category, excludeAbbr) {
    const list = [];

    const oncRow = this.oncRows.find(r => r.date === dateIso);
    if (oncRow) {
      const col = this.oncHeaders.findIndex((h, i) => i >= 2 && normAr(h || '') === normAr(category));
      if (col >= 0) {
        const cellVal = (oncRow.row[col] || '').trim();
        if (cellVal) {
          splitNames(cellVal).forEach(n => {
            const cr = this.findRbyExact(n);
            const abbr = cr ? cr.abbr || cr.name : n;
            if (abbr === excludeAbbr) return;
            if (!list.find(x => x.abbr === abbr)) list.push({ name: cr ? cr.name : n, abbr, phone: cr ? cr.phone : '' });
          });
        }
      }
    }

    this.adjustmentAdditions.forEach(a => {
      if (a.date !== dateIso || normAr(a.category) !== normAr(category)) return;
      if (a.abbr === excludeAbbr) return;
      if (!list.find(x => x.abbr === a.abbr)) list.push({ name: a.name, abbr: a.abbr, phone: '' });
    });

    return list;
  },

  changeOncallYearFilter(val) {
    this.oncallYearFilter = val;
    document.querySelectorAll('.oncall-year-btn').forEach(b => b.classList.toggle('active', b.dataset.year === val));
    this.showOncallDate(this.selectedOncallDate);
    this.renderOncallRawTable();
  },

  showOncallDate(ds) {
    const dp = document.getElementById('oncallDayDisplay');
    const dstr = ds || this.selectedOncallDate || this.today;
    if (!dstr || !dp || (!this.oncRows.length && !this.oncRows2.length)) return;

    this.selectedOncallDate = dstr;
    const picker = document.getElementById('oncallDatePicker');
    if (picker && picker.value !== dstr) picker.value = dstr;

    const showY1 = this.oncallYearFilter === 'y1' || this.oncallYearFilter === 'y1y2';
    const showY2 = this.oncallYearFilter === 'y2' || this.oncallYearFilter === 'y1y2';
    const showBoth = this.oncallYearFilter === 'y1y2';

    const cats1 = showY1 ? this.buildOncallCategoriesForDate(dstr, this.oncRows, this.oncHeaders, true) : {};
    const cats2 = showY2 ? this.buildOncallCategoriesForDate(dstr, this.oncRows2, this.oncHeaders2, false) : {};
    const entries1 = Object.entries(cats1);
    const entries2 = Object.entries(cats2);

    if (!entries1.length && !entries2.length) {
      dp.innerHTML = `<div class="oncall-day-card"><h3><i class="fas fa-calendar-day"></i> ${dstr} - ${getDayName(dstr)}</h3><p style="color:#888;">لا توجد مناوبات لهذا التاريخ.</p></div>`;
      return;
    }

    const ts = nowStamp();

    const dn = getDayName(dstr);
    const we = this.isHolidayDate(dstr);
    const holidayName = this.getHolidayName(dstr);
    const catCount = entries1.length + entries2.length;
    const totalDoctors = entries1.reduce((a, [, n]) => a + n.length, 0) + entries2.reduce((a, [, n]) => a + n.length, 0);

    let h = `<div class="oncall-day-card" id="oncallCardContent"><div class="oncall-card-head"><h3 class="${we ? 'weekend' : ''}"><i class="fas fa-calendar-day"></i> ${dstr} - ${dn}${we ? ` <span class="day-badge weekend${holidayName ? ' official' : ''}">${holidayName ? '<i class="fas fa-star"></i> ' + escapeHtml(holidayName) : 'عطلة'}</span>` : ''}</h3><div class="oncall-card-stats"><span class="oncall-stat-pill"><i class="fas fa-layer-group"></i> ${catCount} فئة</span><span class="oncall-stat-pill"><i class="fas fa-user-doctor"></i> ${totalDoctors} طبيب</span></div></div><div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div>`;

    if (showBoth) {
      h += `<div class="oncall-year-section"><h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الأولى</h4>${entries1.length ? this.oncallCategoriesSectionHtml(entries1, dstr, true) : '<p style="color:#888;">لا توجد مناوبات مسجلة.</p>'}</div>`;
      h += `<div class="oncall-year-section"><h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الثانية</h4>${entries2.length ? this.oncallCategoriesSectionHtml(entries2, dstr, false) : '<p style="color:#888;">لا توجد مناوبات مسجلة.</p>'}</div>`;
    } else if (showY1) {
      h += entries1.length ? this.oncallCategoriesSectionHtml(entries1, dstr, true) : '<p style="color:#888;">لا توجد مناوبات مسجلة لهذا التاريخ.</p>';
    } else {
      h += entries2.length ? this.oncallCategoriesSectionHtml(entries2, dstr, false) : '<p style="color:#888;">لا توجد مناوبات مسجلة لهذا التاريخ.</p>';
    }

    h += `<div class="oncall-export-actions"><button class="download-btn" onclick="app.downloadOncallImage(this)"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل المناوبات كصورة</button></div></div>`;
    dp.innerHTML = h;
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

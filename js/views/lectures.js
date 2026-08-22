/**
 * رزنامة المحاضرات — month calendar, selected-day list, upcoming and past
 * sessions, plus the category/department/year filters.
 *
 * Parsing lives in data/parsers/lectures.js; this file only renders `this.lectures`.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { smartSearch } = AUH.text;
  const { getDayName, formatDisplayDate } = AUH.dates;

  AUH.views.lectures = {
  buildLecturesFilters() {
    const cat = document.getElementById('lecturesCategoryFilter');
    const dep = document.getElementById('lecturesDeptFilter');
    const yr = document.getElementById('lecturesYearFilter');
    if (!cat || !dep || !yr) return;

    const cats = [...new Set(this.lectures.map(x => x.category).filter(Boolean))].sort();
    const deps = [...new Set(this.lectures.map(x => x.dept).filter(Boolean))].sort();
    const years = [...new Set(this.lectures.map(x => x.year).filter(Boolean))].sort();

    cat.innerHTML = '<option value="">كل التصنيفات</option>' + cats.map(x => `<option value="${this.escapeHtml(x)}">${this.escapeHtml(x)}</option>`).join('');
    dep.innerHTML = '<option value="">كل الأقسام</option>' + deps.map(x => `<option value="${this.escapeHtml(x)}">${this.escapeHtml(x)}</option>`).join('');
    yr.innerHTML = '<option value="">كل السنوات</option>' + years.map(x => `<option value="${this.escapeHtml(x)}">${this.escapeHtml(x)}</option>`).join('');

    cat.value = this.lecturesCategoryFilter || '';
    dep.value = this.lecturesDeptFilter || '';
    yr.value = this.lecturesYearFilter || '';
  },

  filterLecturesByCategory() {
    const el = document.getElementById('lecturesCategoryFilter');
    this.lecturesCategoryFilter = el ? el.value : '';
    this.renderLectures();
  },

  filterLecturesByDept() {
    const el = document.getElementById('lecturesDeptFilter');
    this.lecturesDeptFilter = el ? el.value : '';
    this.renderLectures();
  },

  filterLecturesByYear() {
    const el = document.getElementById('lecturesYearFilter');
    this.lecturesYearFilter = el ? el.value : '';
    this.renderLectures();
  },

  togglePastLectures() {
    this.showPastLectures = !this.showPastLectures;
    const btn = document.getElementById('lecturesPastBtn');
    if (btn) {
      if (this.showPastLectures) {
        btn.classList.add('active-filter');
        btn.innerHTML = '<i class="fas fa-eye-slash"></i> إخفاء المحاضرات القديمة';
      } else {
        btn.classList.remove('active-filter');
        btn.innerHTML = '<i class="fas fa-clock-rotate-left"></i> رؤية المحاضرات القديمة';
      }
    }
    this.renderLectures();
  },

  changeLecturesCalendarMonth(step) {
    const cur = new Date(this.lecturesCalendarYear, this.lecturesCalendarMonth, 1);
    cur.setMonth(cur.getMonth() + (step || 0));
    this.lecturesCalendarYear = cur.getFullYear();
    this.lecturesCalendarMonth = cur.getMonth();
    this.lecturesSelectedDate = `${this.lecturesCalendarYear}-${String(this.lecturesCalendarMonth + 1).padStart(2, '0')}-01`;
    this.lecturesUserSelectedDate = true;
    this.renderLectures();
  },

  clickLectureCalendarDay(ds) {
    this.lecturesUserSelectedDate = true;
    this.lecturesSelectedDate = ds;
    const parts = (ds || '').split('-');
    if (parts.length === 3) {
      this.lecturesCalendarYear = parseInt(parts[0], 10);
      this.lecturesCalendarMonth = parseInt(parts[1], 10) - 1;
    }
    this.renderLectures();

    setTimeout(() => {
      const el = document.getElementById('lecturesSelectedDayBox');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  },

  renderLecturesMonthlyCalendar(list) {
    const titleEl = document.getElementById('lecturesCalendarTitle');
    const container = document.getElementById('lecturesMonthlyCalendar');
    if (!titleEl || !container) return;

    const yr = this.lecturesCalendarYear;
    const mo = this.lecturesCalendarMonth;
    titleEl.textContent = `الشهر ${mo + 1}`;

    const dim = new Date(yr, mo + 1, 0).getDate();
    const fd = new Date(yr, mo, 1).getDay();
    const afd = fd === 0 ? 6 : fd - 1;
    const dns = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dayCount = {};
    for (const l of list) {
      if (!l.dateISO) continue;
      dayCount[l.dateISO] = (dayCount[l.dateISO] || 0) + 1;
    }

    let h = '<div class="monthly-calendar"><div class="calendar-grid">';
    dns.forEach((d, i) => {
      h += `<div class="calendar-day-header${i === 4 || i === 5 ? ' weekend' : ''}">${d}</div>`;
    });

    for (let i = 0; i < afd; i++) h += '<div class="calendar-day empty"></div>';

    for (let day = 1; day <= dim; day++) {
      const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const di = new Date(yr, mo, day).getDay();
      const hasLecture = !!dayCount[ds];

      let cls = 'calendar-day';
      if (ds === todayIso) cls += ' lecture-today';
      if (ds === this.lecturesSelectedDate) cls += ' selected-day';
      if (di === 5 || di === 6) cls += ' weekend';
      if (hasLecture) cls += ' has-lecture';

      const dot = hasLecture ? `<span class="lecture-day-count">x${dayCount[ds]}</span>` : '';
      h += `<div class="${cls}" onclick="app.clickLectureCalendarDay('${ds}')"><span class="lecture-day-number">${day}</span>${dot}</div>`;
    }

    h += '</div></div>';
    container.innerHTML = h;
  },

  renderLecturesSelectedDay(list) {
    const box = document.getElementById('lecturesSelectedDayBox');
    if (!box) return;

    if (!this.lecturesSelectedDate) {
      box.innerHTML = '<div class="lecture-empty">اختر يوماً من الرزنامة لعرض المحاضرات.</div>';
      return;
    }

    const dayList = list.filter(l => l.dateISO === this.lecturesSelectedDate).sort((a, b) => a.startAt - b.startAt);
    const dn = getDayName(this.lecturesSelectedDate);
    const title = `<div class="lectures-section-head"><h3><i class="fas fa-calendar-day"></i> محاضرات يوم ${dn ? this.escapeHtml(dn) + ' ' : ''}${this.escapeHtml(this.lecturesSelectedDate)}</h3></div>`;

    if (!dayList.length) {
      box.innerHTML = `${title}<div class="lecture-empty">لا يوجد.</div>`;
      return;
    }

    box.innerHTML = `${title}<div class="lectures-grid">${dayList.map(l => this.lectureCard(l, true)).join('')}</div>`;
  },

  lectureCard(l, hero = false) {
    const cat = l.category ? `<span class="lecture-tag">${this.escapeHtml(l.category)}</span>` : '';
    const dep = l.dept ? `<span class="lecture-meta-chip"><i class="fas fa-building"></i> ${this.escapeHtml(l.dept)}</span>` : '';
    const yr = l.year ? `<span class="lecture-meta-chip"><i class="fas fa-user-graduate"></i> ${this.escapeHtml(l.year)}</span>` : '';
    const sp = l.speaker ? `<span class="lecture-meta-chip"><i class="fas fa-microphone"></i> ${this.escapeHtml(l.speaker)}</span>` : '';
    const pl = l.place ? `<span class="lecture-meta-chip"><i class="fas fa-location-dot"></i> ${this.escapeHtml(l.place)}</span>` : '';
    const tm = l.time ? `<span class="lecture-meta-chip"><i class="fas fa-clock"></i> ${this.escapeHtml(l.time)}</span>` : '';
    const du = l.duration ? `<span class="lecture-meta-chip"><i class="fas fa-hourglass-half"></i> ${this.escapeHtml(l.duration)}</span>` : '';

    let links = '';
    if (l.regLink && l.regLink.startsWith('http')) links += `<a class="lecture-link-btn" href="${this.escapeHtml(l.regLink)}" target="_blank"><i class="fas fa-pen-to-square"></i> رابط التسجيل</a>`;
    if (l.annLink && l.annLink.startsWith('http')) links += `<a class="lecture-link-btn" href="${this.escapeHtml(l.annLink)}" target="_blank"><i class="fas fa-bullhorn"></i> رابط الإعلان</a>`;

    return `<article class="lecture-card${hero ? ' hero' : ''}"><div class="lecture-head"><h4>${this.escapeHtml(l.title)}</h4>${cat}</div><div class="lecture-date"><i class="fas fa-calendar-day"></i> ${this.escapeHtml(formatDisplayDate(l.dateRaw))}</div>${l.content ? `<p class="lecture-content">${this.escapeHtml(l.content)}</p>` : ''}<div class="lecture-meta">${sp}${pl}${tm}${du}${dep}${yr}</div>${links ? `<div class="lecture-links-row">${links}</div>` : ''}</article>`;
  },

  renderLectures() {
    const todayEl = document.getElementById('todayLecturesHero');
    const nextEl = document.getElementById('upcomingLecturesList');
    const pastWrap = document.getElementById('pastLecturesWrap');
    const pastEl = document.getElementById('pastLecturesList');
    if (!todayEl || !nextEl || !pastWrap || !pastEl) return;

    this.buildLecturesFilters();

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let list = this.lectures.slice();
    if (this.lecturesCategoryFilter) list = list.filter(l => l.category === this.lecturesCategoryFilter);
    if (this.lecturesDeptFilter) list = list.filter(l => l.dept === this.lecturesDeptFilter);
    if (this.lecturesYearFilter) list = list.filter(l => l.year === this.lecturesYearFilter);
    if (this.lecturesSearchTerm) {
      const t = this.lecturesSearchTerm;
      list = list.filter(l => smartSearch(`${l.title} ${l.content} ${l.speaker}`, t));
    }

    list.sort((a, b) => a.startAt - b.startAt);

    const calendarMonthKey = `${this.lecturesCalendarYear}-${String(this.lecturesCalendarMonth + 1).padStart(2, '0')}`;
    if (!this.lecturesSelectedDate) {
      this.lecturesSelectedDate = calendarMonthKey === todayIso.slice(0, 7) ? todayIso : `${calendarMonthKey}-01`;
    }

    if ((this.lecturesSelectedDate || '').slice(0, 7) !== calendarMonthKey) {
      this.lecturesSelectedDate = calendarMonthKey === todayIso.slice(0, 7) && !this.lecturesUserSelectedDate ? todayIso : `${calendarMonthKey}-01`;
    }

    this.renderLecturesMonthlyCalendar(list);
    this.renderLecturesSelectedDay(list);

    const past = list.filter(l => l.endAt < now).sort((a, b) => a.startAt - b.startAt);
    const active = list.filter(l => l.endAt >= now).sort((a, b) => a.startAt - b.startAt);
    const today = active.filter(l => l.dateISO === todayIso);
    const upcoming = active.filter(l => l.dateISO !== todayIso);

    const todayHead = todayEl.previousElementSibling;
    if (todayHead) todayHead.style.display = 'none';
    todayEl.style.display = 'none';
    todayEl.innerHTML = '';
    nextEl.innerHTML = upcoming.length ? upcoming.map(l => this.lectureCard(l, false)).join('') : '<div class="lecture-empty">لا توجد محاضرات قادمة حسب الفلاتر الحالية.</div>';

    let oldBtn = document.getElementById('lecturesOldToggleInlineBtn');
    if (!oldBtn) {
      const wrap = document.createElement('div');
      wrap.className = 'controls-row lectures-old-toggle-wrap';
      wrap.style.marginTop = '12px';
      wrap.innerHTML = '<button class="filter-btn" id="lecturesOldToggleInlineBtn" onclick="app.togglePastLectures()"></button>';
      pastWrap.parentElement.appendChild(wrap);
      oldBtn = document.getElementById('lecturesOldToggleInlineBtn');
    }

    if (oldBtn) {
      oldBtn.innerHTML = this.showPastLectures ? '<i class="fas fa-eye-slash"></i> إخفاء المحاضرات والورشات القديمة' : '<i class="fas fa-clock-rotate-left"></i> عرض المحاضرات والورشات القديمة';
      oldBtn.classList.toggle('active-filter', this.showPastLectures);
    }

    if (this.showPastLectures) {
      pastWrap.style.display = 'block';
      pastEl.innerHTML = past.length ? past.map(l => this.lectureCard(l, false)).join('') : '<div class="lecture-empty">لا توجد محاضرات قديمة.</div>';
    } else {
      pastWrap.style.display = 'none';
      pastEl.innerHTML = '';
    }
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

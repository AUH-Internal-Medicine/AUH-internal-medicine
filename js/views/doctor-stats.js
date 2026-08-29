/**
 * احصائيات الأطباء — the computed statistics cards, their sort panel and search.
 *
 * The numbers themselves come from domain/doctor-stats.js; this file only
 * filters, sorts and renders them.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { smartSearch, safeNum, normAr } = AUH.text;
  const { formatDisplayDate, getDayName } = AUH.dates;
  const GROUPS = AUH.domain.oncallSchedule.GROUPS;

  /** The four display groups, in the order the cards use. */
  const GROUP_ORDER = ['wards', 'icu', 'emergency', 'misc', 'other'];

  /** `group:icu` / `cat:عناية قلبية` — the value carried by the filter <select>. */
  function parseFilter(value) {
    const raw = (value || '').trim();
    if (!raw) return null;
    const i = raw.indexOf(':');
    if (i < 0) return null;
    const kind = raw.slice(0, i);
    const id = raw.slice(i + 1);
    if (!id || (kind !== 'group' && kind !== 'cat')) return null;
    return { kind, id };
  }

  AUH.views.doctorStats = {
  /**
   * Every on-call category that exists in the sheet, bucketed by display group.
   * Built from the on-call headers so a category added to the sheet shows up in
   * the filter without a code change.
   */
  shiftFilterCatalogue() {
    const classify = AUH.domain.oncallSchedule.classifyGroup;
    const buckets = {};
    GROUP_ORDER.forEach(g => (buckets[g] = []));

    const seen = new Set();
    const push = category => {
      const name = (category || '').trim();
      if (!name || seen.has(normAr(name))) return;
      seen.add(normAr(name));
      const group = classify(name);
      (buckets[group] || buckets.other).push(name);
    };

    ((this.oncallModel && this.oncallModel.categories) || []).forEach(push);
    // Anything that reached a resident but is not a sheet header (volunteer
    // shifts from the adjustments tab) still deserves a filter entry.
    (this.doctorStats || []).forEach(entry => Object.keys(entry.catDates || {}).forEach(push));

    return GROUP_ORDER
      .map(key => ({ key, label: GROUPS[key] ? GROUPS[key].label : key, icon: GROUPS[key] ? GROUPS[key].icon : 'fa-circle', categories: buckets[key] }))
      .filter(g => g.categories.length);
  },

  /** The active filter's label, for the card band and the empty state. */
  activeShiftFilterLabel() {
    const f = parseFilter(this.doctorStatsShiftFilter);
    if (!f) return '';
    if (f.kind === 'cat') return f.id;
    return `مناوبات ${GROUPS[f.id] ? GROUPS[f.id].label : f.id}`;
  },

  /** The assignments of one doctor that match the active filter. */
  matchingAssignments(entry, filter) {
    const f = filter === undefined ? parseFilter(this.doctorStatsShiftFilter) : filter;
    if (!f) return null;
    const all = entry.assignments || [];
    return f.kind === 'group'
      ? all.filter(a => a.group === f.id)
      : all.filter(a => normAr(a.category) === normAr(f.id));
  },

  /** How many shifts of the filtered type this doctor has (0 when no filter). */
  shiftFilterCount(entry) {
    const matches = this.matchingAssignments(entry);
    return matches ? matches.length : 0;
  },

  /** Free-text haystack: name, abbr, spec, status, every category and rotation. */
  searchHaystack(entry) {
    if (entry.__haystack) return entry.__haystack;
    const cats = Object.keys(entry.catDates || {}).join(' ');
    const rots = (entry.rotations || []).map(r => `${r.label} ${r.value}`).join(' ');
    const dates = (entry.assignments || []).map(a => a.date).join(' ');
    entry.__haystack = `${entry.name} ${entry.abbr} ${entry.spec} ${entry.status} ${cats} ${rots} ${dates}`;
    return entry.__haystack;
  },

  getFilteredDoctorStats() {
    let list = this.doctorStats.slice();

    if (this.doctorStatsSearchTerm) {
      const q = this.doctorStatsSearchTerm;
      list = list.filter(x => smartSearch(this.searchHaystack(x), q));
    }

    const filter = parseFilter(this.doctorStatsShiftFilter);
    if (filter && this.doctorStatsOnlyWithShift) {
      list = list.filter(x => this.shiftFilterCount(x) > 0);
    }

    const key = this.doctorStatsSort.key || 'hoursCompleted';
    const dir = this.doctorStatsSort.dir === 'asc' ? 1 : -1;
    const valueOf = key === 'shiftFilterCount'
      ? entry => this.shiftFilterCount(entry)
      : entry => safeNum(entry[key]) || 0;

    // Ties keep a stable, meaningful order: more hours first, then by name.
    list.sort((a, b) => {
      const d = (valueOf(a) - valueOf(b)) * dir;
      if (d) return d;
      const h = (b.hoursCompleted || 0) - (a.hoursCompleted || 0);
      return h || (a.name || '').localeCompare(b.name || '', 'ar');
    });

    return list;
  },

  setDoctorStatsSortMetric(key) {
    this.doctorStatsSort.key = key;
    this.renderDoctorStats();
  },

  /**
   * Choosing a shift type also switches the sort to that type's count — that is
   * the question being asked ("who has the fewest ICU shifts?").
   */
  setDoctorStatsShiftFilter(value) {
    this.doctorStatsShiftFilter = value || '';
    if (this.doctorStatsShiftFilter) {
      this.doctorStatsSort.key = 'shiftFilterCount';
    } else if (this.doctorStatsSort.key === 'shiftFilterCount') {
      this.doctorStatsSort.key = 'hoursCompleted';
    }
    this.renderDoctorStats();
  },

  /** True when anything at all differs from the default view. */
  doctorStatsFiltersActive() {
    return !!(this.doctorStatsShiftFilter ||
      this.doctorStatsSearchTerm ||
      !this.doctorStatsOnlyWithShift ||
      this.doctorStatsSort.key !== 'hoursCompleted' ||
      this.doctorStatsSort.dir !== 'desc');
  },

  /** Back to the default view: no filter, no search, sorted by hours worked. */
  resetDoctorStatsFilters() {
    this.doctorStatsShiftFilter = '';
    this.doctorStatsOnlyWithShift = true;
    this.doctorStatsSearchTerm = '';
    this.doctorStatsSort = { key: 'hoursCompleted', dir: 'desc' };
    const search = document.getElementById('doctorStatsSearch');
    if (search) search.value = '';
    this.renderDoctorStats();
  },

  toggleDoctorStatsOnlyWithShift() {
    this.doctorStatsOnlyWithShift = !this.doctorStatsOnlyWithShift;
    this.renderDoctorStats();
  },

  toggleDoctorStatsSortDir() {
    this.doctorStatsSort.dir = this.doctorStatsSort.dir === 'asc' ? 'desc' : 'asc';
    this.renderDoctorStats();
  },

  groupDetailHtml(groupKey, groupDetails, uid) {
    const labels = { wards: 'أجنحة', icu: 'عنايات', emergency: 'اسعاف', misc: 'منوع', other: 'أخرى' };
    const entries = Object.entries(groupDetails[groupKey] || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const chips = entries.length
      ? entries.map(([k, v]) => `<span class="dsc-detail-chip">${this.escapeHtml(k)}: <strong>${v}</strong></span>`).join('')
      : '<span class="dsc-detail-empty">لا توجد تفاصيل</span>';
    const icons = { wards: 'fa-bed', icu: 'fa-heart-pulse', emergency: 'fa-truck-medical', misc: 'fa-shapes', other: 'fa-circle-question' };
    return `<button type="button" class="dsc-group" onclick="toggleCollapsible(this)"><i class="fas ${icons[groupKey]}"></i><span>${labels[groupKey]}</span><strong>${this.formatNumDisplay(total)}</strong><i class="fas fa-chevron-down dsc-group-chevron"></i></button><div class="collapsible-content dsc-group-detail" id="dscDetail-${uid}-${groupKey}">${chips}</div>`;
  },

  rotationsDetailHtml(r, uid) {
    const chips = (r.rotations || []).length
      ? r.rotations.map(x => `<span class="dsc-detail-chip">${this.escapeHtml(x.label)}: <strong>${this.escapeHtml(x.value)}</strong></span>`).join('')
      : '<span class="dsc-detail-empty">لا توجد بيانات فروز حتى الآن</span>';
    return `<button type="button" class="dsc-group dsc-rotations-btn" onclick="toggleCollapsible(this)"><i class="fas fa-route"></i><span>الفروز حتى الآن</span><strong>${this.formatNumDisplay(r.rotationsCount)}</strong><i class="fas fa-chevron-down dsc-group-chevron"></i></button><div class="collapsible-content dsc-group-detail" id="dscRotations-${uid}">${chips}</div>`;
  },

  /**
   * When a shift type is selected, every card leads with that type: the count,
   * the share of the doctor's duties, and each date — the detail you need when
   * building next month's table.
   */
  shiftFocusHtml(r) {
    const matches = this.matchingAssignments(r);
    if (!matches) return '';

    const label = this.escapeHtml(this.activeShiftFilterLabel());
    if (!matches.length) {
      return `<div class="dsc-focus dsc-focus-empty"><div class="dsc-focus-head"><span class="dsc-focus-label"><i class="fas fa-filter"></i> ${label}</span><span class="dsc-focus-count">0</span></div><div class="dsc-focus-note">لم يناوب هذا النوع بعد</div></div>`;
    }

    const done = matches.filter(a => a.isCompleted).length;
    const hours = matches.reduce((sum, a) => sum + (a.hours || 0), 0);
    const share = r.total ? Math.round((matches.length / r.total) * 100) : 0;

    // Grouped by category so a group filter still shows which shift is which.
    const byCategory = {};
    matches.forEach(a => (byCategory[a.category] = (byCategory[a.category] || 0) + 1));
    const breakdown = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `<span class="dsc-detail-chip">${this.escapeHtml(cat)}: <strong>${n}</strong></span>`)
      .join('');

    const dates = matches
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(a => {
        const cls = ['dsc-focus-date'];
        if (a.isCompleted) cls.push('is-done');
        if (a.isHoliday) cls.push('is-holiday');
        if (a.isNight) cls.push('is-night');
        const marks = `${a.isHoliday ? '<i class="fas fa-umbrella-beach" title="عطلة"></i>' : ''}${a.isNight ? '<i class="fas fa-moon" title="ليلية"></i>' : ''}`;
        return `<span class="${cls.join(' ')}" title="${this.escapeHtml(a.category)} — ${this.escapeHtml(getDayName(a.date))}">${this.escapeHtml(formatDisplayDate(a.date) || a.date)}${marks}</span>`;
      })
      .join('');

    return `<div class="dsc-focus"><div class="dsc-focus-head"><span class="dsc-focus-label"><i class="fas fa-filter"></i> ${label}</span><span class="dsc-focus-count">${this.formatNumDisplay(matches.length)}</span></div><div class="dsc-focus-meta"><span><i class="fas fa-check"></i> تمّت: ${this.formatNumDisplay(done)}</span><span><i class="fas fa-hourglass-half"></i> متبقية: ${this.formatNumDisplay(matches.length - done)}</span><span><i class="fas fa-stopwatch"></i> ${this.formatNumDisplay(hours)} ساعة</span><span><i class="fas fa-percent"></i> ${share}% من مناوباته</span></div><div class="dsc-focus-chips">${breakdown}</div><div class="dsc-focus-dates">${dates}</div></div>`;
  },

  doctorStatCardHtml(r) {
    const uid = `${(r.abbr || r.name || '').replace(/[^a-zA-Z0-9أ-ي]/g, '_')}`;
    const detached = !!r.isDetachedOrNotJoined;
    return `<div class="doctor-stat-card${detached ? ' detached-card' : ''}"><div class="dsc-head"><div class="dsc-name"><i class="fas fa-user-doctor"></i> ${this.escapeHtml(r.name)} ${r.abbr ? `<span class="dsc-abbr">(${this.escapeHtml(r.abbr)})</span>` : ''}</div>${detached ? `<span class="dsc-status-badge"><i class="fas fa-user-slash"></i> ${this.escapeHtml(r.status) || 'غير ملتحق/منفك'}</span>` : ''}</div>${r.spec ? `<div class="dsc-spec">${this.escapeHtml(r.spec)}</div>` : ''}${this.shiftFocusHtml(r)}<div class="dsc-hours-row"><div class="dsc-hours-box dsc-hours-primary"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursCompleted)}</div><div class="dsc-hours-lbl">ساعة (مناوبات تمّت)</div><div class="dsc-hours-rank">الترتيب: #${r.rankCompleted}</div>${r.bonusCompleted ? `<div class="dsc-hours-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(r.bonusCompleted)} Bonus</div>` : ''}</div><div class="dsc-hours-box"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursTotal)}</div><div class="dsc-hours-lbl">ساعة (تراكمية)</div><div class="dsc-hours-rank">الترتيب: #${r.rankTotal}</div>${r.bonusHours ? `<div class="dsc-hours-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(r.bonusHours)} Bonus</div>` : ''}</div></div><div class="dsc-top-row"><div class="dsc-mini"><span class="dsc-mini-num">${r.joinDaysSince ?? '-'}</span><span class="dsc-mini-lbl">يوم منذ الالتحاق</span></div><div class="dsc-mini"><span class="dsc-mini-num">${this.formatNumDisplay(r.total)}</span><span class="dsc-mini-lbl">مناوبات تراكمية</span></div><div class="dsc-mini dsc-mini-done"><span class="dsc-mini-num">${this.formatNumDisplay(r.completed)}<span class="dsc-done-check" title="مناوبات مكتملة"><i class="fas fa-check"></i></span></span><span class="dsc-mini-lbl">تمّت</span></div></div><div class="dsc-groups">${this.groupDetailHtml('wards', r.groupDetails, uid)}${this.groupDetailHtml('icu', r.groupDetails, uid)}${this.groupDetailHtml('emergency', r.groupDetails, uid)}${this.groupDetailHtml('misc', r.groupDetails, uid)}${Object.keys(r.groupDetails.other || {}).length ? this.groupDetailHtml('other', r.groupDetails, uid) : ''}${this.rotationsDetailHtml(r, uid)}</div><div class="dsc-bottom-row"><span><i class="fas fa-umbrella-beach"></i> عطل: ${this.formatNumDisplay(r.holiday)}</span><span class="dsc-praise-badge"><i class="fas fa-star"></i> ثناءات: ${this.formatNumDisplay(r.praiseCount)}</span><span><i class="fas fa-moon"></i> ليلية: ${this.formatNumDisplay(r.night)}</span></div><div class="dsc-bottom-row">${r.bonusHours ? `<span class="dsc-bonus-badge"><i class="fas fa-gift"></i> ساعات Bonus: ${this.formatNumDisplay(r.bonusHours)}</span>` : ''}<span><i class="fas fa-stopwatch"></i> ساعات المناوبات: ${this.formatNumDisplay(r.hoursShiftsTotal)}</span></div><div class="dsc-bottom-row"><span><i class="fas fa-calendar-day"></i> أول مناوبة: ${r.firstOncall || '-'}</span><span><i class="fas fa-calendar-check"></i> آخر مناوبة: ${r.lastOncall || '-'}</span></div></div>`;
  },

  /** Fills the shift-type <select> with optgroups: group first, then each shift. */
  syncShiftFilterOptions() {
    const select = document.getElementById('doctorStatsShiftFilter');
    if (!select) return;

    const catalogue = this.shiftFilterCatalogue();
    const signature = catalogue.map(g => `${g.key}:${g.categories.join('|')}`).join('~');
    if (select.dataset.signature !== signature) {
      const groupOptions = catalogue
        .map(g => `<option value="group:${this.escapeHtml(g.key)}">كل ${this.escapeHtml(g.label)} (${g.categories.length} نوع)</option>`)
        .join('');
      const perCategory = catalogue
        .map(g => `<optgroup label="${this.escapeHtml(g.label)}">${g.categories.map(c => `<option value="cat:${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`).join('')}</optgroup>`)
        .join('');
      select.innerHTML =
        '<option value="">كل أنواع المناوبات</option>' +
        `<optgroup label="حسب المجموعة">${groupOptions}</optgroup>` +
        perCategory;
      select.dataset.signature = signature;
    }
    // Resolve to the option's own spelling: the sheet writes "إسعاف" with a
    // hamza, a filter set in code may not, and a <select> shows blank for a
    // value it does not carry.
    const wanted = this.doctorStatsShiftFilter || '';
    if (select.value !== wanted) {
      const exact = Array.from(select.options).find(o => o.value === wanted);
      const loose = exact || Array.from(select.options).find(o => normAr(o.value) === normAr(wanted));
      select.value = loose ? loose.value : '';
      if (loose && loose.value !== wanted) this.doctorStatsShiftFilter = loose.value;
    }

    // The sort dropdown gains a matching option only while a filter is active.
    const metric = document.getElementById('doctorStatsSortMetric');
    if (metric) {
      let opt = metric.querySelector('option[value="shiftFilterCount"]');
      if (this.doctorStatsShiftFilter) {
        if (!opt) {
          opt = document.createElement('option');
          opt.value = 'shiftFilterCount';
          metric.insertBefore(opt, metric.firstChild);
        }
        opt.textContent = `عدد مناوبات: ${this.activeShiftFilterLabel()}`;
      } else if (opt) {
        opt.remove();
      }
    }

    const onlyBtn = document.getElementById('doctorStatsOnlyWithBtn');
    if (onlyBtn) {
      onlyBtn.style.display = this.doctorStatsShiftFilter ? '' : 'none';
      const only = !!this.doctorStatsOnlyWithShift;
      onlyBtn.classList.toggle('is-on', only);
      onlyBtn.innerHTML = only
        ? '<i class="fas fa-user-check"></i> من ناوب هذا النوع فقط'
        : '<i class="fas fa-users"></i> كل الأطباء';
    }

    // The reset button only exists while there is something to reset.
    const resetBtn = document.getElementById('doctorStatsResetBtn');
    if (resetBtn) resetBtn.style.display = this.doctorStatsFiltersActive() ? '' : 'none';

    const filterSelect = document.getElementById('doctorStatsShiftFilter');
    if (filterSelect) filterSelect.classList.toggle('is-on', !!this.doctorStatsShiftFilter);
  },

  renderDoctorStats() {
    const grid = document.getElementById('doctorStatsGrid');
    const countEl = document.getElementById('doctorStatsCount');
    if (!grid) return;

    this.syncShiftFilterOptions();

    const list = this.getFilteredDoctorStats();
    if (countEl) countEl.textContent = list.length;

    const metricSelect = document.getElementById('doctorStatsSortMetric');
    if (metricSelect && metricSelect.value !== this.doctorStatsSort.key) metricSelect.value = this.doctorStatsSort.key;

    // A short line stating exactly what is on screen, in the sheet's own words.
    const summary = document.getElementById('doctorStatsSummary');
    if (summary) {
      if (this.doctorStatsShiftFilter) {
        const total = list.reduce((sum, r) => sum + this.shiftFilterCount(r), 0);
        const withAny = list.filter(r => this.shiftFilterCount(r) > 0).length;
        const label = this.escapeHtml(this.activeShiftFilterLabel());
        summary.innerHTML = `<i class="fas fa-circle-info"></i> <strong>${label}</strong>: ${this.formatNumDisplay(total)} مناوبة موزعة على ${this.formatNumDisplay(withAny)} طبيب — الترتيب ${this.doctorStatsSort.dir === 'asc' ? 'تصاعدي (الأقل أولاً)' : 'تنازلي (الأكثر أولاً)'}.`;
        summary.style.display = '';
      } else {
        summary.style.display = 'none';
      }
    }

    const dirBtn = document.getElementById('doctorStatsSortDirBtn');
    if (dirBtn) {
      const asc = this.doctorStatsSort.dir === 'asc';
      dirBtn.innerHTML = asc ? '<i class="fas fa-arrow-up-wide-short"></i> تصاعدي' : '<i class="fas fa-arrow-down-wide-short"></i> تنازلي';
      dirBtn.classList.toggle('is-on', asc);
    }

    if (!list.length) {
      const why = this.doctorStatsShiftFilter && this.doctorStatsOnlyWithShift
        ? `لا يوجد طبيب ناوب «${this.escapeHtml(this.activeShiftFilterLabel())}» ضمن نتائج البحث.`
        : 'لا يوجد نتائج مطابقة.';
      grid.innerHTML = `<div class="no-results"><i class="fas fa-magnifying-glass"></i> ${why}</div>`;
      return;
    }

    grid.innerHTML = list.map(r => this.doctorStatCardHtml(r)).join('');
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

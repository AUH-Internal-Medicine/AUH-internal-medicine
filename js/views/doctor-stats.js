/**
 * احصائيات الأطباء — the computed statistics cards, their sort panel and search.
 *
 * The numbers themselves come from domain/doctor-stats.js; this file only
 * filters, sorts and renders them.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { smartSearch, safeNum } = AUH.text;

  AUH.views.doctorStats = {
  getFilteredDoctorStats() {
    let list = this.doctorStats.slice();

    if (this.doctorStatsSearchTerm) {
      const q = this.doctorStatsSearchTerm;
      list = list.filter(x => smartSearch(`${x.name} ${x.abbr} ${x.spec}`, q));
    }

    const key = this.doctorStatsSort.key || 'hoursCompleted';
    const dir = this.doctorStatsSort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => ((safeNum(a[key]) || 0) - (safeNum(b[key]) || 0)) * dir);

    return list;
  },

  setDoctorStatsSortMetric(key) {
    this.doctorStatsSort.key = key;
    this.renderDoctorStats();
  },

  toggleDoctorStatsSortDir() {
    this.doctorStatsSort.dir = this.doctorStatsSort.dir === 'asc' ? 'desc' : 'asc';
    this.renderDoctorStats();
  },

  groupDetailHtml(groupKey, groupDetails, uid) {
    const labels = { wards: 'أجنحة', icu: 'عنايات', emergency: 'اسعاف', misc: 'منوع' };
    const entries = Object.entries(groupDetails[groupKey] || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const chips = entries.length
      ? entries.map(([k, v]) => `<span class="dsc-detail-chip">${this.escapeHtml(k)}: <strong>${v}</strong></span>`).join('')
      : '<span class="dsc-detail-empty">لا توجد تفاصيل</span>';
    const icons = { wards: 'fa-bed', icu: 'fa-heart-pulse', emergency: 'fa-truck-medical', misc: 'fa-shapes' };
    return `<button type="button" class="dsc-group" onclick="toggleCollapsible(this)"><i class="fas ${icons[groupKey]}"></i><span>${labels[groupKey]}</span><strong>${this.formatNumDisplay(total)}</strong><i class="fas fa-chevron-down dsc-group-chevron"></i></button><div class="collapsible-content dsc-group-detail" id="dscDetail-${uid}-${groupKey}">${chips}</div>`;
  },

  rotationsDetailHtml(r, uid) {
    const chips = (r.rotations || []).length
      ? r.rotations.map(x => `<span class="dsc-detail-chip">${this.escapeHtml(x.label)}: <strong>${this.escapeHtml(x.value)}</strong></span>`).join('')
      : '<span class="dsc-detail-empty">لا توجد بيانات فروز حتى الآن</span>';
    return `<button type="button" class="dsc-group dsc-rotations-btn" onclick="toggleCollapsible(this)"><i class="fas fa-route"></i><span>الفروز حتى الآن</span><strong>${this.formatNumDisplay(r.rotationsCount)}</strong><i class="fas fa-chevron-down dsc-group-chevron"></i></button><div class="collapsible-content dsc-group-detail" id="dscRotations-${uid}">${chips}</div>`;
  },

  doctorStatCardHtml(r) {
    const uid = `${(r.abbr || r.name || '').replace(/[^a-zA-Z0-9أ-ي]/g, '_')}`;
    const detached = !!r.isDetachedOrNotJoined;
    return `<div class="doctor-stat-card${detached ? ' detached-card' : ''}"><div class="dsc-head"><div class="dsc-name"><i class="fas fa-user-doctor"></i> ${this.escapeHtml(r.name)} ${r.abbr ? `<span class="dsc-abbr">(${this.escapeHtml(r.abbr)})</span>` : ''}</div>${detached ? `<span class="dsc-status-badge"><i class="fas fa-user-slash"></i> ${this.escapeHtml(r.status) || 'غير ملتحق/منفك'}</span>` : ''}</div>${r.spec ? `<div class="dsc-spec">${this.escapeHtml(r.spec)}</div>` : ''}<div class="dsc-hours-row"><div class="dsc-hours-box dsc-hours-primary"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursCompleted)}</div><div class="dsc-hours-lbl">ساعة (مناوبات تمّت)</div><div class="dsc-hours-rank">الترتيب: #${r.rankCompleted}</div>${r.bonusCompleted ? `<div class="dsc-hours-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(r.bonusCompleted)} بونص</div>` : ''}</div><div class="dsc-hours-box"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursTotal)}</div><div class="dsc-hours-lbl">ساعة (تراكمية)</div><div class="dsc-hours-rank">الترتيب: #${r.rankTotal}</div>${r.bonusHours ? `<div class="dsc-hours-bonus"><i class="fas fa-gift"></i> منها ${this.formatNumDisplay(r.bonusHours)} بونص</div>` : ''}</div></div><div class="dsc-top-row"><div class="dsc-mini"><span class="dsc-mini-num">${r.joinDaysSince ?? '-'}</span><span class="dsc-mini-lbl">يوم منذ الالتحاق</span></div><div class="dsc-mini"><span class="dsc-mini-num">${this.formatNumDisplay(r.total)}</span><span class="dsc-mini-lbl">مناوبات تراكمية</span></div><div class="dsc-mini dsc-mini-done"><span class="dsc-mini-num">${this.formatNumDisplay(r.completed)}<span class="dsc-done-check" title="مناوبات مكتملة"><i class="fas fa-check"></i></span></span><span class="dsc-mini-lbl">تمّت</span></div></div><div class="dsc-groups">${this.groupDetailHtml('wards', r.groupDetails, uid)}${this.groupDetailHtml('icu', r.groupDetails, uid)}${this.groupDetailHtml('emergency', r.groupDetails, uid)}${this.groupDetailHtml('misc', r.groupDetails, uid)}${this.rotationsDetailHtml(r, uid)}</div><div class="dsc-bottom-row"><span><i class="fas fa-umbrella-beach"></i> عطل: ${this.formatNumDisplay(r.holiday)}</span><span class="dsc-praise-badge"><i class="fas fa-star"></i> ثناءات: ${this.formatNumDisplay(r.praiseCount)}</span><span><i class="fas fa-moon"></i> ليلية: ${this.formatNumDisplay(r.night)}</span></div><div class="dsc-bottom-row"><span class="dsc-bonus-badge"><i class="fas fa-gift"></i> ساعات بونص: ${this.formatNumDisplay(r.bonusHours)}</span><span><i class="fas fa-stopwatch"></i> ساعات المناوبات: ${this.formatNumDisplay(r.hoursShiftsTotal)}</span></div><div class="dsc-bottom-row"><span><i class="fas fa-calendar-day"></i> أول مناوبة: ${r.firstOncall || '-'}</span><span><i class="fas fa-calendar-check"></i> آخر مناوبة: ${r.lastOncall || '-'}</span></div></div>`;
  },

  renderDoctorStats() {
    const grid = document.getElementById('doctorStatsGrid');
    const countEl = document.getElementById('doctorStatsCount');
    if (!grid) return;

    const list = this.getFilteredDoctorStats();
    if (countEl) countEl.textContent = list.length;

    const metricSelect = document.getElementById('doctorStatsSortMetric');
    if (metricSelect && metricSelect.value !== this.doctorStatsSort.key) metricSelect.value = this.doctorStatsSort.key;

    const dirBtn = document.getElementById('doctorStatsSortDirBtn');
    if (dirBtn) {
      const asc = this.doctorStatsSort.dir === 'asc';
      dirBtn.innerHTML = asc ? '<i class="fas fa-arrow-up-wide-short"></i> تصاعدي' : '<i class="fas fa-arrow-down-wide-short"></i> تنازلي';
    }

    if (!list.length) {
      grid.innerHTML = '<div class="no-results"><i class="fas fa-magnifying-glass"></i> لا يوجد نتائج مطابقة.</div>';
      return;
    }

    grid.innerHTML = list.map(r => this.doctorStatCardHtml(r)).join('');
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

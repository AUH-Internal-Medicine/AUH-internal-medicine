/**
 * الفروز — monthly rotation groups, built from the residents sheet's
 * "فرز شهر N" columns (discovered by header, so a new month needs no code change).
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml } = AUH.text;
  const { mcn } = AUH.ui;
  const AM = AUH.constants.MONTH_NAMES;

  AUH.views.shifts = {
    /** Fills the month dropdown and renders the preferred month. */
    renderShiftsFromResidents() {
      const model = this.residentsModel;
      const months = model.getShiftMonths();

      if (!this.userSelectedShiftsMonth) {
        this.currentShiftsMonth = model.getPreferredShiftMonth(this.m + 1) - 1;
      }

      const select = document.getElementById('shiftsMonthSelector');
      if (select) {
        select.innerHTML = months
          .map(m => {
            const selected = m.month === this.currentShiftsMonth + 1 ? ' selected' : '';
            return `<option value="${m.month}"${selected}>${escapeHtml(m.label || 'فرز شهر ' + m.month)}</option>`;
          })
          .join('');
      }

      this.dispShiftsByMonth(this.currentShiftsMonth + 1);
    },

    changeShiftsMonth() {
      const select = document.getElementById('shiftsMonthSelector');
      if (!select) return;
      this.userSelectedShiftsMonth = true;
      this.currentShiftsMonth = parseInt(select.value, 10) - 1;
      this.dispShiftsByMonth(parseInt(select.value, 10));
    },

    /** One card per rotation, largest group first. */
    dispShiftsByMonth(month) {
      const grid = document.getElementById('shiftsGrid');
      if (!grid) return;

      const model = this.residentsModel;
      grid.innerHTML = '';
      const title = document.getElementById('shiftMonthName');
      if (title) title.textContent = AM[month - 1] || month;

      const hasColumn = model.getShiftMonths().some(m => m.month === month);
      if (!hasColumn || model.isFutureMonthAutoCopy(month, this.m + 1)) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:30px;">لا توجد بيانات فروز لهذا الشهر</p>';
        return;
      }

      const groups = model.groupByShift(month, { joinedOnly: true });
      const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);

      if (!sorted.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:30px;">لا توجد بيانات فروز للطلاب الملتحقين لهذا الشهر</p>';
        return;
      }

      grid.innerHTML = sorted
        .map(([shiftName, members]) => {
          const list = members.map(m => `<li>${mcn(m.name, m.phone, m.abbr)}</li>`).join('');
          const dropdown = members.length
            ? `<div class="names-dropdown"><button class="names-dropdown-btn"><span><i class="fas fa-users"></i> الأطباء الملتحقين (${members.length})</span><i class="fas fa-chevron-down"></i></button><ul class="names-dropdown-content">${list}</ul></div>`
            : '';
          return `<div class="shift-card-full"><h3><i class="fas fa-clipboard-list"></i> ${escapeHtml(shiftName)}</h3><div class="shift-stats"><div class="shift-stat"><div class="num">${members.length}</div><div class="lbl">عدد الأطباء الملتحقين</div></div></div>${dropdown}</div>`;
        })
        .join('');
    },

    /** Client-side filter over the rendered cards. */
    filterShf(term) {
      const t = (term || '').toLowerCase().trim();
      document.querySelectorAll('#shiftsGrid .shift-card-full').forEach(card => {
        card.style.display = !t || card.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

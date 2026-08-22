/**
 * لائحة المقيمين — roster table/cards, filters, selection and vCard export.
 *
 * Mixed into HospitalApp.prototype (see js/app.js). Reads `this.res` (the parsed
 * resident records) and `this.residentsModel` for anything column-related.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { smartSearch } = AUH.text;
  const { formatDisplayDate } = AUH.dates;
  const { isJoined, isDetachedStatus, getStatusBadgeClass } = AUH.status;
  const { mcn, showToast } = AUH.ui;

  AUH.views.residents = {
  /**
   * The roster's "المناوبات" column shows the value computed from the on-call
   * log, not a hand-maintained cell. Before the first computation finishes it
   * shows 0 rather than an unrelated column's value.
   */
  getComputedCumulativeOncalls(res) {
    if (!res) return 0;
    const stat = AUH.domain.doctorStats.findStatsFor(this.doctorStats, res.name, res.abbr);
    return stat ? stat.total : 0;
  },

  getFilteredList() {
    let list = this.res;
    if (this.filterDetached) list = list.filter(r => isDetachedStatus(r.st));
    else list = list.filter(r => !isDetachedStatus(r.st));

    if (this.filterJoined) list = list.filter(r => isJoined(r.st));
    if (this.filterSpecialty) list = list.filter(r => r.spec === this.filterSpecialty);
    if (this.filterShift) list = list.filter(r => r.monthlyShift === this.filterShift);
    if (this._lrs) {
      const t = this._lrs;
      list = list.filter(r => smartSearch(r.name + ' ' + r.abbr, t));
    }

    return list;
  },

  updateDetachedCountBtn() {
    const btn = document.getElementById('filterDetachedBtn');
    if (!btn) return;
    const detachedCount = this.res.filter(r => isDetachedStatus(r.st)).length;
    btn.innerHTML = '<i class="fas fa-user-slash"></i> المنفكين ' + detachedCount;
  },

  refreshSelectionUI() {
    const list = this.getFilteredList();
    const baseList = this.res.filter(r => !isDetachedStatus(r.st));
    const total = baseList.length;
    const joined = baseList.filter(r => isJoined(r.st)).length;

    document.getElementById('selectedCount').textContent = this.selectedResidents.size + ' محدد';
    const btn = document.getElementById('exportContactsBtn');
    btn.disabled = this.selectedResidents.size === 0;

    const sab = document.querySelector('.select-all-btn');
    if (this.selectedResidents.size === list.length && list.length > 0) sab.innerHTML = '<i class="fas fa-square"></i> إلغاء الكل';
    else sab.innerHTML = '<i class="fas fa-check-square"></i> تحديد الكل';

    document.querySelectorAll('.contact-checkbox').forEach(cb => {
      cb.checked = this.selectedResidents.has(cb.dataset.name);
    });

    const pb = document.getElementById('joinedPercentageBadge');
    if (this.filterJoined && total > 0) {
      pb.textContent = Math.round((joined / total) * 100) + '% (' + joined + '/' + total + ')';
      pb.style.display = 'inline-block';
    } else pb.style.display = 'none';

    this.updateDetachedCountBtn();
  },

  toggleSelectAll() {
    const list = this.getFilteredList();
    if (this.selectedResidents.size === list.length && list.length > 0) this.selectedResidents.clear();
    else list.forEach(r => this.selectedResidents.add(r.name));
    this.refreshSelectionUI();
  },

  toggleResident(name) {
    if (this.selectedResidents.has(name)) this.selectedResidents.delete(name);
    else this.selectedResidents.add(name);
    this.refreshSelectionUI();
  },

  displayResidents() {
    const tb = document.getElementById('residentsBody');
    const cd = document.getElementById('residentsCards');
    if (!tb || !cd) return;

    tb.innerHTML = '';
    cd.innerHTML = '';

    const list = this.getFilteredList();
    const fg = document.createDocumentFragment();

    list.forEach(res => {
      const ok = isJoined(res.st);
      const checked = this.selectedResidents.has(res.name) ? 'checked' : '';
      const statusClass = getStatusBadgeClass(res.st);

      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="seq-cell">${res.seq}</td><td><input type="checkbox" class="contact-checkbox" data-name="${res.name.replace(/"/g, '&quot;')}" ${checked} onchange="app.toggleResident('${res.name.replace(/'/g, "\\'")}')"></td><td style="text-align:right;">${mcn(res.name, res.phone)}</td><td>${res.abbr}</td><td>${res.spec}</td><td><span dir="ltr">${res.phone}</span> <button class="copy-btn" onclick="copyPhone('${res.phone}',this)"><i class="fas fa-copy"></i></button></td><td>${res.monthlyShift || '-'}</td><td>${formatDisplayDate(res.join) || '-'}</td><td>${this.formatNumDisplay(this.getComputedCumulativeOncalls(res))}</td><td><span class="status-badge ${ok ? 'status-joined' : statusClass}">${ok ? '<i class="fas fa-circle-check"></i>' : '<i class="fas fa-hourglass-half"></i>'} ${res.st || 'غير محدد'}</span></td>`;
      fg.appendChild(tr);

      const c = document.createElement('div');
      c.className = 'resident-card';
      c.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><span class="seq-badge">${res.seq}</span><input type="checkbox" class="contact-checkbox" data-name="${res.name.replace(/"/g, '&quot;')}" ${checked} onchange="app.toggleResident('${res.name.replace(/'/g, "\\'")}')"><div class="card-header" style="flex:1;margin:0;padding:0;border:none;min-width:0;"><span class="card-name" style="word-break:break-word;">${mcn(res.name, res.phone)}</span><span class="card-abbr">${res.abbr}</span></div></div><div class="card-row"><span class="card-label">الاختصاص</span><span class="card-value">${res.spec || '-'}</span></div><div class="card-row"><span class="card-label">الهاتف</span><span class="card-value"><span dir="ltr">${res.phone || '-'}</span> ${res.phone ? `<button class="copy-btn" onclick="copyPhone('${res.phone}',this)"><i class="fas fa-copy"></i></button>` : ''}</span></div><div class="card-row"><span class="card-label">الفرز</span><span class="card-value">${res.monthlyShift || '-'}</span></div><div class="card-row"><span class="card-label">الالتحاق</span><span class="card-value">${formatDisplayDate(res.join) || '-'}</span></div><div class="card-row"><span class="card-label">المناوبات</span><span class="card-value">${this.formatNumDisplay(this.getComputedCumulativeOncalls(res))}</span></div><div class="card-row"><span class="card-label">الحالة</span><span class="card-value"><span class="status-badge ${ok ? 'status-joined' : statusClass}">${res.st || 'غير محدد'}</span></span></div>`;
      cd.appendChild(c);
    });

    tb.appendChild(fg);
    this.updateResCount();
    this.refreshSelectionUI();
  },

  updateResCount() {
    const list = this.getFilteredList();
    const baseList = this.res.filter(r => !isDetachedStatus(r.st));
    const total = baseList.length;
    const joined = baseList.filter(r => isJoined(r.st)).length;

    const ce = document.getElementById('residentCount');
    if (ce) ce.textContent = list.length + ' مقيم';

    const pb = document.getElementById('joinedPercentageBadge');
    if (this.filterJoined && total > 0) {
      pb.textContent = Math.round((joined / total) * 100) + '% (' + joined + '/' + total + ')';
      pb.style.display = 'inline-block';
    } else pb.style.display = 'none';
  },

  buildFilters() {
    const ss = document.getElementById('specialtyFilter');
    const sf = document.getElementById('shiftFilter');
    if (!ss || !sf) return;

    const specs = [...new Set(this.res.map(r => r.spec).filter(Boolean))].sort();
    const shifts = [...new Set(this.res.map(r => r.monthlyShift).filter(Boolean))].sort();

    ss.innerHTML = '<option value="">جميع الاختصاصات</option>' + specs.map(s => `<option value="${s}">${s}</option>`).join('');
    ss.value = this.filterSpecialty || '';

    sf.innerHTML = '<option value="">جميع الفروز</option>' + shifts.map(s => `<option value="${s}">${s}</option>`).join('');
    sf.value = this.filterShift || '';
  },

  filterBySpecialty() {
    this.filterSpecialty = document.getElementById('specialtyFilter').value;
    this.selectedResidents.clear();
    this.displayResidents();
  },

  filterByShift() {
    this.filterShift = document.getElementById('shiftFilter').value;
    this.selectedResidents.clear();
    this.displayResidents();
  },

  toggleFilter() {
    this.filterJoined = !this.filterJoined;
    const btn = document.getElementById('filterJoinedBtn');
    if (this.filterJoined) {
      btn.classList.add('active-filter');
      btn.innerHTML = '<i class="fas fa-filter"></i> إظهار الكل';
    } else {
      btn.classList.remove('active-filter');
      btn.innerHTML = '<i class="fas fa-filter"></i> الملتحقين فقط';
    }
    this.selectedResidents.clear();
    this.displayResidents();
  },

  toggleDetachedFilter() {
    this.filterDetached = !this.filterDetached;
    const btn = document.getElementById('filterDetachedBtn');
    if (btn) {
      if (this.filterDetached) btn.classList.add('active-filter');
      else btn.classList.remove('active-filter');
    }

    if (this.filterDetached && this.filterJoined) {
      this.filterJoined = false;
      const jbtn = document.getElementById('filterJoinedBtn');
      if (jbtn) {
        jbtn.classList.remove('active-filter');
        jbtn.innerHTML = '<i class="fas fa-filter"></i> الملتحقين فقط';
      }
    }

    this.selectedResidents.clear();
    this.displayResidents();
  },

  exportToContacts() {
    const sel = this.res.filter(r => this.selectedResidents.has(r.name) && r.phone && !isDetachedStatus(r.st));
    if (!sel.length) return;

    let vcf = '';
    for (const r of sel) {
      const np = r.name.split(' ');
      const ln = np.pop() || '';
      const fn = np.shift() || '';
      const mn = np.join(' ');
      vcf += 'BEGIN:VCARD\nVERSION:3.0\nFN:' + r.name + '\nN:' + ln + ';' + fn + ';' + mn + ';;\nTEL;TYPE=MOBILE:' + r.phone + '\nEND:VCARD\n';
    }

    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', 'contacts.vcf');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('تم تحميل جهات الاتصال!');
    }, 500);
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

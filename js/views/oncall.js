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
  const { mcn, showToast } = AUH.ui;
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

      const holidayName = this.getHolidayName(ds);

      let cls = 'calendar-day';
      if (it) cls += ' today';
      if (sel) cls += ' selected-day';
      if (pa && !sel) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';
      if (holidayName) cls += ' official-holiday';

      const holidayMark = holidayName
        ? `<span class="calendar-holiday-star" title="${escapeHtml(holidayName)}"><i class="fas fa-star"></i></span>` +
          `<span class="calendar-holiday-name">${escapeHtml(holidayName)}</span>`
        : '';

      h += `<div class="${cls}" onclick="app.clickCalendarDay('${ds}')"${holidayName ? ` title="${escapeHtml(holidayName)}"` : ''}>${day}${holidayMark}</div>`;
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
    if (!d || d.length <= startIdx) return '<p style="padding:16px;color:var(--text-secondary);">لا توجد بيانات.</p>';

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
    return anyRow ? html : '<p style="padding:16px;color:var(--text-secondary);">لا توجد بيانات.</p>';
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

  /**
   * مناوبو نفس الفرز — ليس فئة المناوبة اليومية، بل «فرز شهر N» في لائحة
   * المقيمين (`residentsModel.getShift`): من يشاركون نفس الفرز/الرواية، ومن
   * بينهم من يناوب في **اليوم المختار على التقويم** (`this.selectedOncallDate`
   * — افتراضياً اليوم الحقيقي، ويتغيّر مع كلّ نقرة على يوم آخر). مبنيّةٌ على
   * `this.doctorStats` الجاهزة (فيها كلّ مناوبةٍ مع تصنيف المجموعة وعلامة
   * الليلية)، لا على مسحٍ جديد للجدول.
   *
   * الفرزُ يخصّ السنة الأولى فقط (لا عمود «فرز» للسنة الثانية)، والشهرُ الذي
   * يُشتقّ منه فرزُ كلّ مقيم هو شهر **اليوم المختار نفسه**، لا شهر اليوم
   * الحقيقي ولا شهر التقويم المعروض بالضرورة (عادةً نفس الشيء، لكن الدقّة هنا
   * تمنع أي تضاربٍ لو اختلفا).
   */
  shiftGroupOptions() {
    const month = parseInt((this.selectedOncallDate || this.today).split('-')[1], 10);
    const groups = this.dataset.residents.groupByShift(month);
    return Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ar'));
  },

  syncShiftGroupOptions() {
    const list = document.getElementById('shiftGroupOptionsList');
    if (!list) return;
    const options = this.shiftGroupOptions();
    const signature = `${this.selectedOncallDate}:${options.join('|')}`;
    if (list.dataset.signature === signature) return;
    list.innerHTML = options.map(o => `<option value="${this.escapeHtml(o)}"></option>`).join('');
    list.dataset.signature = signature;
  },

  toggleShiftGroupFinder() {
    const wrap = document.getElementById('shiftGroupFinderWrap');
    if (!wrap) return;
    if (wrap.style.display === 'none' || !wrap.style.display) {
      this.renderShiftGroupFinder();
      wrap.style.display = 'block';
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      wrap.style.display = 'none';
    }
  },

  /** Re-renders the panel whenever the selected on-call day changes, only when it is actually open. */
  refreshShiftGroupFinderIfOpen() {
    const wrap = document.getElementById('shiftGroupFinderWrap');
    if (wrap && wrap.style.display !== 'none') this.renderShiftGroupFinder();
  },

  searchShiftGroup(value) {
    this.shiftGroupQuery = value || '';
    this.renderShiftGroupResults();
  },

  renderShiftGroupFinder() {
    const wrap = document.getElementById('shiftGroupFinderWrap');
    if (!wrap) return;
    const head = '<div class="oncall-raw-modal-head"><h4><i class="fas fa-people-group"></i> مناوبو نفس الفرز</h4>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
      '<button class="shift-group-save-btn" id="shiftGroupSaveBtn" onclick="app.downloadShiftGroupImage(this)" title="حفظ كصورة" aria-label="حفظ كصورة"><i class="fas fa-camera"></i></button>' +
      '<button class="shift-group-save-btn" onclick="app.showMonthlyShiftReport()" title="تقرير شهري" aria-label="تقرير شهري"><i class="fas fa-file-lines"></i></button>' +
      '<button class="oncall-raw-close-btn" onclick="app.toggleShiftGroupFinder()" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>' +
      '</div></div>';
    const dstr = this.selectedOncallDate || this.today;
    const dayLine = `<div class="shift-group-day"><i class="fas fa-calendar-day"></i> اليوم المختار: <strong>${getDayName(dstr)} ${dstr}</strong> — غيّره من التقويم فوق.</div>`;
    const search = `<div class="shift-group-search"><input type="text" id="shiftGroupInput" list="shiftGroupOptionsList" placeholder="اكتب اسم الفرز أو اختره — مثلاً: سابع" value="${this.escapeHtml(this.shiftGroupQuery || '')}" oninput="app.searchShiftGroup(this.value)"><datalist id="shiftGroupOptionsList"></datalist></div><div id="shiftGroupResults" class="shift-group-results"></div>`;
    wrap.innerHTML = head + dayLine + search;
    this.syncShiftGroupOptions();
    this.renderShiftGroupResults();
  },

  renderShiftGroupResults() {
    const el = document.getElementById('shiftGroupResults');
    if (!el) return;

    const query = (this.shiftGroupQuery || '').trim();
    if (!query) {
      el.innerHTML = '<p class="shift-group-empty">اكتب اسم الفرز أو اختره من اللائحة لترى مَن يناوب من أبناء فرزه في اليوم المختار.</p>';
      return;
    }

    const dstr = this.selectedOncallDate || this.today;
    const month = parseInt(dstr.split('-')[1], 10);
    const groups = this.dataset.residents.groupByShift(month);

    const matchKey = Object.keys(groups).find(k => normAr(k) === normAr(query)) ||
      Object.keys(groups).find(k => normAr(k).includes(normAr(query)));

    if (!matchKey) {
      el.innerHTML = `<p class="shift-group-empty">لا يوجد فرزٌ باسم «${this.escapeHtml(query)}» في شهر هذا اليوم.</p>`;
      return;
    }

    const residentsInGroup = groups[matchKey] || [];

    const entries = [];
    residentsInGroup.forEach(r => {
      const stat = AUH.domain.doctorStats.findStatsFor(this.doctorStats, r.name, r.abbr);
      (stat ? stat.assignments : []).forEach(a => {
        if (a.date !== dstr) return;
        entries.push(Object.assign({ name: r.name, abbr: r.abbr, phone: r.phone, phone2: r.phone2 }, a));
      });
    });

    // إسعاف المركز (الفئة المدموجة منذ 2026-10-06) مناوبةٌ واحدة ٢٤ ساعة —
    // ليست «نهارية» فعلياً رغم عدم احتواء اسمها على «ليلي»، فتُستثنى من
    // تقسيم الليلي/النهاري وتُحسَب ضمن «بقية المناوبات».
    const isMergedEmergencyCenter = e => normAr(e.category || '') === normAr('إسعاف مركز');

    // الترتيبُ المطلوب: إسعافُ الليل أوّلاً (الأشقّ، يحتاج تنسيقاً)، ثم باقي
    // المناوبات (فرزهم الأصلي غالباً)، ثم إسعافُ النهار أخيراً.
    const nightEmergency = entries.filter(e => e.group === 'emergency' && e.isNight && !isMergedEmergencyCenter(e));
    const dayEmergency = entries.filter(e => e.group === 'emergency' && !e.isNight && !isMergedEmergencyCenter(e));
    const rest = entries.filter(e => e.group !== 'emergency' || isMergedEmergencyCenter(e));

    const rowHtml = e => `<div class="shift-group-row${e.isCompleted ? ' is-done' : ''}"><span class="sg-name">${mcn(e.name, e.phone, e.abbr, e.phone2)}</span><span class="sg-cat">${this.escapeHtml(e.category)}</span>${e.isCompleted ? '<i class="fas fa-check sg-done-icon" title="تمّت"></i>' : ''}</div>`;

    const section = (title, icon, list, mod) => list.length
      ? `<div class="shift-group-section${mod ? ' ' + mod : ''}"><h5><i class="fas ${icon}"></i> ${title} <span class="count-badge">${list.length}</span></h5>${list.map(rowHtml).join('')}</div>`
      : '';

    const summary = `<div class="shift-group-summary"><i class="fas fa-circle-info"></i> <strong>${this.formatNumDisplay(residentsInGroup.length)}</strong> مقيم بفرز «${this.escapeHtml(matchKey)}» — <strong>${this.formatNumDisplay(entries.length)}</strong> منهم مناوبون يوم ${getDayName(dstr)} ${dstr}.</div>`;

    el.innerHTML = summary +
      section('إسعاف ليلي', 'fa-moon', nightEmergency, 'sg-night') +
      section('باقي المناوبات', 'fa-layer-group', rest) +
      section('إسعاف نهاري', 'fa-sun', dayEmergency, 'sg-day') +
      (entries.length ? '' : '<p class="shift-group-empty">لا أحد منهم مناوبٌ في هذا اليوم.</p>');
  },

  /**
   * تقريرٌ شهريٌّ كامل لفرزٍ واحد: كلّ أيام الشهر (لا يوم اليوم المختار
   * فقط)، ولكلٍّ عددُ المناوبين من أبناء هذا الفرز وأسماؤهم وفئاتهم. يُفتح
   * في نافذةٍ قابلة للطباعة/الحفظ PDF مباشرةً من المتصفح — بلا مكتبة PDF،
   * فمتصفّح المستخدم نفسه يملك هذه الخاصية أصلاً (حوار الطباعة ← حفظ كـPDF).
   */
  showMonthlyShiftReport() {
    const query = (this.shiftGroupQuery || '').trim();
    if (!query) { showToast('اختر فرزاً أوّلاً.'); return; }

    const dstr = this.selectedOncallDate || this.today;
    const [y, m] = dstr.split('-').map(Number);
    const groups = this.dataset.residents.groupByShift(m);
    const matchKey = Object.keys(groups).find(k => normAr(k) === normAr(query)) ||
      Object.keys(groups).find(k => normAr(k).includes(normAr(query)));
    if (!matchKey) { showToast('لا يوجد فرزٌ بهذا الاسم في شهر هذا اليوم.'); return; }

    const residentsInGroup = groups[matchKey] || [];
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const daysInMonth = new Date(y, m, 0).getDate();

    const byDate = {};
    residentsInGroup.forEach(r => {
      const stat = AUH.domain.doctorStats.findStatsFor(this.doctorStats, r.name, r.abbr);
      (stat ? stat.assignments : []).forEach(a => {
        if (!a.date.startsWith(monthKey)) return;
        (byDate[a.date] = byDate[a.date] || []).push({ name: r.name, category: a.category });
      });
    });

    const rows = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${monthKey}-${String(d).padStart(2, '0')}`;
      const list = (byDate[iso] || []).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      rows.push({ date: iso, dayName: getDayName(iso), list });
    }

    this.renderMonthlyReportModal(matchKey, y, m, rows, residentsInGroup.length);
  },

  renderMonthlyReportModal(matchKey, y, m, rows, memberCount) {
    let modal = document.getElementById('monthlyReportModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'monthlyReportModal';
      modal.className = 'report-modal';
      modal.hidden = true;
      modal.innerHTML =
        '<div class="report-box">' +
          '<div class="report-head"><h3><i class="fas fa-file-lines"></i> <span id="reportTitle"></span></h3>' +
            '<div class="report-head-actions">' +
              '<button type="button" class="report-print-btn" onclick="window.print()"><i class="fas fa-print"></i> طباعة / حفظ PDF</button>' +
              '<button type="button" class="oncall-raw-close-btn" onclick="document.getElementById(\'monthlyReportModal\').hidden=true" aria-label="إغلاق"><i class="fas fa-xmark"></i></button>' +
            '</div></div>' +
          '<div class="report-scroll" id="reportBody"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
    }

    document.getElementById('reportTitle').textContent = `تقرير فرز «${matchKey}» — ${AM[m - 1]} ${y} (${memberCount} مقيماً)`;

    const rowsHtml = rows.map(r => {
      const names = r.list.length
        ? `<ul class="report-names">${r.list.map(x =>
            `<li><span class="report-person">${escapeHtml(x.name)}</span><span class="report-cat">${escapeHtml(x.category)}</span></li>`
          ).join('')}</ul>`
        : '<span class="report-none">—</span>';
      return `<tr${r.list.length ? '' : ' class="report-row-empty"'}>` +
        `<td class="report-date">${r.date.slice(8)}/${r.date.slice(5, 7)}</td><td>${escapeHtml(r.dayName)}</td>` +
        `<td class="report-count">${r.list.length}</td><td>${names}</td></tr>`;
    }).join('');

    document.getElementById('reportBody').innerHTML =
      `<table class="report-table"><thead><tr><th>التاريخ</th><th>اليوم</th><th>العدد</th><th>الأسماء</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;

    modal.hidden = false;
  },

  /**
   * فئةٌ مدموجة (مثل «إسعاف مركز») في شهرها الانتقاليّ: البطاقةُ واحدة، لكن
   * داخلها مجموعتان كما كان الشيتُ يكتبهما قبل الدمج — فيعرف كلُّ مناوبٍ أين
   * اسمُه. يعتمد على `splitMonth` في قاعدة الدمج نفسها (`oncall-schedule.js`).
   *
   * تُعاد `null` إذا لم يكن اليومُ في ذلك الشهر، أو لم تكن هذه فئةً مدموجة، أو
   * لم تملك القاعدة شهراً انتقالياً أصلاً، أو لم يُعرف النصفان — وحينها تُرسم
   * البطاقةُ مجموعةً واحدة كأيّ فئةٍ أخرى. وأيُّ اسمٍ لا يُطابق نصفاً (إضافةٌ
   * تطوعية مثلاً) يُلحق بمجموعة «غير مقسوم» ولا يُحذف أبداً.
   */
  categoryMergeHalves(categoryName, dstr, names) {
    const rules = AUH.domain.oncallSchedule;
    const rule = rules.mergeRuleForMerged(categoryName);
    if (!rule || !rule.splitMonth || !dstr || dstr.slice(0, 7) !== rule.splitMonth) return null;

    const row = this.getOncRow(dstr);
    const halves = row && row.mergeHalves && row.mergeHalves[rule.key];
    if (!halves || halves.length < 2) return null;

    const yearId = this.yearForTab ? this.yearForTab('oncall') : 1;
    const pool = (names || []).slice();
    const take = raw => {
      const r = this.findRbyExact(raw, yearId);
      const key = r ? (r.abbr || r.name) : raw;
      let i = pool.findIndex(x => x.abbr === key);
      if (i < 0) i = pool.findIndex(x => normAr(x.name) === normAr(raw));
      return i < 0 ? null : pool.splice(i, 1)[0];
    };

    const groups = halves.map(h => ({
      label: this.shortHalfLabel(h.label),
      items: h.names.map(take).filter(Boolean)
    })).filter(g => g.items.length);

    if (groups.length < 2) return null;
    if (pool.length) groups.push({ label: 'غير مقسوم', items: pool });
    return groups;
  },

  /** «إسعاف مركز صباحي» → «نهاري» · «إسعاف مركز ليلي» → «ليلي». */
  shortHalfLabel(label) {
    const n = normAr(label || '');
    if (n.includes(normAr('ليلي'))) return 'ليلي';
    if (n.includes(normAr('صباحي')) || n.includes(normAr('نهاري'))) return 'نهاري';
    return label || '';
  },

  buildOncallCategoriesForDate(dstr, oncRows, oncHeaders, yearId) {
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
          const resident = this.findRbyExact(n, yearId);
          const fn = resident ? resident.name : n;
          const ph = resident ? resident.phone : '';
          const ph2 = resident ? resident.phone2 : '';
          const ab = resident ? resident.abbr : n;
          if (cats[cn].find(x => x.abbr === ab)) continue;

          cats[cn].push({ abbr: ab, name: fn, phone: ph, phone2: ph2, resAbbr: ab });
        }
      }
    }

    return cats;
  },

  /**
   * الإسعاف الداخلي يُقسَّم إلى فرق من ثلاثة: أول ثلاثة أسماء في خانة ذلك اليوم
   * فريق، والثلاثة التالون فريق، وهكذا — بترتيب ظهورهم في الجدول الرسمي.
   * تنطبق على السنة الأولى فقط، وعلى الإسعاف الداخلي (ليلي أو نهاري) دون غيره.
   */
  teamedCategory(categoryName, isYear1) {
    if (!isYear1) return false;
    const n = normAr(categoryName || '');
    return n.includes(normAr('اسعاف داخلي'));
  },

  /** Splits a duty's doctors into consecutive teams of three. */
  splitIntoTeams(names, size) {
    const per = size || 3;
    const teams = [];
    for (let i = 0; i < names.length; i += per) teams.push(names.slice(i, i + per));
    return teams;
  },

  /**
   * طلبُ المالك: في «اسعاف داخلي ليلي» تحديداً، إن اكتمل الفريق الثالث
   * بثلاثة أشخاص يُنقَل آخرُ اسمٍ فيه إلى الفريق الرابع — فيصبح الفريق ٣
   * شخصين، والفريق ٤ يكسب شخصاً إضافياً (ينشأ إن لم يكن موجوداً). لا
   * يمسّ الفريقين ١ و٢، ولا ينطبق على «اسعاف داخلي نهاري».
   */
  rebalanceNightInternalTeams(categoryName, teams) {
    if (normAr(categoryName || '') !== normAr('اسعاف داخلي ليلي')) return teams;
    if (!teams[2] || teams[2].length !== 3) return teams;
    const moved = teams[2].pop();
    if (!teams[3]) teams[3] = [];
    teams[3].unshift(moved);
    return teams;
  },

  oncallCategoriesSectionHtml(catEntries, dstr, isYear1) {
    if (!catEntries.length) return '';
    let h = '<div class="oncall-categories-grid">';
    for (const [cn, names] of catEntries) {
      const schedule = isYear1 ? this.getCategorySchedule(cn, dstr) : null;
      const scheduleHtml = schedule && (schedule.time || schedule.duration) ? `<div class="oncall-schedule-meta${schedule.isHoliday ? ' holiday' : ''}"><span>${schedule.time || '-'}</span><span>${schedule.duration || '-'}</span></div>` : '';

      const nameTag = n => `<span class="oncall-name-tag">${mcn(n.name, n.phone, n.resAbbr, n.phone2)}</span>`;

      const halves = isYear1 ? this.categoryMergeHalves(cn, dstr, names) : null;
      const teamed = !halves && this.teamedCategory(cn, isYear1) && names.length > 3;
      h += `<div class="oncall-category${schedule && schedule.isHoliday ? ' holiday' : ''}${teamed ? ' teamed' : ''}${halves ? ' halved' : ''}"><h4><span>${cn}</span><span class="cat-count">${names.length}</span></h4>${scheduleHtml}`;

      if (halves) {
        h += '<div class="oncall-teams oncall-halves">';
        halves.forEach(g => {
          h += `<div class="oncall-team"><span class="team-label half">${escapeHtml(g.label)}` +
            `<span class="half-n">${g.items.length}</span></span>` +
            `<div class="oncall-names-list">${g.items.map(nameTag).join('')}</div></div>`;
        });
        h += '</div><p class="oncall-halves-note"><i class="fas fa-circle-info"></i> ' +
          'المناوبة كاملة من ٦/١٠، والتقسيم نهاري/ليلي معروضٌ هذا الشهر كما هو في الجدول.</p>';
      } else if (teamed) {
        const teams = this.rebalanceNightInternalTeams(cn, this.splitIntoTeams(names, 3));
        h += '<div class="oncall-teams">';
        teams.forEach((team, i) => {
          h += `<div class="oncall-team"><span class="team-label">فريق ${i + 1}</span>` +
            `<div class="oncall-names-list">${team.map(nameTag).join('')}</div></div>`;
        });
        h += '</div>';
      } else {
        h += `<div class="oncall-names-list">${names.map(nameTag).join('')}</div>`;
      }
      h += '</div>';
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
            const cr = this.findRbyExact(n, this.yearForTab ? this.yearForTab('oncall') : 1);
            const abbr = cr ? cr.abbr || cr.name : n;
            if (abbr === excludeAbbr) return;
            if (!list.find(x => x.abbr === abbr)) list.push({ name: cr ? cr.name : n, abbr, phone: cr ? cr.phone : '', phone2: cr ? cr.phone2 : '' });
          });
        }
      }
    }

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
    this.refreshShiftGroupFinderIfOpen();

    const showY1 = this.oncallYearFilter === 'y1' || this.oncallYearFilter === 'y1y2';
    const showY2 = this.oncallYearFilter === 'y2' || this.oncallYearFilter === 'y1y2';
    const showBoth = this.oncallYearFilter === 'y1y2';

    const cats1 = showY1 ? this.buildOncallCategoriesForDate(dstr, this.oncRows, this.oncHeaders, this.yearForTab ? this.yearForTab('oncall') : 1) : {};
    const cats2 = showY2 ? this.buildOncallCategoriesForDate(dstr, this.oncRows2, this.oncHeaders2, 2) : {};
    const entries1 = Object.entries(cats1);
    const entries2 = Object.entries(cats2);

    if (!entries1.length && !entries2.length) {
      dp.innerHTML = `<div class="oncall-day-card"><h3><i class="fas fa-calendar-day"></i> ${dstr} - ${getDayName(dstr)}</h3><p style="color:var(--text-secondary);">لا توجد مناوبات لهذا التاريخ.</p></div>`;
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
      h += `<div class="oncall-year-section"><h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الأولى</h4>${entries1.length ? this.oncallCategoriesSectionHtml(entries1, dstr, true) : '<p style="color:var(--text-secondary);">لا توجد مناوبات مسجلة.</p>'}</div>`;
      h += `<div class="oncall-year-section"><h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الثانية</h4>${entries2.length ? this.oncallCategoriesSectionHtml(entries2, dstr, false) : '<p style="color:var(--text-secondary);">لا توجد مناوبات مسجلة.</p>'}</div>`;
    } else if (showY1) {
      h += entries1.length ? this.oncallCategoriesSectionHtml(entries1, dstr, true) : '<p style="color:var(--text-secondary);">لا توجد مناوبات مسجلة لهذا التاريخ.</p>';
    } else {
      h += entries2.length ? this.oncallCategoriesSectionHtml(entries2, dstr, false) : '<p style="color:var(--text-secondary);">لا توجد مناوبات مسجلة لهذا التاريخ.</p>';
    }

    h += `<div class="oncall-export-actions"><button class="download-btn" onclick="app.downloadOncallImage(this)"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل المناوبات كصورة</button></div></div>`;
    dp.innerHTML = h;
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

class HospitalApp {
  constructor() {
    this.m = new Date().getMonth();
    this.mn = AM[this.m];

    const n = new Date();
    this.today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    this.res = [];
    this.oncRows = [];
    this.oncHeaders = [];
    this.oncRows2 = [];
    this.oncHeaders2 = [];
    this.oncallYearFilter = 'y1';
    this.oncallAdjustments = [];
    this.adjustmentOverrides = new Map();
    this.adjustmentAdditions = [];
    this.evalData = [];
    this.linksData = [];
    this.qaData = [];
    this.lecturesData = [];
    this.lectures = [];

    this.doctorStats = [];
    this.doctorStatsSearchTerm = '';
    this.doctorStatsSort = { key: '', dir: '' };

    this.oncallRulesData = [];
    this.oncallRules = null;

    this._resHeaders = [];
    this._resRaw = null;
    this._resCols = {};
    this._oncRaw = null;
    this._onc2Raw = null;
    this._adjRaw = null;

    this.filterJoined = false;
    this.filterDetached = false;
    this.filterSpecialty = '';
    this.filterShift = '';
    this.currentMyInfo = null;

    this.lecturesSearchTerm = '';
    this.lecturesCategoryFilter = '';
    this.lecturesDeptFilter = '';
    this.lecturesYearFilter = '';
    this.showPastLectures = false;
    this.lecturesSelectedDate = '';
    this.lecturesCalendarMonth = this.m;
    this.lecturesCalendarYear = n.getFullYear();

    this.selectedResidents = new Set();
    this.currentDisplayMonth = this.m;
    this.currentShiftsMonth = this.m;
    this.userSelectedShiftsMonth = false;
    this.selectedOncallDate = this.today;

    this.showMyInfoPast = false;
    this.myInfoOncallBreakdown = 'monthTotal';
    this.currentMyInfoOncallStats = null;
    this.myInfoDetailPanel = 'cum';
    this.myInfoMonthKey = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
    this.lecturesUserSelectedDate = false;

    this._id = false;
    this._lrs = '';
    this._dataReady = false;
    this._buildId = (window.__APP_BUILD_ID__ || 'dev').trim();
    this._updateCheckRunning = false;

    this.init();
  }

  init() {
    document.getElementById('navContainer').innerHTML = buildNav();
    document.getElementById('mainContent').innerHTML = buildMainContent();
    this.ensureAdditionalStaticTabs();

    const yel = document.getElementById('currentYear');
    if (yel) yel.textContent = new Date().getFullYear();

    document.getElementById('currentDateHeader').textContent = new Date().toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    document.getElementById('oncallDatePicker').value = this.selectedOncallDate;
    document.getElementById('monthSelector').value = this.m;
    document.getElementById('oncallMonthTitle').textContent = this.m + 1;

    this.setupTabs();
    this.setupSearches();
    this.setupBackToTop();
    this.setupSupportShortcut();

    this.showLoading(false);
    this.loadData();

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.loadFresh(true);
        this.checkForAppUpdate();
      }
    });

    setInterval(() => {
      if (!document.hidden) {
        this.loadFresh(true);
      }
    }, 120000);

    setInterval(() => {
      if (!document.hidden) {
        this.checkForAppUpdate();
      }
    }, 90000);

      this.checkForAppUpdate();
  }

  extractBuildIdFromHtml(html) {
    const m = String(html || '').match(/<meta\s+name=["']app-build["']\s+content=["']([^"']+)["']/i);
    return m ? (m[1] || '').trim() : '';
  }

  async checkForAppUpdate() {
    if (this._updateCheckRunning) return;
    this._updateCheckRunning = true;

    try {
      const r = await fetch(`index.html?__check=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;

      const html = await r.text();
      const remoteBuild = this.extractBuildIdFromHtml(html);
      if (!remoteBuild || remoteBuild === this._buildId) return;

      this.clearOldAppCaches();
      location.replace(`./?v=${encodeURIComponent(remoteBuild)}`);
    } catch (e) {
    } finally {
      this._updateCheckRunning = false;
    }
  }

  async loadData() {
    const cached = this.loadFromCache();
    if (cached) {
      this.applyCachedData(cached);
      if (!this._dataReady) {
        await this.waitForHeaderImage();
        this._dataReady = true;
        this.showLoading(true);
      }
      this.loadFresh(true);
      return;
    }

    this.updateProgress(15, 'جاري جلب البيانات...');
    await this.loadFresh(false);

    if (!this._dataReady) {
      await this.waitForHeaderImage();
      this._dataReady = true;
      this.showLoading(true);
    }
  }

  applyCachedData(c) {
    if (c.residents) {
      this.renderRes(c.residents);
      this.buildFilters();
      this.renderShiftsFromResidents();
    }

    if (c.oncall) {
      this._oncRaw = c.oncall;
      this.parseOncallData(c.oncall);
    }

    if (c.oncall2) {
      this._onc2Raw = c.oncall2;
      this.parseOncallDataY2(c.oncall2);
    }

    if (c.adjustments) {
      this._adjRaw = c.adjustments;
      this.parseOncallAdjustments(c.adjustments);
    }
    this.resolveOncallAdjustments();

    if (c.oncall || c.oncall2) {
      this.renderMonthlyCalendar();
      this.showOncallDate(this.selectedOncallDate);
      this.renderOncallRawTable();
    }

    if (c.oncallRules) {
      this.oncallRulesData = c.oncallRules;
      this.parseOncallRules(c.oncallRules);
    }

    if (c.evaluation) this.evalData = c.evaluation;
    if (c.links) this.linksData = c.links;
    if (c.qa) this.qaData = c.qa;

    if (c.lectures) {
      this.lecturesData = c.lectures;
      this.parseLecturesData(c.lectures);
      this.renderLectures();
    }

    this.computeDoctorStats();
    this.renderDoctorStats();

    this.updateTime();
  }

  setupBackToTop() {
    const b = document.getElementById('backToTop');
    window.addEventListener(
      'scroll',
      () => {
        if (window.scrollY > 300) b.classList.add('show');
        else b.classList.remove('show');
      },
      { passive: true }
    );
  }

  setupSupportShortcut() {
    const b = document.getElementById('supportShortcut');
    if (!b) return;
    b.addEventListener('click', e => {
      e.preventDefault();
      this.openComplaintsTab();
    });
  }

  ensureAdditionalStaticTabs() {
    const root = document.getElementById('mainContent');
    if (!root) return;

    if (!document.getElementById('exams-tab')) {
      const sec = document.createElement('section');
      sec.className = 'tab-content';
      sec.id = 'exams-tab';
      sec.innerHTML =
        '<div class="section-header"><h2><i class="fas fa-file-pen"></i> الامتحانات والاختبارات</h2></div>' +
        '<div class="work-in-progress-panel"><i class="fas fa-screwdriver-wrench"></i><h3>هذا القسم قيد العمل والتطوير</h3><p>سيتم تحديثه في المستقبل</p></div>';
      root.appendChild(sec);
    }

    if (!document.getElementById('clinicalcases-tab')) {
      const sec = document.createElement('section');
      sec.className = 'tab-content';
      sec.id = 'clinicalcases-tab';
      sec.innerHTML =
        '<div class="section-header"><h2><i class="fas fa-stethoscope"></i> مشروع الحالات السريرية</h2></div>' +
        '<div class="work-in-progress-panel"><i class="fas fa-screwdriver-wrench"></i><h3>هذا القسم قيد العمل والتطوير</h3><p>سيتم تحديثه في المستقبل</p></div>';
      root.appendChild(sec);
    }
  }

  openComplaintsTab(doScroll = true) {
    if (typeof this.activateTab === 'function') this.activateTab('complaints', doScroll);
  }

  waitForHeaderImage(timeoutMs = 2200) {
    const img = document.querySelector('.header-bg-photo');
    if (!img) return Promise.resolve();
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();

    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.removeEventListener('load', finish);
        img.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
    });
  }

  showLoading(s) {
    const ls = document.getElementById('loadingScreen');
    if (s) {
      ls.classList.add('hidden');
      setTimeout(() => {
        ls.style.display = 'none';
      }, 400);
    } else {
      ls.style.display = 'flex';
      ls.classList.remove('hidden');
    }
  }

  updateProgress(p, txt) {
    document.getElementById('progressBar').style.width = p + '%';
    document.getElementById('loaderPercentage').textContent = p + '%';
    if (txt) document.getElementById('loaderSubtitle').textContent = txt;
  }

  setupTabs() {
    const activateTab = (tabId, doScroll) => {
      document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));

      const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
      if (btn) btn.classList.add('active');

      const tid = tabId + '-tab';
      const el = document.getElementById(tid);
      if (el) el.classList.add('active');

      localStorage.setItem('activeTab', tabId);
      if (doScroll) window.scrollTo({ top: 0, behavior: 'smooth' });

      if (tabId === 'evaluation') this.renderEval();
      if (tabId === 'links') this.renderLinks();
      if (tabId === 'qa') this.renderQA();
      if (tabId === 'shifts') this.renderShiftsFromResidents();
      if (tabId === 'lectures') this.renderLectures();
      if (tabId === 'doctorstats') this.renderDoctorStats();
      if (tabId === 'oncall') this.showOncallDate(this.selectedOncallDate);
    };

    this.activateTab = activateTab;

    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab, true)));

    const st = localStorage.getItem('activeTab');
    if (st) activateTab(st, false);
  }

  setupSearches() {
    document
      .getElementById('residentSearch')
      .addEventListener('input', debounce(e => {
        this._lrs = e.target.value;
        this.displayResidents();
        this.updateResCount();
        this.refreshSelectionUI();
      }, 120));

    document.getElementById('shiftSearch').addEventListener('input', debounce(e => this.filterShf(e.target.value), 120));
    document.getElementById('myInfoSearch').addEventListener('input', debounce(e => this.searchMe(e.target.value), 130));
    document.getElementById('evalSearch').addEventListener('input', debounce(e => this.filterEval(e.target.value), 120));
    document.getElementById('qaSearch').addEventListener('input', debounce(e => this.filterQA(e.target.value), 120));

    const ls = document.getElementById('lecturesSearch');
    if (ls) {
      ls.addEventListener(
        'input',
        debounce(e => {
          this.lecturesSearchTerm = e.target.value || '';
          this.renderLectures();
        }, 120)
      );
    }

    const ds = document.getElementById('doctorStatsSearch');
    if (ds) {
      ds.addEventListener(
        'input',
        debounce(e => {
          this.doctorStatsSearchTerm = e.target.value || '';
          this.renderDoctorStats();
        }, 120)
      );
    }
  }

  loadFromCache() {
    try {
      const r = localStorage.getItem(CK);
      if (!r) return null;
      const d = JSON.parse(r);
      if (!d.timestamp || Date.now() - d.timestamp > CD) return null;
      return d;
    } catch (e) {
      return null;
    }
  }

  saveToCache() {
    try {
      const d = {
        timestamp: Date.now(),
        residents: this._resRaw || null,
        oncall: this._oncRaw || null,
        oncall2: this._onc2Raw || null,
        adjustments: this._adjRaw || null,
        oncallRules: this.oncallRulesData || null,
        evaluation: this.evalData || null,
        links: this.linksData || null,
        qa: this.qaData || null,
        lectures: this.lecturesData || null
      };
      localStorage.setItem(CK, JSON.stringify(d));
    } catch (e) {}
  }

  async loadFresh(silent) {
    try {
      const [rd, od, o2d, ed, ld, qd, hd, ord, adjd] = await Promise.all([
        this.fetchCSV(GID_R),
        this.fetchJSON(GID_O),
        this.fetchCSV(GID_O2, SID2),
        this.fetchCSV(GID_E),
        this.fetchCSV(GID_L),
        this.fetchJSON(GID_Q),
        this.fetchCSV(GID_LEC),
        this.fetchCSV(GID_OR),
        this.fetchCSV(GID_ADJ)
      ]);

      this._resRaw = rd;
      this._oncRaw = od;
      this._onc2Raw = o2d;
      this._adjRaw = adjd;

      if (!silent) this.updateProgress(60, 'جاري عرض البيانات...');

      if (rd) {
        this.renderRes(rd);
        this.buildFilters();
        this.renderShiftsFromResidents();
      }

      if (od) this.parseOncallData(od);
      if (o2d) {
        this.parseOncallDataY2(o2d);
      } else {
        console.warn('[Year2] fetchCSV(GID_O2, SID2) returned null — check sheet sharing permissions ("Anyone with the link can view") and that GID_O2 is correct.');
      }
      if (adjd) this.parseOncallAdjustments(adjd);
      this.resolveOncallAdjustments();

      if (od || o2d) {
        const keepDate = this.selectedOncallDate || this.today;
        this.renderMonthlyCalendar();
        this.showOncallDate(keepDate);
        this.renderOncallRawTable();
      }

      if (ord) {
        this.oncallRulesData = ord;
        this.parseOncallRules(ord);
      }

      if (ed) this.evalData = ed;
      if (ld) this.linksData = ld;
      if (qd) this.qaData = qd;

      if (hd) {
        this.lecturesData = hd;
        this.parseLecturesData(hd);
        this.renderLectures();
      }

      this.computeDoctorStats();
      this.renderDoctorStats();

      this.saveToCache();
      if (!silent) this.updateProgress(100, 'تم التحميل');
      this.updateTime();
    } catch (e) {
      console.error(e);
      if (!silent) this.updateProgress(100, 'تعذر الاتصال');
    }
  }

  async fetchCSV(gid, sid = SID) {
    const url = `https://docs.google.com/spreadsheets/d/${sid}/gviz/tq?tqx=out:csv&gid=${gid}&_=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const b = await r.arrayBuffer();
      const t = new TextDecoder('utf-8').decode(b);
      if (t.includes('<!DOCTYPE') || t.includes('<html')) return null;
      return this.parseCSV(t);
    } catch (e) {
      return null;
    }
  }

  async fetchJSON(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:json&gid=${gid}&_=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const raw = await r.text();
      const s = raw.indexOf('{');
      const e = raw.lastIndexOf('}') + 1;
      if (s === -1 || e === 0) return null;
      const json = JSON.parse(raw.substring(s, e));
      if (!json || !json.table) return null;

      const cols = json.table.cols || [];
      const rows = json.table.rows || [];
      const result = [];
      const headers = [];
      for (const c of cols) headers.push(c.label || '');
      result.push(headers);

      for (const row of rows) {
        const cells = row.c || [];
        const rd = [];
        for (const cell of cells) {
          if (cell && cell.v !== null && cell.v !== undefined) rd.push(String(cell.v));
          else rd.push('');
        }
        if (rd.some(v => v !== '')) result.push(rd);
      }
      return result;
    } catch (e) {
      return null;
    }
  }

  parseCSV(text) {
    const result = [];
    const lines = text.split(/\r?\n/);
    let cr = [];
    let cf = '';
    let iq = false;
    let ce = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (iq) {
        const qi = line.indexOf('"');
        if (qi !== -1) {
          cf += '\n' + line.substring(0, qi);
          iq = false;
          cr.push(cf);
          cf = '';

          const rest = line.substring(qi + 1);
          if (rest.startsWith(',')) {
            const rf = this.parseCSVLine(rest.substring(1));
            for (const f of rf) cr.push(f);
          }

          if (cr.some(c => c !== '')) {
            result.push(cr);
            ce = 0;
          } else {
            ce++;
            if (ce >= 10) break;
          }
          cr = [];
        } else {
          cf += '\n' + line;
        }
        continue;
      }

      const fields = this.parseCSVLine(line);
      if (fields.some(c => c !== '')) {
        result.push(fields);
        ce = 0;
      } else {
        ce++;
        if (ce >= 10) break;
      }
    }

    if (cr.length && cr.some(c => c !== '')) result.push(cr);
    return result;
  }

  parseCSVLine(line) {
    const fields = [];
    let c = '';
    let iq = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (iq) {
          if (i + 1 < line.length && line[i + 1] === '"') {
            c += '"';
            i++;
          } else {
            iq = false;
          }
        } else {
          iq = true;
        }
      } else if (ch === ',' && !iq) {
        fields.push(c);
        c = '';
      } else {
        c += ch;
      }
    }
    fields.push(c);
    return fields;
  }

  clearOldAppCaches() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }
      keys.forEach(k => {
        if (k.startsWith('hc_v')) localStorage.removeItem(k);
      });
    } catch (e) {}
  }

  getHeaderIndex(headers, candidates) {
    const wants = (Array.isArray(candidates) ? candidates : [candidates]).map(x => normAr(x));
    for (let i = 0; i < headers.length; i++) {
      const hn = normAr((headers[i] || '').trim());
      if (!hn) continue;
      if (wants.some(w => hn === w || hn.includes(w))) return i;
    }
    return -1;
  }

  buildResidentColumnMap(headers) {
    const map = {
      name: this.getHeaderIndex(headers, ['الاسم الثلاثي', 'الاسم']),
      abbr: this.getHeaderIndex(headers, ['الاختصار']),
      spec: this.getHeaderIndex(headers, ['الاختصاص']),
      phone: this.getHeaderIndex(headers, ['رقم الهاتف', 'الهاتف']),
      join: this.getHeaderIndex(headers, ['تاريخ الالتحاق', 'الالتحاق']),
      cumulativeOnc: this.getHeaderIndex(headers, ['المناوبات+', 'المناوبات التراكمية', 'المناوبات']),
      status: this.getHeaderIndex(headers, ['الحالة'])
    };

    if (map.name < 0) map.name = 1;
    if (map.abbr < 0) map.abbr = 2;
    if (map.spec < 0) map.spec = 3;
    if (map.phone < 0) map.phone = 4;
    if (map.join < 0) map.join = 9;
    if (map.cumulativeOnc < 0) map.cumulativeOnc = 10;
    if (map.status < 0) map.status = 11;

    return map;
  }

  getResidentCell(row, key) {
    const idx = this._resCols && Number.isInteger(this._resCols[key]) ? this._resCols[key] : -1;
    if (idx < 0) return '';
    return (row[idx] || '').trim();
  }

  getShiftColIndex(headers, month) {
    const cm = month !== undefined ? month : this.m + 1;
    for (let i = 0; i < headers.length; i++) {
      const h = (headers[i] || '').trim();
      const m = h.match(/فرز\s+شهر\s+(\d+)/i);
      if (m && parseInt(m[1], 10) === cm) return i;
    }
    return -1;
  }

  getShiftFromRow(r, month) {
    const h = this._resHeaders || [];
    const idx = this.getShiftColIndex(h, month);
    if (idx < 0) return '';
    return (r[idx] || '').trim();
  }

  getAllShiftMonths() {
    const h = this._resHeaders || [];
    const months = [];
    for (let i = 0; i < h.length; i++) {
      const ht = (h[i] || '').trim();
      const m = ht.match(/فرز\s+شهر\s+(\d+)/i);
      if (m) months.push({ month: parseInt(m[1], 10), col: i, label: ht });
    }
    return months.sort((a, b) => a.month - b.month);
  }

  isFutureShiftMonthAutoCopy(month) {
    const current = this.m + 1;
    if (month <= current) return false;

    const h = this._resHeaders || [];
    const idx = this.getShiftColIndex(h, month);
    const prev = month === 1 ? 12 : month - 1;
    const pidx = this.getShiftColIndex(h, prev);
    if (idx < 0 || pidx < 0 || !this._resRaw || this._resRaw.length < 2) return false;

    let compared = 0;
    let same = 0;
    let hasMeaningful = false;

    for (let i = 1; i < this._resRaw.length; i++) {
      const r = this._resRaw[i];
      const name = this.getResidentCell(r, 'name');
      if (!name) continue;
      const status = this.getResidentCell(r, 'status');
      if (!isJoined(status)) continue;

      const cur = (r[idx] || '').trim();
      const prv = (r[pidx] || '').trim();
      if (!cur && !prv) continue;
      if (cur && cur !== 'غير محدد') hasMeaningful = true;
      compared++;
      if (cur === prv) same++;
    }

    return hasMeaningful && compared >= 10 && same === compared;
  }

  hasShiftDataForMonth(month) {
    const h = this._resHeaders || [];
    const idx = this.getShiftColIndex(h, month);
    if (idx < 0 || !this._resRaw || this._resRaw.length < 2) return false;
    if (this.isFutureShiftMonthAutoCopy(month)) return false;

    for (let i = 1; i < this._resRaw.length; i++) {
      const r = this._resRaw[i];
      if (!r) continue;
      const v = (r[idx] || '').trim();
      if (v && v !== 'غير محدد') return true;
    }
    return false;
  }

  getPreferredShiftMonth() {
    const allMonths = this.getAllShiftMonths();
    if (!allMonths.length) return this.m + 1;

    const current = this.m + 1;
    const next = current === 12 ? 1 : current + 1;
    if (this.hasShiftDataForMonth(next)) return next;
    if (this.hasShiftDataForMonth(current)) return current;

    const withData = allMonths.filter(m => this.hasShiftDataForMonth(m.month));
    if (withData.length) return withData[withData.length - 1].month;

    return allMonths[allMonths.length - 1].month;
  }

  renderShiftsFromResidents() {
    const allMonths = this.getAllShiftMonths();
    if (!this.userSelectedShiftsMonth) this.currentShiftsMonth = this.getPreferredShiftMonth() - 1;

    const sel = document.getElementById('shiftsMonthSelector');
    if (sel) {
      sel.innerHTML = allMonths
        .map(m => `<option value="${m.month}"${m.month === this.currentShiftsMonth + 1 ? ' selected' : ''}>${m.label || 'فرز شهر ' + m.month}</option>`)
        .join('');
    }

    this.dispShiftsByMonth(this.currentShiftsMonth + 1);
  }

  changeShiftsMonth() {
    const sel = document.getElementById('shiftsMonthSelector');
    if (!sel) return;
    this.userSelectedShiftsMonth = true;
    this.currentShiftsMonth = parseInt(sel.value, 10) - 1;
    this.dispShiftsByMonth(parseInt(sel.value, 10));
  }

  dispShiftsByMonth(month) {
    const h = this._resHeaders || [];
    const idx = this.getShiftColIndex(h, month);
    const g = document.getElementById('shiftsGrid');
    if (!g) return;

    g.innerHTML = '';
    document.getElementById('shiftMonthName').textContent = AM[month - 1];

    if (idx < 0 || !this._resRaw || this._resRaw.length < 2 || this.isFutureShiftMonthAutoCopy(month)) {
      g.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد بيانات فروز لهذا الشهر</p>';
      return;
    }

    const groups = {};
    for (let i = 1; i < this._resRaw.length; i++) {
      const r = this._resRaw[i];
      const name = this.getResidentCell(r, 'name');
      if (!name) continue;
      const status = this.getResidentCell(r, 'status');
      if (!isJoined(status)) continue;

      const sVal = (r[idx] || '').trim();
      if (!sVal || sVal === 'غير محدد') continue;
      const abbr = this.getResidentCell(r, 'abbr');
      const phone = this.getResidentCell(r, 'phone');
      if (!groups[sVal]) groups[sVal] = [];
      groups[sVal].push({ name, abbr, phone });
    }

    const sGroups = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    if (!sGroups.length) {
      g.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد بيانات فروز للطلاب الملتحقين لهذا الشهر</p>';
      return;
    }

    sGroups.forEach(([shiftName, members]) => {
      const c = document.createElement('div');
      c.className = 'shift-card-full';
      let mh = '';

      if (members.length > 0) {
        const nwc = members.map(m => `<li>${mcn(m.name, m.phone, m.abbr)}</li>`).join('');
        mh = `<div class="names-dropdown"><button class="names-dropdown-btn"><span><i class="fas fa-users"></i> الأطباء الملتحقين (${members.length})</span><i class="fas fa-chevron-down"></i></button><ul class="names-dropdown-content">${nwc}</ul></div>`;
      }

      c.innerHTML = `<h3><i class="fas fa-clipboard-list"></i> ${shiftName}</h3><div class="shift-stats"><div class="shift-stat"><div class="num">${members.length}</div><div class="lbl">عدد الأطباء الملتحقين</div></div></div>${mh}`;
      g.appendChild(c);
    });
  }

  toggleSelectAll() {
    const list = this.getFilteredList();
    if (this.selectedResidents.size === list.length && list.length > 0) this.selectedResidents.clear();
    else list.forEach(r => this.selectedResidents.add(r.name));
    this.refreshSelectionUI();
  }

  toggleResident(name) {
    if (this.selectedResidents.has(name)) this.selectedResidents.delete(name);
    else this.selectedResidents.add(name);
    this.refreshSelectionUI();
  }

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
  }

  updateDetachedCountBtn() {
    const btn = document.getElementById('filterDetachedBtn');
    if (!btn) return;
    const detachedCount = this.res.filter(r => isDetachedStatus(r.st)).length;
    btn.innerHTML = '<i class="fas fa-user-slash"></i> المنفكين ' + detachedCount;
  }

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
  }

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

  renderRes(d) {
    this.res = [];
    const tb = document.getElementById('residentsBody');
    const cd = document.getElementById('residentsCards');

    if (!d || d.length < 2) {
      if (tb) tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;">لا توجد بيانات</td></tr>';
      this.updateResCount();
      return;
    }

    const headers = d[0] || [];
    this._resHeaders = headers;
    this._resCols = this.buildResidentColumnMap(headers);

    for (let i = 1; i < d.length; i++) {
      const r = d[i];
      const name = this.getResidentCell(r, 'name');
      if (!name || name.includes('الاسم')) continue;

      const res = {
        seq: i + 1,
        name,
        abbr: this.getResidentCell(r, 'abbr'),
        spec: this.getResidentCell(r, 'spec'),
        phone: this.getResidentCell(r, 'phone'),
        join: this.getResidentCell(r, 'join'),
        onc: this.getResidentCell(r, 'cumulativeOnc'),
        cumulativeOnc: this.getResidentCell(r, 'cumulativeOnc'),
        st: this.getResidentCell(r, 'status'),
        monthlyShift: this.getShiftFromRow(r)
      };
      this.res.push(res);
    }

    this.displayResidents();
  }

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
      tr.innerHTML = `<td class="seq-cell">${res.seq}</td><td><input type="checkbox" class="contact-checkbox" data-name="${res.name.replace(/"/g, '&quot;')}" ${checked} onchange="app.toggleResident('${res.name.replace(/'/g, "\\'")}')"></td><td style="text-align:right;">${mcn(res.name, res.phone)}</td><td>${res.abbr}</td><td>${res.spec}</td><td><span dir="ltr">${res.phone}</span> <button class="copy-btn" onclick="copyPhone('${res.phone}',this)"><i class="fas fa-copy"></i></button></td><td>${res.monthlyShift || '-'}</td><td>${res.join || '-'}</td><td>${res.onc || '-'}</td><td><span class="status-badge ${ok ? 'status-joined' : statusClass}">${ok ? '<i class="fas fa-circle-check"></i>' : '<i class="fas fa-hourglass-half"></i>'} ${res.st || 'غير محدد'}</span></td>`;
      fg.appendChild(tr);

      const c = document.createElement('div');
      c.className = 'resident-card';
      c.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;"><span class="seq-badge">${res.seq}</span><input type="checkbox" class="contact-checkbox" data-name="${res.name.replace(/"/g, '&quot;')}" ${checked} onchange="app.toggleResident('${res.name.replace(/'/g, "\\'")}')"><div class="card-header" style="flex:1;margin:0;padding:0;border:none;min-width:0;"><span class="card-name" style="word-break:break-word;">${mcn(res.name, res.phone)}</span><span class="card-abbr">${res.abbr}</span></div></div><div class="card-row"><span class="card-label">الاختصاص</span><span class="card-value">${res.spec || '-'}</span></div><div class="card-row"><span class="card-label">الهاتف</span><span class="card-value"><span dir="ltr">${res.phone || '-'}</span> ${res.phone ? `<button class="copy-btn" onclick="copyPhone('${res.phone}',this)"><i class="fas fa-copy"></i></button>` : ''}</span></div><div class="card-row"><span class="card-label">الفرز</span><span class="card-value">${res.monthlyShift || '-'}</span></div><div class="card-row"><span class="card-label">الالتحاق</span><span class="card-value">${res.join || '-'}</span></div><div class="card-row"><span class="card-label">المناوبات</span><span class="card-value">${res.onc || '-'}</span></div><div class="card-row"><span class="card-label">الحالة</span><span class="card-value"><span class="status-badge ${ok ? 'status-joined' : statusClass}">${res.st || 'غير محدد'}</span></span></div>`;
      cd.appendChild(c);
    });

    tb.appendChild(fg);
    this.updateResCount();
    this.refreshSelectionUI();
  }

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
  }

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
  }

  filterBySpecialty() {
    this.filterSpecialty = document.getElementById('specialtyFilter').value;
    this.selectedResidents.clear();
    this.displayResidents();
  }

  filterByShift() {
    this.filterShift = document.getElementById('shiftFilter').value;
    this.selectedResidents.clear();
    this.displayResidents();
  }

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
  }

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
  }

  filterShf(term) {
    const t = term.toLowerCase().trim();
    const cards = document.querySelectorAll('#shiftsGrid .shift-card-full');
    cards.forEach(c => {
      if (!t) {
        c.style.display = '';
        return;
      }
      c.style.display = c.textContent.toLowerCase().includes(t) ? '' : 'none';
    });
  }

  renderEval() {
    const head = document.getElementById('evalHead');
    const body = document.getElementById('evalBody');
    const cards = document.getElementById('evalCards');
    if (!head || !body || !cards) return;

    head.innerHTML = '';
    body.innerHTML = '';
    cards.innerHTML = '';

    const d = this.evalData;
    if (!d || d.length < 2) {
      body.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:40px;">لا توجد بيانات</td></tr>';
      return;
    }

    const lastCol = 14;
    const headers = d[0];
    let h = '<tr>';
    for (let i = 1; i <= lastCol; i++) {
      let hl = headers[i] || '';
      if (i === 13) hl = 'الثناءات';
      if (i === 14) hl = 'العقوبات';
      h += `<th>${hl}</th>`;
    }
    h += '</tr>';
    head.innerHTML = h;

    let bh = '';
    let ch = '';

    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      if (!row || !row.length) continue;

      const isEx = (row[1] || '').trim() === 'مثال توضيحي';
      bh += `<tr${isEx ? ' class="example-row"' : ''}>`;

      for (let j = 1; j <= lastCol; j++) {
        let cc = '';
        if (j === 13) cc = ' class="eval-praise-cell"';
        if (j === 14) cc = ' class="eval-penalty-cell"';

        let cv = row[j] || '-';
        if ((j === 13 || j === 14) && cv && cv !== '-' && cv.trim()) cv = `<span class="${j === 13 ? 'praise-badge' : 'penalty-badge'}">${cv}</span>`;

        bh += `<td${cc}>${cv}</td>`;
      }
      bh += '</tr>';

      if (i >= 3 && !isEx) {
        ch += `<div class="resident-card"><div class="card-header"><span class="card-name">${row[1] || ''} (${row[2] || ''})</span><span class="card-abbr">${row[3] || ''}</span></div>`;
        for (let j = 4; j <= lastCol; j++) {
          let hl = headers[j] || '';
          if (j === 13) hl = 'الثناءات';
          if (j === 14) hl = 'العقوبات';

          let cv = row[j] || '-';
          let cvc = '';
          if (j === 13) {
            cvc = 'color:#27ae60;font-weight:600;';
            if (cv && cv !== '-' && cv.trim()) cv = `<span class="praise-badge">${cv}</span>`;
          }
          if (j === 14) {
            cvc = 'color:#e74c3c;font-weight:600;';
            if (cv && cv !== '-' && cv.trim()) cv = `<span class="penalty-badge">${cv}</span>`;
          }
          ch += `<div class="card-row"><span class="card-label">${hl}</span><span class="card-value" style="${cvc}">${cv}</span></div>`;
        }
        ch += '</div>';
      }
    }

    body.innerHTML = bh;
    cards.innerHTML = ch;
    this.filterEval(document.getElementById('evalSearch')?.value || '');
  }

  filterEval(term) {
    const t = (term || '').toLowerCase().trim();
    document.querySelectorAll('#evalBody tr').forEach(r => {
      if (!t) {
        r.style.display = '';
        return;
      }
      r.style.display = r.textContent.toLowerCase().includes(t) ? '' : 'none';
    });

    document.querySelectorAll('#evalCards .resident-card').forEach(c => {
      if (!t) {
        c.style.display = '';
        return;
      }
      c.style.display = c.textContent.toLowerCase().includes(t) ? '' : 'none';
    });
  }

  formatLink(l) {
    if (!l || !l.trim()) return '<span style="color:var(--text-secondary);">-</span>';
    const lt = l.trim();
    if (lt.startsWith('http')) return `<a href="${lt}" target="_blank" class="link-url"><i class="fas fa-external-link-alt"></i> فتح الرابط</a>`;
    return `<span style="color:var(--text);font-weight:600;">${lt}</span>`;
  }

  renderLinks() {
    const grid = document.getElementById('linksGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const d = this.linksData;
    if (!d || d.length < 2) {
      grid.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد بيانات</p>';
      return;
    }

    let th = '<div class="table-wrapper desktop-table"><table><thead><tr><th>ت</th><th>الاسم</th><th>النوع</th><th>الغاية والهدف</th><th>الاعضاء</th><th>رابط الانضمام</th></tr></thead><tbody>';
    let ch = '<div class="mobile-cards">';

    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      if (!row || !row[1] || !row[1].trim()) continue;
      const seq = row[0] || '';
      const nm = row[1] || '';
      const tp = row[2] || '';
      const pp = row[3] || '';
      const mb = row[4] || '';
      const lk = row[5] || '';

      th += `<tr><td style="font-weight:700;color:#0f6ecf;">${seq}</td><td><strong>${nm}</strong></td><td>${tp}</td><td>${pp}</td><td>${mb}</td><td>${this.formatLink(lk)}</td></tr>`;
      ch += `<div class="link-card"><span style="font-size:11px;color:var(--text-secondary);">#${seq}</span><div class="link-title"><span class="link-label">الاسم:</span> ${nm}</div>${tp ? `<div><span class="link-label">النوع:</span> <span class="link-type">${tp}</span></div>` : ''}${pp ? `<div class="link-desc"><span class="link-label">الغاية والهدف:</span> ${pp}</div>` : ''}${mb ? `<div class="link-members"><span class="link-label">الاعضاء:</span> ${mb}</div>` : ''}<div style="margin-top:8px;"><span class="link-label">رابط الانضمام:</span> ${this.formatLink(lk)}</div></div>`;
    }

    th += '</tbody></table></div>';
    ch += '</div>';
    grid.innerHTML = th + ch;
  }

  renderQA() {
    const container = document.getElementById('qaContainer');
    if (!container) return;
    container.innerHTML = '';

    const d = this.qaData;
    if (!d || d.length < 2) {
      container.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد أسئلة وأجوبة بعد.</p>';
      return;
    }

    const qi = [];
    for (let i = 1; i < d.length; i++) {
      const row = d[i];
      if (!row || row.length < 2) continue;
      const cat = (row[1] || '').trim();
      const q = (row[2] || '').trim();
      const a = (row[3] || '').trim();
      if (!q || !a || q === 'السؤال' || q === 'التصنيف' || cat === 'التصنيف') continue;
      qi.push({ category: cat || 'عام', question: q, answer: a });
    }

    if (!qi.length) {
      container.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد أسئلة وأجوبة بعد.</p>';
      return;
    }

    const cats = {};
    qi.forEach(item => {
      if (!cats[item.category]) cats[item.category] = [];
      cats[item.category].push(item);
    });

    let h = '';
    Object.keys(cats)
      .sort()
      .forEach(cat => {
        h += `<div class="qa-category-section"><button class="qa-category-header open" onclick="toggleQACategory(this)"><span><i class="fas fa-folder"></i> ${cat} (${cats[cat].length})</span><i class="fas fa-chevron-down"></i></button><div class="qa-category-content show">`;
        cats[cat].forEach(item => {
          h += `<div class="qa-card"><div class="qa-card-header" onclick="toggleQACard(this.parentElement)"><span class="qa-category-tag">${item.category}</span><span class="qa-question-text">${item.question}</span><i class="fas fa-chevron-down qa-toggle-icon"></i></div><div class="qa-answer">${item.answer}</div></div>`;
        });
        h += '</div></div>';
      });

    container.innerHTML = h;
    this.filterQA(document.getElementById('qaSearch')?.value || '');
  }

  filterQA(term) {
    const t = (term || '').toLowerCase().trim();
    document.querySelectorAll('.qa-card').forEach(c => {
      if (!t) {
        c.style.display = '';
        return;
      }
      c.style.display = c.textContent.toLowerCase().includes(t) ? '' : 'none';
    });

    document.querySelectorAll('.qa-category-section').forEach(s => {
      let hv = false;
      s.querySelectorAll('.qa-card').forEach(c => {
        if (c.style.display !== 'none') hv = true;
      });
      s.style.display = !t || hv ? '' : 'none';
    });
  }

  toAsciiDigits(v) {
    return toAsciiDigits(v);
  }

  parseLectureDate(v) {
    const src = this.toAsciiDigits(v || '').trim();
    if (!src) return '';

    const buildIso = (y, m, d) => {
      const yy = parseInt(y, 10);
      const mm = parseInt(m, 10);
      const dd = parseInt(d, 10);
      if (!yy || !mm || !dd) return '';
      const dt = new Date(yy, mm - 1, dd);
      if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return '';
      return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    };

    const gviz = src.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/i);
    if (gviz) {
      return buildIso(gviz[1], parseInt(gviz[2], 10) + 1, gviz[3]);
    }

    const ymd = src.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (ymd) {
      const iso = buildIso(ymd[1], ymd[2], ymd[3]);
      if (iso) return iso;
    }

    const ext = extractDate(src);
    if (ext) return ext;

    const clean = src
      .replace(/[,،]/g, ' ')
      .replace(/السبت|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const monthMap = {
      'كانون الثاني': 1,
      'يناير': 1,
      january: 1,
      jan: 1,
      شباط: 2,
      فبراير: 2,
      february: 2,
      feb: 2,
      اذار: 3,
      آذار: 3,
      مارس: 3,
      march: 3,
      mar: 3,
      نيسان: 4,
      ابريل: 4,
      أبريل: 4,
      april: 4,
      apr: 4,
      ايار: 5,
      أيار: 5,
      مايو: 5,
      may: 5,
      حزيران: 6,
      يونيو: 6,
      june: 6,
      jun: 6,
      تموز: 7,
      يوليو: 7,
      july: 7,
      jul: 7,
      اب: 8,
      آب: 8,
      اغسطس: 8,
      أغسطس: 8,
      august: 8,
      aug: 8,
      ايلول: 9,
      أيلول: 9,
      سبتمبر: 9,
      september: 9,
      sep: 9,
      sept: 9,
      تشرين: 10,
      'تشرين الاول': 10,
      'تشرين الأول': 10,
      اكتوبر: 10,
      أكتوبر: 10,
      october: 10,
      oct: 10,
      'تشرين الثاني': 11,
      نوفمبر: 11,
      november: 11,
      nov: 11,
      'كانون الاول': 12,
      'كانون الأول': 12,
      ديسمبر: 12,
      december: 12,
      dec: 12
    };

    const normMonthText = normAr(clean).toLowerCase();
    let matchedMonth = 0;
    for (const [k, m] of Object.entries(monthMap)) {
      if (normMonthText.includes(normAr(k).toLowerCase())) {
        matchedMonth = m;
        break;
      }
    }
    if (matchedMonth) {
      const nums = clean.match(/\d+/g) || [];
      const yRaw = nums.find(n => n.length === 4) || nums.find(n => parseInt(n, 10) > 31);
      let year = yRaw ? parseInt(yRaw, 10) : NaN;
      if (!Number.isFinite(year)) {
        const ys = nums.find(n => n.length <= 2);
        if (ys) year = parseInt(ys, 10) + 2000;
      }

      const dayCand = nums
        .map(n => parseInt(n, 10))
        .filter(n => n >= 1 && n <= 31)
        .find(n => n !== year && n !== year - 2000);

      if (Number.isFinite(year) && dayCand) {
        const iso = buildIso(year, matchedMonth, dayCand);
        if (iso) return iso;
      }
    }

    const nums = clean.match(/\d+/g);
    if (!nums || nums.length < 3) return '';

    let a = parseInt(nums[0], 10);
    let b = parseInt(nums[1], 10);
    let c = parseInt(nums[2], 10);
    if (!a || !b || !c) return '';

    if (a > 999) {
      const iso = buildIso(a, b, c);
      if (iso) return iso;
    }

    let year = c;
    if (year < 100) year += year < 50 ? 2000 : 1900;

    let day = a;
    let month = b;
    if (a <= 12 && b > 12) {
      month = a;
      day = b;
    }

    return buildIso(year, month, day);
  }

  parseTimeMinutes(v) {
    const s = this.toAsciiDigits(v).trim();
    if (!s) return null;
    const ampm = /pm|م\b/i.test(s) ? 'pm' : /am|ص\b/i.test(s) ? 'am' : '';
    const m = s.match(/(\d{1,2})(?:[:٫\.](\d{1,2}))?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    if (Number.isNaN(h) || Number.isNaN(min)) return null;
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  parseDurationMinutes(v) {
    const s = this.toAsciiDigits(v).trim();
    if (!s) return 60;
    const n = parseFloat((s.match(/\d+(?:\.\d+)?/) || [])[0] || '');
    if (Number.isNaN(n)) return 60;
    if (/دقيق/.test(s)) return Math.max(1, Math.round(n));
    if (/ساع|hour/i.test(s)) return Math.max(1, Math.round(n * 60));
    return Math.max(1, Math.round(n * 60));
  }

  buildLectureCols(headers) {
    return {
      date: this.getHeaderIndex(headers, ['التاريخ']),
      category: this.getHeaderIndex(headers, ['التصنيف']),
      title: this.getHeaderIndex(headers, ['العنوان']),
      content: this.getHeaderIndex(headers, ['المحتويات']),
      speaker: this.getHeaderIndex(headers, ['المحاضر']),
      place: this.getHeaderIndex(headers, ['المكان']),
      time: this.getHeaderIndex(headers, ['التوقيت']),
      duration: this.getHeaderIndex(headers, ['المدة']),
      dept: this.getHeaderIndex(headers, ['القسم']),
      year: this.getHeaderIndex(headers, ['السنة']),
      regLink: this.getHeaderIndex(headers, ['رابط التسجيل']),
      annLink: this.getHeaderIndex(headers, ['رابط الاعلان', 'رابط الإعلان'])
    };
  }

  lectureCell(row, idx) {
    if (!Number.isInteger(idx) || idx < 0) return '';
    return (row[idx] || '').trim();
  }

  escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatNumDisplay(v) {
    if (v === null || v === undefined || v === '') return '-';
    const n = safeNum(v);
    if (!Number.isFinite(n)) return '-';
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
  }

  parseLecturesData(d) {
    this.lectures = [];
    if (!d || d.length < 2) return;

    const headers = d[0] || [];
    const cols = this.buildLectureCols(headers);

    for (let i = 1; i < d.length; i++) {
      const row = d[i] || [];
      const title = this.lectureCell(row, cols.title);
      const dateRaw = this.lectureCell(row, cols.date);
      if (!title || !dateRaw) continue;

      const dateISO = this.parseLectureDate(dateRaw);
      if (!dateISO) continue;

      const timeRaw = this.lectureCell(row, cols.time);
      const startMin = this.parseTimeMinutes(timeRaw);
      const durationMin = this.parseDurationMinutes(this.lectureCell(row, cols.duration));

      const startAt =
        startMin === null
          ? new Date(`${dateISO}T00:00:00`)
          : new Date(`${dateISO}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}:00`);
      const endAt = startMin === null ? new Date(`${dateISO}T23:59:59`) : new Date(startAt.getTime() + durationMin * 60000);

      this.lectures.push({
        dateRaw,
        dateISO,
        category: this.lectureCell(row, cols.category),
        title,
        content: this.lectureCell(row, cols.content),
        speaker: this.lectureCell(row, cols.speaker),
        place: this.lectureCell(row, cols.place),
        time: timeRaw,
        duration: this.lectureCell(row, cols.duration),
        dept: this.lectureCell(row, cols.dept),
        year: this.lectureCell(row, cols.year),
        regLink: this.lectureCell(row, cols.regLink),
        annLink: this.lectureCell(row, cols.annLink),
        startAt,
        endAt
      });
    }
  }

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
  }

  filterLecturesByCategory() {
    const el = document.getElementById('lecturesCategoryFilter');
    this.lecturesCategoryFilter = el ? el.value : '';
    this.renderLectures();
  }

  filterLecturesByDept() {
    const el = document.getElementById('lecturesDeptFilter');
    this.lecturesDeptFilter = el ? el.value : '';
    this.renderLectures();
  }

  filterLecturesByYear() {
    const el = document.getElementById('lecturesYearFilter');
    this.lecturesYearFilter = el ? el.value : '';
    this.renderLectures();
  }

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
  }

  changeLecturesCalendarMonth(step) {
    const cur = new Date(this.lecturesCalendarYear, this.lecturesCalendarMonth, 1);
    cur.setMonth(cur.getMonth() + (step || 0));
    this.lecturesCalendarYear = cur.getFullYear();
    this.lecturesCalendarMonth = cur.getMonth();
    this.lecturesSelectedDate = `${this.lecturesCalendarYear}-${String(this.lecturesCalendarMonth + 1).padStart(2, '0')}-01`;
    this.lecturesUserSelectedDate = true;
    this.renderLectures();
  }

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
  }

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
  }

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
  }

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

    return `<article class="lecture-card${hero ? ' hero' : ''}"><div class="lecture-head"><h4>${this.escapeHtml(l.title)}</h4>${cat}</div><div class="lecture-date"><i class="fas fa-calendar-day"></i> ${this.escapeHtml(l.dateRaw)}</div>${l.content ? `<p class="lecture-content">${this.escapeHtml(l.content)}</p>` : ''}<div class="lecture-meta">${sp}${pl}${tm}${du}${dep}${yr}</div>${links ? `<div class="lecture-links-row">${links}</div>` : ''}</article>`;
  }

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

  classifyOncallGroup(cat) {
    const n = normAr(cat || '');
    if (n.startsWith(normAr('اسعاف')) || n.startsWith(normAr('إسعاف'))) return 'emergency';
    if (n.includes(normAr('عناية'))) return 'icu';
    if (['اورام', 'أورام', 'ديال'].some(x => n === normAr(x))) return 'misc';
    if (['تاني', 'ثاني', 'تالت', 'ثالث', 'رابع', 'خارجيات', 'سابع'].some(x => n === normAr(x))) return 'wards';
    return 'other';
  }

  computeDoctorStats() {
    // Doctor statistics are computed directly from the on-call log (GID_O) cross-referenced
    // with the residents roster (GID_R) — NOT read from a separately hand-maintained sheet
    // tab anymore, since that manual approach was unreliable. See DATA-MODEL.md.
    const statsMap = new Map();

    const blankEntry = (name, abbr, spec, join) => ({
      name,
      abbr: abbr || '',
      spec: spec || '',
      status: '',
      join: join || '',
      joinDaysSince: daysSinceDate(extractDate(join)),
      total: 0,
      completed: 0,
      remaining: 0,
      wards: 0,
      icu: 0,
      emergency: 0,
      misc: 0,
      holiday: 0,
      night: 0,
      hoursCompleted: 0,
      hoursTotal: 0,
      firstOncall: '',
      lastOncall: '',
      groupDetails: { wards: {}, icu: {}, emergency: {}, misc: {}, other: {} },
      catDates: {}
    });

    (this.res || []).forEach(r => {
      if (!r || !r.name) return;
      const key = r.abbr || r.name;
      statsMap.set(key, blankEntry(r.name, r.abbr, r.spec, r.join));
    });

    (this.oncRows || []).forEach(oncRow => {
      const ds = oncRow.date;
      const holiday = this.isHolidayDate(ds);

      for (let col = 2; col < this.oncHeaders.length; col++) {
        const cat = this.oncHeaders[col] || '';
        const cellVal = (oncRow.row[col] || '').trim();
        if (!cellVal) continue;

        const names = splitNames(cellVal);
        if (!names.length) continue;

        const sched = this.getCategorySchedule(cat, ds);
        const isNight = normAr(cat).includes(normAr('ليلي'));
        const group = this.classifyOncallGroup(cat);
        const isCompleted = ds < this.today;

        const seenInCell = new Set();
        names.forEach(nm => {
          const resident = this.findRbyExact(nm);
          const key = resident ? resident.abbr || resident.name : nm;
          if (seenInCell.has(key)) return;
          seenInCell.add(key);

          let entry = statsMap.get(key);
          if (!entry) {
            entry = blankEntry(resident ? resident.name : nm, resident ? resident.abbr : '', resident ? resident.spec : '', resident ? resident.join : '');
            statsMap.set(key, entry);
          }

          const overrideKey = `${ds}|${key}|${normAr(cat)}`;
          const hrs = this.adjustmentOverrides.has(overrideKey) ? this.adjustmentOverrides.get(overrideKey) : parseDurationHours(sched ? sched.duration : '');

          entry.total++;
          if (isCompleted) entry.completed++;
          else entry.remaining++;

          if (group === 'wards') entry.wards++;
          else if (group === 'icu') entry.icu++;
          else if (group === 'emergency') entry.emergency++;
          else if (group === 'misc') entry.misc++;

          const gd = entry.groupDetails[group] || entry.groupDetails.other;
          gd[cat] = (gd[cat] || 0) + 1;

          if (!entry.catDates[cat]) entry.catDates[cat] = [];
          entry.catDates[cat].push(ds);

          if (holiday) entry.holiday++;
          if (isNight) entry.night++;

          entry.hoursTotal += hrs;
          if (isCompleted) entry.hoursCompleted += hrs;

          if (!entry.firstOncall || ds < entry.firstOncall) entry.firstOncall = ds;
          if (!entry.lastOncall || ds > entry.lastOncall) entry.lastOncall = ds;
        });
      }
    });

    // Volunteer/added shifts from the adjustments sheet that weren't already in the
    // main on-call log for that person — added as brand-new entries.
    this.adjustmentAdditions.forEach(add => {
      const key = add.abbr || add.name;
      let entry = statsMap.get(key);
      if (!entry) {
        entry = blankEntry(add.name, add.abbr, '', '');
        statsMap.set(key, entry);
      }

      const ds = add.date;
      const isCompleted = ds < this.today;
      const holiday = this.isHolidayDate(ds);
      const isNight = normAr(add.category).includes(normAr('ليلي'));
      const group = this.classifyOncallGroup(add.category);

      entry.total++;
      if (isCompleted) entry.completed++;
      else entry.remaining++;

      if (group === 'wards') entry.wards++;
      else if (group === 'icu') entry.icu++;
      else if (group === 'emergency') entry.emergency++;
      else if (group === 'misc') entry.misc++;

      const gd = entry.groupDetails[group] || entry.groupDetails.other;
      gd[add.category] = (gd[add.category] || 0) + 1;

      if (!entry.catDates[add.category]) entry.catDates[add.category] = [];
      entry.catDates[add.category].push(ds);

      if (holiday) entry.holiday++;
      if (isNight) entry.night++;

      entry.hoursTotal += add.hours;
      if (isCompleted) entry.hoursCompleted += add.hours;

      if (!entry.firstOncall || ds < entry.firstOncall) entry.firstOncall = ds;
      if (!entry.lastOncall || ds > entry.lastOncall) entry.lastOncall = ds;
    });

    const list = Array.from(statsMap.values());

    const byCompleted = list.slice().sort((a, b) => b.hoursCompleted - a.hoursCompleted);
    byCompleted.forEach((e, i) => (e.rankCompleted = i + 1));
    const byTotal = list.slice().sort((a, b) => b.hoursTotal - a.hoursTotal);
    byTotal.forEach((e, i) => (e.rankTotal = i + 1));

    this.doctorStats = list;
  }

  getFilteredDoctorStats() {
    let list = this.doctorStats.slice();

    if (this.doctorStatsSearchTerm) {
      const q = this.doctorStatsSearchTerm;
      list = list.filter(x => smartSearch(`${x.name} ${x.abbr} ${x.spec}`, q));
    }

    if (this.doctorStatsSort.key === 'hours' && this.doctorStatsSort.dir === 'asc') {
      list.sort((a, b) => a.hoursCompleted - b.hoursCompleted);
    } else {
      list.sort((a, b) => b.hoursCompleted - a.hoursCompleted);
    }

    return list;
  }

  toggleDoctorStatsSort(key) {
    if (this.doctorStatsSort.key !== key) {
      this.doctorStatsSort = { key, dir: 'desc' };
    } else if (this.doctorStatsSort.dir === 'desc') {
      this.doctorStatsSort = { key, dir: 'asc' };
    } else {
      this.doctorStatsSort = { key: '', dir: '' };
    }

    this.renderDoctorStats();
  }

  groupDetailHtml(groupKey, groupDetails, uid) {
    const labels = { wards: 'أجنحة', icu: 'عنايات', emergency: 'اسعاف', misc: 'منوع' };
    const entries = Object.entries(groupDetails[groupKey] || {}).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const chips = entries.length
      ? entries.map(([k, v]) => `<span class="dsc-detail-chip">${this.escapeHtml(k)}: <strong>${v}</strong></span>`).join('')
      : '<span class="dsc-detail-empty">لا توجد تفاصيل</span>';
    const icons = { wards: 'fa-bed', icu: 'fa-heart-pulse', emergency: 'fa-truck-medical', misc: 'fa-shapes' };
    return `<button type="button" class="dsc-group" onclick="toggleCollapsible(this)"><i class="fas ${icons[groupKey]}"></i><span>${labels[groupKey]}</span><strong>${this.formatNumDisplay(total)}</strong><i class="fas fa-chevron-down dsc-group-chevron"></i></button><div class="collapsible-content dsc-group-detail" id="dscDetail-${uid}-${groupKey}">${chips}</div>`;
  }

  doctorStatCardHtml(r) {
    const uid = `${(r.abbr || r.name || '').replace(/[^a-zA-Z0-9أ-ي]/g, '_')}`;
    return `<div class="doctor-stat-card"><div class="dsc-head"><div class="dsc-name"><i class="fas fa-user-doctor"></i> ${this.escapeHtml(r.name)} ${r.abbr ? `<span class="dsc-abbr">(${this.escapeHtml(r.abbr)})</span>` : ''}</div></div>${r.spec ? `<div class="dsc-spec">${this.escapeHtml(r.spec)}</div>` : ''}<div class="dsc-hours-row"><div class="dsc-hours-box dsc-hours-primary"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursCompleted)}</div><div class="dsc-hours-lbl">ساعة (مناوبات تمّت)</div><div class="dsc-hours-rank">الترتيب: #${r.rankCompleted}</div></div><div class="dsc-hours-box"><div class="dsc-hours-num">${this.formatNumDisplay(r.hoursTotal)}</div><div class="dsc-hours-lbl">ساعة (تراكمية)</div><div class="dsc-hours-rank">الترتيب: #${r.rankTotal}</div></div></div><div class="dsc-top-row"><div class="dsc-mini"><span class="dsc-mini-num">${r.joinDaysSince ?? '-'}</span><span class="dsc-mini-lbl">يوم منذ الالتحاق</span></div><div class="dsc-mini"><span class="dsc-mini-num">${this.formatNumDisplay(r.total)}</span><span class="dsc-mini-lbl">مناوبات تراكمية</span></div><div class="dsc-mini"><span class="dsc-mini-num">${this.formatNumDisplay(r.completed)}</span><span class="dsc-mini-lbl">تمّت</span></div></div><div class="dsc-groups">${this.groupDetailHtml('wards', r.groupDetails, uid)}${this.groupDetailHtml('icu', r.groupDetails, uid)}${this.groupDetailHtml('emergency', r.groupDetails, uid)}${this.groupDetailHtml('misc', r.groupDetails, uid)}</div><div class="dsc-bottom-row"><span><i class="fas fa-umbrella-beach"></i> عطل: ${this.formatNumDisplay(r.holiday)}</span><span><i class="fas fa-moon"></i> ليلية: ${this.formatNumDisplay(r.night)}</span></div><div class="dsc-bottom-row"><span><i class="fas fa-calendar-day"></i> أول مناوبة: ${r.firstOncall || '-'}</span><span><i class="fas fa-calendar-check"></i> آخر مناوبة: ${r.lastOncall || '-'}</span></div></div>`;
  }

  downloadDoctorStatsExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('تعذر تحميل مكتبة إكسل، حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    if (!this.doctorStats.length) {
      showToast('لا توجد بيانات احصائيات لتصديرها.');
      return;
    }

    const round1 = v => Math.round((safeNum(v) || 0) * 10) / 10;

    const rosterOrder = new Map();
    (this.res || []).forEach((r, i) => rosterOrder.set(r.abbr || r.name, i));
    const list = this.doctorStats.slice().sort((a, b) => {
      const ai = rosterOrder.has(a.abbr || a.name) ? rosterOrder.get(a.abbr || a.name) : Infinity;
      const bi = rosterOrder.has(b.abbr || b.name) ? rosterOrder.get(b.abbr || b.name) : Infinity;
      return ai - bi;
    });
    const rows = list.map(r => ({
      'الاسم': r.name || '',
      'الاختصار': r.abbr || '',
      'أيام منذ الالتحاق': r.joinDaysSince ?? '',
      'مناوبات تراكمية': r.total || 0,
      'مناوبات تمت': r.completed || 0,
      'ساعات تمت': round1(r.hoursCompleted),
      'ترتيب الساعات (تمت)': r.rankCompleted || '',
      'ساعات تراكمية': round1(r.hoursTotal),
      'ترتيب الساعات (تراكمية)': r.rankTotal || '',
      'أجنحة': r.wards || 0,
      'عنايات': r.icu || 0,
      'اسعاف': r.emergency || 0,
      'منوع': r.misc || 0,
      'مناوبات عطل': r.holiday || 0,
      'مناوبات ليلية': r.night || 0,
      'أول مناوبة': r.firstOncall || '',
      'آخر مناوبة': r.lastOncall || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 15 }, { wch: 13 },
      { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 9 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 13 },
      { wch: 13 }, { wch: 13 }
    ];
    ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'احصائيات الأطباء');
    XLSX.writeFile(wb, `احصائيات_الاطباء_${this.today}.xlsx`);
  }

  renderDoctorStats() {
    const grid = document.getElementById('doctorStatsGrid');
    const countEl = document.getElementById('doctorStatsCount');
    if (!grid) return;

    const list = this.getFilteredDoctorStats();
    if (countEl) countEl.textContent = list.length;

    const sortHoursBtn = document.getElementById('sortHoursBtn');
    if (sortHoursBtn) {
      const active = this.doctorStatsSort.key === 'hours';
      sortHoursBtn.classList.toggle('active-filter', active);
      const label = active ? (this.doctorStatsSort.dir === 'asc' ? 'تصاعدي' : 'تنازلي') : 'تنازلي (تلقائي)';
      sortHoursBtn.innerHTML = `<i class="fas fa-arrow-down-wide-short"></i> ترتيب حسب عدد الساعات (${label})`;
    }

    if (!list.length) {
      grid.innerHTML = '<div class="no-results"><i class="fas fa-magnifying-glass"></i> لا يوجد نتائج مطابقة.</div>';
      return;
    }

    grid.innerHTML = list.map(r => this.doctorStatCardHtml(r)).join('');
  }


  parseOncallData(d) {
    this.oncRows = [];
    this.oncHeaders = [];
    if (!d || d.length < 2) return;

    const headerRow = d[0] || [];
    const firstDataRow = d[1] || [];
    const isHeaderRow = firstDataRow && (firstDataRow[0] || '').trim() === 'اليوم' && (firstDataRow[1] || '').includes('Date');
    const startIdx = isHeaderRow ? 2 : 1;

    this.oncHeaders = headerRow;
    document.getElementById('oncallMonthTitle').textContent = this.currentDisplayMonth + 1;

    for (let i = startIdx; i < d.length; i++) {
      const row = d[i];
      if (!row || !row.length) continue;

      let ds = row[1] || '';
      if (!ds) ds = row[0] || '';

      const dm = ds.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (dm) ds = `${parseInt(dm[1], 10)}-${String(parseInt(dm[2], 10) + 1).padStart(2, '0')}-${String(parseInt(dm[3], 10)).padStart(2, '0')}`;
      else ds = extractDate(ds) || '';

      if (ds) this.oncRows.push({ date: ds, day: row[0] || '', row });
    }
  }

  // Second-year on-call schedule: row 0 = merged group headers, row 1 = merged sub-role
  // headers (only meaningful inside "الاسعاف"), data starts row 2. Column 0 = date,
  // columns 1+ = one resident name per column. Normalized into the SAME shape/column
  // convention as Year-1 (`oncHeaders2[0]`/`[1]` placeholders, categories from index 2)
  // so the rendering code can treat both years uniformly.
  parseOncallDataY2(d) {
    this.oncRows2 = [];
    this.oncHeaders2 = [];
    if (!d || d.length < 3) {
      console.warn('[Year2] raw data too short or missing:', d && d.length);
      return;
    }

    const labels = buildYear2CategoryLabels(d[0] || [], d[1] || []);
    this.oncHeaders2 = ['اليوم', 'التاريخ', ...labels];

    const failedDates = [];
    for (let i = 2; i < d.length; i++) {
      const row = d[i];
      if (!row || !row.length) continue;

      const rawDate = row[0] || '';
      const ds = extractDate(rawDate) || '';
      if (!ds) {
        if (rawDate.trim()) failedDates.push(rawDate);
        continue;
      }

      const normalizedRow = ['', ds, ...row.slice(1)];
      this.oncRows2.push({ date: ds, day: getDayName(ds), row: normalizedRow });
    }

    // Diagnostic log — remove once Year-2 parsing is confirmed working end-to-end.
    if (this.oncRows2.length) {
      const dates = this.oncRows2.map(r => r.date).sort();
      console.log(`[Year2] parsed ${this.oncRows2.length} day(s): ${dates[0]} .. ${dates[dates.length - 1]}`);
      console.log('[Year2] sample row 0:', this.oncRows2[0]);
      console.log('[Year2] category labels:', labels);
    } else {
      console.warn('[Year2] parsed 0 rows from', d.length, 'raw rows. Raw row 2 (first expected data row):', d[2]);
    }
    if (failedDates.length) console.warn('[Year2] failed to parse these date cells:', failedDates);
  }

  // Manual on-call adjustments (GID_ADJ): overtime-hour corrections for specific
  // people on specific existing shifts, and/or brand-new volunteer shifts.
  // Columns: A=name, B=abbr, C=date (day-month-year), D=category, E=hours.
  parseOncallAdjustments(d) {
    this.oncallAdjustments = [];
    if (!d || d.length < 1) {
      console.warn('[Adjustments] raw data missing or empty:', d && d.length);
      return;
    }

    const headerCell = ((d[0] || [])[0] || '').trim();
    const startIdx = normAr(headerCell).includes(normAr('الاسم')) ? 1 : 0;

    const skipped = [];
    for (let i = startIdx; i < d.length; i++) {
      const row = d[i];
      if (!row || !row.length) continue;

      const name = (row[0] || '').trim();
      const abbr = (row[1] || '').trim();
      const dateRaw = (row[2] || '').trim();
      const category = (row[3] || '').trim();
      const hoursRaw = (row[4] || '').trim();
      if (!name && !abbr) continue;

      const ds = extractDate(dateRaw);
      const hours = safeNum(hoursRaw);
      if (!ds || !category || !Number.isFinite(hours)) {
        skipped.push(row);
        continue;
      }

      this.oncallAdjustments.push({ name, abbr, date: ds, category, hours });
    }

    console.log(`[Adjustments] parsed ${this.oncallAdjustments.length} row(s) from ${d.length} raw row(s).`);
    if (skipped.length) console.warn('[Adjustments] skipped unparsable rows:', skipped);
  }

  isResidentOnCallFor(dateIso, category, resAbbr) {
    const oncRow = this.oncRows.find(r => r.date === dateIso);
    if (!oncRow) return false;

    const col = this.oncHeaders.findIndex((h, i) => i >= 2 && normAr(h || '') === normAr(category));
    if (col < 0) return false;

    const cellVal = (oncRow.row[col] || '').trim();
    if (!cellVal) return false;

    return splitNames(cellVal).some(n => {
      const cr = this.findRbyExact(n);
      return cr ? cr.abbr === resAbbr : normAr(n) === normAr(resAbbr);
    });
  }

  // Turns raw adjustment rows into two things every other feature (stats, My Info,
  // the day-view calendar) reads from: `adjustmentOverrides` (a corrected hours value
  // for a person who WAS already on that shift) and `adjustmentAdditions` (a person who
  // was NOT already on that shift — a brand-new/volunteer entry). Must run after both
  // residents and the Year-1 on-call log are parsed (it needs both to tell the two cases apart).
  resolveOncallAdjustments() {
    this.adjustmentOverrides = new Map();
    this.adjustmentAdditions = [];

    this.oncallAdjustments.forEach(adj => {
      const resident = (adj.abbr && this.findRbyExact(adj.abbr)) || this.findRbyExact(adj.name);
      const abbr = resident ? resident.abbr || resident.name : adj.abbr || adj.name;
      const name = resident ? resident.name : adj.name;

      if (this.isResidentOnCallFor(adj.date, adj.category, abbr)) {
        const key = `${adj.date}|${abbr}|${normAr(adj.category)}`;
        this.adjustmentOverrides.set(key, adj.hours);
      } else {
        this.adjustmentAdditions.push({ date: adj.date, category: adj.category, name, abbr, hours: adj.hours });
      }
    });

    if (this.oncallAdjustments.length) {
      console.log(`[Adjustments] resolved: ${this.adjustmentOverrides.size} hour-override(s), ${this.adjustmentAdditions.length} new/volunteer addition(s).`);
    }
  }

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
  }

  parseOncallRules(d) {
    // Duty times/durations are now FIXED in code (see ONCALL_SCHEDULE_OLD /
    // ONCALL_SCHEDULE_NEW / ONCALL_SCHEDULE_SWITCH_DATE in helpers.js) and are
    // no longer read from the sheet. This tab is only still used (if present)
    // to read annual holiday dates listed under a "العطل السنوية" row.
    this.oncallRules = null;
    if (!d || d.length < 2) return;

    const annualHolidayDates = [];
    const annualStart = d.findIndex(r => normAr((r[0] || '').trim()).includes(normAr('العطل السنوية')));
    if (annualStart >= 0) {
      for (let i = annualStart + 1; i < d.length; i++) {
        const dateCandidate = extractDate((d[i] || [])[1] || '');
        if (dateCandidate) annualHolidayDates.push(dateCandidate);
      }
    }

    this.oncallRules = {
      annualHolidaySet: new Set(annualHolidayDates)
    };
  }

  isHolidayDate(dateIso) {
    if (!dateIso) return false;
    if (isWeekend(dateIso)) return true;
    if (!this.oncallRules) return false;
    return this.oncallRules.annualHolidaySet.has(dateIso);
  }

  getCategorySchedule(cat, dateIso) {
    const scheduleSet = (dateIso && dateIso >= ONCALL_SCHEDULE_SWITCH_DATE) ? ONCALL_SCHEDULE_NEW : ONCALL_SCHEDULE_OLD;

    const pickByNorm = name => {
      const target = normAr(name || '');
      const k = Object.keys(scheduleSet).find(x => normAr(x) === target);
      return k ? scheduleSet[k] : null;
    };

    let cfg = pickByNorm(cat);
    if (!cfg && (normAr(cat).startsWith(normAr('إسعاف')) || normAr(cat).startsWith(normAr('اسعاف')))) {
      cfg = Object.keys(scheduleSet)
        .map(k => ({ k, n: normAr(k) }))
        .find(x => x.n.startsWith(normAr('إسعاف')) || x.n.startsWith(normAr('اسعاف')));
      cfg = cfg ? scheduleSet[cfg.k] : null;
    }
    if (!cfg) return null;

    const holiday = this.isHolidayDate(dateIso);
    return {
      isHoliday: holiday,
      time: holiday ? cfg.holidayTime : cfg.workTime,
      duration: holiday ? cfg.holidayDuration : cfg.workDuration
    };
  }

  getOncRow(ds) {
    return this.oncRows.find(r => r.date === ds) || null;
  }

  findRbyExact(abbr) {
    if (!abbr) return null;
    return this.res.find(r => exactNameMatch(r.abbr, abbr)) || this.res.find(r => exactNameMatch(r.name, abbr)) || null;
  }

  changeMonth() {
    this.currentDisplayMonth = parseInt(document.getElementById('monthSelector').value, 10);
    const yr = parseInt(this.today.split('-')[0], 10);
    this.selectedOncallDate = `${yr}-${String(this.currentDisplayMonth + 1).padStart(2, '0')}-01`;
    document.getElementById('oncallDatePicker').value = this.selectedOncallDate;
    document.getElementById('oncallMonthTitle').textContent = this.currentDisplayMonth + 1;
    this.renderMonthlyCalendar();
    this.showOncallDate(this.selectedOncallDate);
  }

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
  }

  clickCalendarDay(ds) {
    document.getElementById('oncallDatePicker').value = ds;
    this.selectedOncallDate = ds;
    this.selectDayFromCalendar();
  }

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

      let cls = 'calendar-day';
      if (it) cls += ' today';
      if (sel) cls += ' selected-day';
      if (pa && !sel) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';
      if (hasVolunteer) cls += ' has-volunteer';

      h += `<div class="${cls}" onclick="app.clickCalendarDay('${ds}')">${day}${hasVolunteer ? '<span class="calendar-volunteer-dot" title="مناوبة تطوعية إضافية"></span>' : ''}</div>`;
    }

    h += '</div></div>';
    container.innerHTML = h;
  }

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
  }

  formatOncallRawNamesCell(v) {
    const s = String(v || '').trim();
    if (!s) return '';

    const parts = s
      .split(/[\n\r]+|[،,;؛]+/)
      .map(x => x.trim())
      .filter(Boolean);

    if (parts.length <= 1) return s;
    return parts.join('، ');
  }

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
  }

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
  }

  renderOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    if (!wrap) return;

    const showY1 = this.oncallYearFilter === 'y1' || this.oncallYearFilter === 'y1y2';
    const showY2 = this.oncallYearFilter === 'y2' || this.oncallYearFilter === 'y1y2';
    const showBoth = this.oncallYearFilter === 'y1y2';

    let body = '';
    if (showY1) {
      const d1 = this._oncRaw;
      const startIdx1 = (d1 && d1[1] && (d1[1][0] || '').trim() === 'اليوم') ? 2 : 1;
      if (showBoth) body += '<h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الأولى</h4>';
      body += this.oncallRawTableHtml(d1, startIdx1);
    }
    if (showY2) {
      const d2 = this.oncHeaders2.length ? [this.oncHeaders2, ...this.oncRows2.map(r => r.row)] : null;
      if (showBoth) body += '<h4 class="oncall-year-heading"><i class="fas fa-user-graduate"></i> السنة الثانية</h4>';
      body += this.oncallRawTableHtml(d2, 1);
    }

    const headHtml = '<div class="oncall-raw-modal-head"><h4><i class="fas fa-table"></i> جدول المناوبات كاملاً</h4><button class="oncall-raw-close-btn" onclick="app.toggleOncallRawTable()" aria-label="إغلاق"><i class="fas fa-xmark"></i></button></div>';
    wrap.innerHTML = headHtml + body;
  }

  toggleOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    const backdrop = document.getElementById('oncallRawBackdrop');
    if (!wrap) return;
    if (wrap.style.display === 'none' || !wrap.style.display) {
      this.renderOncallRawTable();
      wrap.style.display = 'block';
      if (backdrop) backdrop.classList.add('show');
      document.body.classList.add('oncall-raw-modal-open');
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      wrap.style.display = 'none';
      if (backdrop) backdrop.classList.remove('show');
      document.body.classList.remove('oncall-raw-modal-open');
    }
  }

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
  }

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
  }

  changeOncallYearFilter(val) {
    this.oncallYearFilter = val;
    document.querySelectorAll('.oncall-year-btn').forEach(b => b.classList.toggle('active', b.dataset.year === val));
    this.showOncallDate(this.selectedOncallDate);
    this.renderOncallRawTable();
  }

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

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const dn = getDayName(dstr);
    const we = this.isHolidayDate(dstr);
    const catCount = entries1.length + entries2.length;
    const totalDoctors = entries1.reduce((a, [, n]) => a + n.length, 0) + entries2.reduce((a, [, n]) => a + n.length, 0);

    let h = `<div class="oncall-day-card" id="oncallCardContent"><div class="oncall-card-head"><h3 class="${we ? 'weekend' : ''}"><i class="fas fa-calendar-day"></i> ${dstr} - ${dn}${we ? ' <span class="day-badge weekend">عطلة</span>' : ''}</h3><div class="oncall-card-stats"><span class="oncall-stat-pill"><i class="fas fa-layer-group"></i> ${catCount} فئة</span><span class="oncall-stat-pill"><i class="fas fa-user-doctor"></i> ${totalDoctors} طبيب</span></div></div><div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div>`;

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

  setDownloadBtnState(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = !!loading;
  }

  async _captureImage(el, fn, bg, btn) {
    if (this._id) return;
    this._id = true;
    this.setDownloadBtnState(btn, true);
    showDownloadProgress('جاري توليد الصورة...');
    updateDownloadProgress(5);

    let stage = null;
    try {
      await new Promise(requestAnimationFrame);
      const isOncall = el.id === 'oncallCardContent';
      const baseW = isOncall ? 840 : 920;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      // Always render at the highest quality tier — a single render scale for a crisp,
      // well anti-aliased source image (the on-screen "quality" the resident sees on their phone).
      const sc = Math.min(3.6, Math.max(2.85, dpr * 1.35));

      stage = document.createElement('div');
      stage.style.position = 'fixed';
      stage.style.left = '-10000px';
      stage.style.top = '0';
      stage.style.zIndex = '-1';
      stage.style.pointerEvents = 'none';

      const capNode = el.cloneNode(true);
      capNode.classList.add('capture-mode');
      capNode.style.width = baseW + 'px';
      capNode.style.maxWidth = baseW + 'px';
      capNode.style.margin = '0';

      stage.appendChild(capNode);
      document.body.appendChild(stage);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      updateDownloadProgress(14);

      const canvas = await html2canvas(capNode, {
        backgroundColor: bg,
        scale: sc,
        useCORS: true,
        allowTaint: true,
        logging: false
      });

      updateDownloadProgress(62);

      const pd = isOncall ? 20 : 22;
      const nc = document.createElement('canvas');
      nc.width = canvas.width + pd * 2;
      nc.height = canvas.height + pd * 2;

      const ctx = nc.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, nc.width, nc.height);
      ctx.drawImage(canvas, pd, pd);

      // Cap the FINAL exported dimensions to a size that WhatsApp/Telegram won't crush further
      // when the image is sent as a "photo": their own auto-compression is what causes the
      // "looks fine on the phone, blurry after sending" effect, and it hits oversized images
      // much harder. Keeping the output around ~2200px (instead of 3400+) means their pass has
      // far less downscaling to do, so what arrives on the other end looks noticeably sharper.
      const maxSide = 2200;
      const side = Math.max(nc.width, nc.height);
      let outCanvas = nc;

      if (side > maxSide) {
        const ratio = maxSide / side;
        outCanvas = document.createElement('canvas');
        outCanvas.width = Math.round(nc.width * ratio);
        outCanvas.height = Math.round(nc.height * ratio);
        const octx = outCanvas.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(nc, 0, 0, outCanvas.width, outCanvas.height);
      }

      updateDownloadProgress(86);

      const blob = await new Promise(res => outCanvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG export failed');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = fn;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      updateDownloadProgress(100);
      setTimeout(() => {
        hideDownloadProgress();
        this._id = false;
        this.setDownloadBtnState(btn, false);
        showToast('تم التحميل بجودة عالية! لأفضل نتيجة عند المشاركة عبر واتساب/تلغرام، اختر إرسالها "كملف/document" لا "كصورة" لتفادي إعادة الضغط.');
      }, 450);
    } catch (e) {
      console.error(e);
      hideDownloadProgress();
      this._id = false;
      this.setDownloadBtnState(btn, false);
      showToast('تعذر توليد الصورة. حاول مرة أخرى.');
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    }
  }

  downloadOncallImage(triggerBtn = null) {
    const el = document.getElementById('oncallCardContent');
    if (!el) return;
    const btn = triggerBtn || el.querySelector('.download-btn');
    const bg = document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff';
    this._captureImage(el, `مناوبات_${document.getElementById('oncallDatePicker').value || this.today}.png`, bg, btn);
  }

  downloadMyInfoImage() {
    const el = document.getElementById('myInfoContent');
    if (!el) return;
    const btn = el.querySelector('.download-btn');
    const bg = document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff';
    this._captureImage(el, `${this.currentMyInfo?.name || 'معلوماتي'}.png`, bg, btn);
  }

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
        .map((m, i) => `<div class="search-result-item" onclick="app.selectMe(${i})"><span><strong>${m.name}</strong> (${m.abbr})</span><span style="color:#0f6ecf;">${m.spec}</span></div>`)
        .join('');
      rd.classList.remove('show');
    }
  }

  selectMe(i) {
    if (this._sm && this._sm[i]) {
      document.getElementById('searchResultsList').innerHTML = '';
      this.showMe(this._sm[i]);
    }
  }

  getEvalForResident(name, abbr) {
    if (!this.evalData || this.evalData.length < 4) return null;
    const headers = this.evalData[0] || [];

    for (let i = 3; i < this.evalData.length; i++) {
      const row = this.evalData[i];
      if (!row || !row.length) continue;
      const rn = (row[1] || '').trim();
      const ra = (row[2] || '').trim();
      if (smartSearch(rn, name) || smartSearch(ra, abbr) || ra === abbr) {
        return {
          name: rn,
          abbr: ra,
          spec: row[3] || '-',
          skills: [
            { label: headers[4] || 'المهارات السريرية', value: row[4] || '-' },
            { label: headers[5] || 'المعرفة الطبية', value: row[5] || '-' },
            { label: headers[6] || 'اتخاذ القرار', value: row[6] || '-' },
            { label: headers[7] || 'المهارات الاجرائية', value: row[7] || '-' },
            { label: headers[8] || 'العمل ضمن فريق', value: row[8] || '-' },
            { label: headers[9] || 'المهنية والانضباط', value: row[9] || '-' },
            { label: headers[10] || 'التواصل مع المرضى', value: row[10] || '-' },
            { label: headers[11] || 'النشاطات الاكاديمية', value: row[11] || '-' }
          ],
          total: row[12] || '-',
          praise: row[13] || '',
          penalty: row[14] || ''
        };
      }
    }

    return null;
  }

  getDoctorStatsForResident(name, abbr) {
    return this.doctorStats.find(x => exactNameMatch(x.name, name) || exactNameMatch(x.abbr, abbr) || exactNameMatch(x.name, abbr)) || null;
  }

  toggleMyInfoPastOncalls() {
    if (!this.currentMyInfo) return;
    this.showMe(this.currentMyInfo);
  }

  getResidentShiftDaysDistribution(r) {
    const allMonths = this.getAllShiftMonths();
    const row =
      (this._resRaw || []).find(x => x && (exactNameMatch(this.getResidentCell(x, 'name'), r.name) || exactNameMatch(this.getResidentCell(x, 'abbr'), r.abbr))) || null;
    if (!row) return [];

    const year = new Date().getFullYear();
    const out = {};

    allMonths.forEach(mo => {
      const shift = (row[mo.col] || '').trim();
      if (!shift || shift === 'غير محدد') return;
      const days = new Date(year, mo.month, 0).getDate();
      out[shift] = (out[shift] || 0) + days;
    });

    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }

  buildOncallCategoryBreakdown(list) {
    const counts = {};
    (list || []).forEach(o => {
      counts[o.cat] = (counts[o.cat] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }

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
  }

  toggleMyInfoMonthBreakdown(kind) {
    if (!this.currentMyInfo) return;
    this.myInfoOncallBreakdown = this.myInfoOncallBreakdown === kind ? '' : kind;
    this.showMe(this.currentMyInfo);
  }

  toggleMyInfoDetail(kind) {
    if (!this.currentMyInfo) return;
    this.myInfoDetailPanel = this.myInfoDetailPanel === kind ? '' : kind;
    this.showMe(this.currentMyInfo);
  }

  changeMyInfoMonth(delta) {
    if (!this.currentMyInfo) return;
    const d = new Date(`${this.myInfoMonthKey || this.today.slice(0, 7)}-01T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    this.myInfoMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    this.showMe(this.currentMyInfo);
  }

  setMyInfoMonth(key) {
    if (!this.currentMyInfo || !key) return;
    this.myInfoMonthKey = key;
    this.showMe(this.currentMyInfo);
  }

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

      let cls = 'calendar-day';
      if (isToday) cls += ' today';
      if (isPast && !isToday) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';
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
      const datatipAttr = hasOncall ? `data-tip="${this.escapeHtml(cats.join('، '))}"` : '';
      h += `<div class="${cls}${this.myInfoFocusedOncallDate === ds ? ' selected-day' : ''}" data-date="${ds}" ${click} ${datatipAttr}>${day}${dotsHtml}</div>`;
    }

    h += '</div></div>';
    return h;
  }

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
  }

  getYear2ColleaguesForDate(dateIso, y1Category) {
    const y2Cats = YEAR2_CATEGORY_MAP[y1Category];
    if (!y2Cats || !y2Cats.length || !this.oncHeaders2.length) return [];

    const row = this.oncRows2.find(x => x.date === dateIso);
    if (!row) return [];

    const names = [];
    for (let col = 2; col < this.oncHeaders2.length; col++) {
      const cn = this.oncHeaders2[col] || '';
      if (!y2Cats.includes(cn)) continue;
      const cc = (row.row[col] || '').trim();
      if (!cc) continue;
      splitNames(cc).forEach(n => {
        if (n && !names.includes(n)) names.push(n);
      });
    }
    return names;
  }

  showMe(r) {
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
    if (this.myInfoOncallBreakdown && !this.currentMyInfoOncallStats[this.myInfoOncallBreakdown]) this.myInfoOncallBreakdown = '';

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

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

    const cumTotal = doctorStats?.total ?? allOncalls.length;
    const cumHours = doctorStats?.hoursTotal ?? 0;
    const doneTotal = doctorStats?.completed ?? allOncalls.filter(o => o.date < this.today).length;
    const doneHours = doctorStats?.hoursCompleted ?? 0;

    let h = `<div id="myInfoContent" style="padding:8px;"><div class="myinfo-profile-head"><div class="myinfo-heading-row"><h3><i class="fas fa-user"></i> ${r.name}</h3><span class="myinfo-heading-abbr">(${this.escapeHtml(r.abbr || '-')})</span><span class="myinfo-heading-seq">#${this.escapeHtml(String(r.seq || '-'))}</span></div></div><div class="myinfo-top-stats myinfo-top-stats-3"><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${this.formatNumDisplay(cumTotal)}</div><div class="cum-lbl">المناوبات التراكمية</div><div class="cum-sub">${this.formatNumDisplay(cumHours)} ساعة</div></div><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${this.formatNumDisplay(doneTotal)}</div><div class="cum-lbl">المناوبات التي تمّت</div><div class="cum-sub">${this.formatNumDisplay(doneHours)} ساعة</div></div><div class="cumulative-box myinfo-static-stat" style="margin:0;"><div class="cum-num">${joinDays ?? 0}</div><div class="cum-lbl">عدد الأيام منذ الالتحاق</div></div></div><div class="myinfo-breakdown-box"><h4><i class="fas fa-list"></i> توزيع المناوبات التراكمية</h4>${cumDetails.length ? `<div class="myinfo-breakdown-grid">${cumDetails.map(([k, v], idx) => {
      const dates = (catDates[k] || []).slice().sort();
      const detId = `miCatDates-${miUid}-${idx}`;
      return `<button type="button" class="myinfo-breakdown-item" onclick="toggleCollapsible(this)"><span>${this.escapeHtml(k)}</span><strong>${v}</strong></button><div class="collapsible-content myinfo-breakdown-detail" id="${detId}">${dates.length ? dates.map(d => `<span class="dsc-detail-chip">${d}</span>`).join('') : '<span class="dsc-detail-empty">لا توجد تواريخ</span>'}</div>`;
    }).join('')}</div>` : '<p>لا توجد بيانات لعرض التوزيع.</p>'}</div>`;

    h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-circle-info"></i> معلومات إضافية</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid"><div class="info-item"><div class="info-label">الاسم</div><div class="info-value">${r.name}</div></div><div class="info-item"><div class="info-label">الاختصار</div><div class="info-value">${r.abbr || '-'}</div></div><div class="info-item"><div class="info-label">الرقم التسلسلي</div><div class="info-value">#${r.seq || '-'}</div></div><div class="info-item"><div class="info-label">الاختصاص</div><div class="info-value">${r.spec}</div></div><div class="info-item"><div class="info-label">الهاتف</div><div class="info-value"><span dir="ltr">${r.phone}</span> <button class="copy-btn" onclick="copyPhone('${r.phone}',this)"><i class="fas fa-copy"></i></button></div></div><div class="info-item"><div class="info-label">تاريخ الالتحاق</div><div class="info-value">${r.join || '-'}</div></div><div class="info-item"><div class="info-label">الحالة</div><div class="info-value"><span class="status-badge ${ok ? 'status-joined' : getStatusBadgeClass(r.st)}">${ok ? '<i class="fas fa-circle-check"></i>' : '<i class="fas fa-hourglass-half"></i>'} ${r.st || 'غير محدد'}</span></div></div></div></div></div>`;

    if (evalInfo) {
      h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-chart-line"></i> التقييم السنوي</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid">`;
      for (const skill of evalInfo.skills) h += `<div class="info-item"><div class="info-label">${skill.label}</div><div class="info-value">${skill.value}</div></div>`;
      h += `</div>`;
      if (evalInfo.praise && evalInfo.praise.trim()) h += `<div style="margin-top:10px;padding:10px 14px;background:rgba(39,174,96,0.08);border-radius:10px;border-right:4px solid #27ae60;"><strong style="color:#27ae60;"><i class="fas fa-star"></i> الثناءات:</strong><br><span style="font-weight:600;color:#27ae60;">${evalInfo.praise}</span></div>`;
      if (evalInfo.penalty && evalInfo.penalty.trim()) h += `<div style="margin-top:6px;padding:10px 14px;background:rgba(231,76,60,0.08);border-radius:10px;border-right:4px solid #e74c3c;"><strong style="color:#e74c3c;"><i class="fas fa-triangle-exclamation"></i> العقوبات:</strong><br><span style="font-weight:600;color:#e74c3c;">${evalInfo.penalty}</span></div>`;
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
      h += '<p style="color:#888;">لا توجد بيانات فروز.</p>';
    }
    h += '</div></div>';

    h += `<div class="collapsible-section"><button class="collapsible-btn open" onclick="toggleCollapsible(this)"><span><i class="fas fa-calendar-days"></i> المناوبات (${totVisible})</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content show">`;

    if (allOncalls.length) {
      h += `<div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div><div class="myinfo-calendar-controls"><label class="myinfo-month-label" for="myInfoMonthSelect">الشهر</label><select class="month-selector" id="myInfoMonthSelect" onchange="app.setMyInfoMonth(this.value)">${oncallMonths
        .map(m => {
          const p = m.split('-');
          const y = p[0] || '';
          const mi = Math.max(0, parseInt(p[1] || '1', 10) - 1);
          const lbl = `${AM[mi] || m} ${y}`;
          return `<option value="${m}"${m === this.myInfoMonthKey ? ' selected' : ''}>${lbl}</option>`;
        })
        .join('')}</select></div>`;

      h += `<div class="myinfo-monthly-stats-grid"><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthOncalls.length}</div><div class="stat-lbl">عدد مناوبات الشهر</div></div><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthDone.length}</div><div class="stat-lbl">عدد المناوبات التي تمت</div></div><div class="stat-card myinfo-static-stat"><div class="stat-num">${monthRemaining.length}</div><div class="stat-lbl">عدد المناوبات المتبقية</div></div></div>`;

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
    } else h += '<p style="color:#888;">لا توجد مناوبات مسجلة.</p>';

    h += '</div></div>';
    h += `<button class="download-btn" onclick="app.downloadMyInfoImage()"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل معلوماتي كصورة</button></div>`;

    rd.innerHTML = h;
    rd.classList.add('show');
    document.getElementById('searchResultsList').innerHTML = '';

    setTimeout(() => this.updateMyInfoShift(r.name, r.abbr), 100);
  }

  updateMyInfoShift(name, abbr) {
    const cont = document.getElementById('myInfoShiftContent');
    if (!cont) return;

    const sel = document.getElementById('myInfoShiftMonth');
    if (!sel) return;

    const month = parseInt(sel.value, 10);
    const h = this._resHeaders || [];
    const idx = this.getShiftColIndex(h, month);

    if (idx < 0 || !this._resRaw || this._resRaw.length < 2 || this.isFutureShiftMonthAutoCopy(month)) {
      cont.innerHTML = '<p style="color:#888;">لا توجد بيانات لهذا الشهر.</p>';
      return;
    }

    const shiftVal = (this._resRaw.find(r => r && this.getResidentCell(r, 'name') === name) || [])[idx] || '';
    const shiftName = shiftVal.trim();

    const members = [];
    for (let i = 1; i < this._resRaw.length; i++) {
      const r = this._resRaw[i];
      const mname = this.getResidentCell(r, 'name');
      if (!mname) continue;

      const status = this.getResidentCell(r, 'status');
      if (!isJoined(status)) continue;

      const sv = (r[idx] || '').trim();
      if (sv === shiftName && sv && sv !== 'غير محدد') {
        const mabbr = this.getResidentCell(r, 'abbr');
        const mphone = this.getResidentCell(r, 'phone');
        if (!exactNameMatch(mabbr, abbr) && !exactNameMatch(mname, name)) members.push({ name: mname, abbr: mabbr, phone: mphone });
      }
    }

    let ht = '';
    if (shiftName && shiftName !== 'غير محدد') ht += `<div class="shift-card-full" style="margin-bottom:10px;"><h3>${shiftName}</h3></div>`;
    else ht += '<p style="color:#888;margin-bottom:10px;">لا يوجد فرز للشهر المحدد.</p>';

    if (members.length > 0) {
      ht += `<div class="names-dropdown" style="margin-top:8px;"><button class="names-dropdown-btn"><span><i class="fas fa-users"></i> الزملاء في نفس الفرز (${members.length})</span><i class="fas fa-chevron-down"></i></button><ul class="names-dropdown-content">${members.map(m => `<li>${mcn(m.name, m.phone, m.abbr)}</li>`).join('')}</ul></div>`;
    }

    cont.innerHTML = ht;
  }

  updateTime() {
    const el = document.getElementById('lastUpdateTime');
    if (el) el.textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-SA');
  }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new HospitalApp();
  window.app = app;
});

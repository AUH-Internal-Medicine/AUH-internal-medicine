class HospitalApp {
  constructor() {
    this.m = new Date().getMonth();
    this.mn = AM[this.m];

    const n = new Date();
    this.today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;

    this.res = [];
    this.oncRows = [];
    this.oncHeaders = [];
    this.evalData = [];
    this.linksData = [];
    this.qaData = [];
    this.lecturesData = [];
    this.lectures = [];

    this.doctorStatsData = [];
    this.doctorStats = [];
    this.doctorStatsSearchTerm = '';
    this.doctorStatsSort = { key: '', dir: '' };

    this.oncallRulesData = [];
    this.oncallRules = null;

    this._resHeaders = [];
    this._resRaw = null;
    this._resCols = {};
    this._oncRaw = null;

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

    this.selectedResidents = new Set();
    this.currentDisplayMonth = this.m;
    this.currentShiftsMonth = this.m;
    this.userSelectedShiftsMonth = false;
    this.selectedOncallDate = this.today;

    this.showMyInfoPast = false;

    this._id = false;
    this._lrs = '';
    this._dataReady = false;

    this.init();
  }

  init() {
    if (this.maybeAutoHardReload('startup')) return;

    document.getElementById('navContainer').innerHTML = buildNav();
    document.getElementById('mainContent').innerHTML = buildMainContent();

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
      if (!document.hidden) this.maybeAutoHardReload('resume');
    });

    setInterval(() => {
      if (!document.hidden) {
        if (this.maybeAutoHardReload('interval')) return;
        this.loadData();
      }
    }, 120000);
  }

  maybeAutoHardReload(reason) {
    try {
      const now = Date.now();
      const raw = localStorage.getItem(HARD_RELOAD_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const lastAt = parsed && Number.isFinite(parsed.lastAt) ? parsed.lastAt : 0;

      if (now - lastAt < HARD_RELOAD_INTERVAL) return false;

      localStorage.removeItem(CK);
      localStorage.setItem(HARD_RELOAD_KEY, JSON.stringify({ lastAt: now, reason }));

      const u = new URL(window.location.href);
      u.searchParams.set('hr', String(now));
      window.location.replace(u.toString());
      return true;
    } catch (e) {
      return false;
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

    if (c.doctorStats) {
      this.doctorStatsData = c.doctorStats;
      this.parseDoctorStatsData(c.doctorStats);
      this.renderDoctorStats();
    }

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
        oncallRules: this.oncallRulesData || null,
        evaluation: this.evalData || null,
        links: this.linksData || null,
        qa: this.qaData || null,
        lectures: this.lecturesData || null,
        doctorStats: this.doctorStatsData || null
      };
      localStorage.setItem(CK, JSON.stringify(d));
    } catch (e) {}
  }

  async loadFresh(silent) {
    try {
      const [rd, od, ed, ld, qd, hd, dsd, ord] = await Promise.all([
        this.fetchCSV(GID_R),
        this.fetchJSON(GID_O),
        this.fetchCSV(GID_E),
        this.fetchCSV(GID_L),
        this.fetchJSON(GID_Q),
        this.fetchCSV(GID_LEC),
        this.fetchCSV(GID_DS),
        this.fetchCSV(GID_OR)
      ]);

      this._resRaw = rd;
      this._oncRaw = od;

      if (!silent) this.updateProgress(60, 'جاري عرض البيانات...');

      if (rd) {
        this.renderRes(rd);
        this.buildFilters();
        this.renderShiftsFromResidents();
      }

      if (od) {
        const shouldRefreshOncall = !silent || !this.oncRows.length;
        if (shouldRefreshOncall) {
          this.parseOncallData(od);
          this.renderMonthlyCalendar();
          this.showOncallDate(this.selectedOncallDate);
          this.renderOncallRawTable();
        }
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

      if (dsd) {
        this.doctorStatsData = dsd;
        this.parseDoctorStatsData(dsd);
        this.renderDoctorStats();
      }

      this.saveToCache();
      if (!silent) this.updateProgress(100, 'تم التحميل');
      this.updateTime();
    } catch (e) {
      console.error(e);
      if (!silent) this.updateProgress(100, 'تعذر الاتصال');
    }
  }

  async fetchCSV(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SID}/gviz/tq?tqx=out:csv&gid=${gid}&_=${Date.now()}`;
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

      th += `<tr><td style="font-weight:700;color:#667eea;">${seq}</td><td><strong>${nm}</strong></td><td>${tp}</td><td>${pp}</td><td>${mb}</td><td>${this.formatLink(lk)}</td></tr>`;
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
    const s = this.toAsciiDigits(v).replace(/\./g, '/');
    const nums = s.match(/\d+/g);
    if (!nums || nums.length < 3) return '';
    let d = parseInt(nums[0], 10);
    let m = parseInt(nums[1], 10);
    let y = parseInt(nums[2], 10);
    if (y < 100) y += 2000;
    if (!d || !m || !y) return '';
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return '';
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
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

    const past = list.filter(l => l.endAt < now).sort((a, b) => a.startAt - b.startAt);
    const active = list.filter(l => l.endAt >= now).sort((a, b) => a.startAt - b.startAt);
    const today = active.filter(l => l.dateISO === todayIso);
    const upcoming = active.filter(l => l.dateISO !== todayIso);

    todayEl.innerHTML = today.length ? today.map(l => this.lectureCard(l, true)).join('') : '<div class="lecture-empty">لا توجد محاضرات متبقية اليوم.</div>';
    nextEl.innerHTML = upcoming.length ? upcoming.map(l => this.lectureCard(l, false)).join('') : '<div class="lecture-empty">لا توجد محاضرات قادمة حسب الفلاتر الحالية.</div>';

    if (this.showPastLectures) {
      pastWrap.style.display = 'block';
      pastEl.innerHTML = past.length ? past.map(l => this.lectureCard(l, false)).join('') : '<div class="lecture-empty">لا توجد محاضرات قديمة.</div>';
    } else {
      pastWrap.style.display = 'none';
      pastEl.innerHTML = '';
    }
  }

  parseDoctorStatsData(d) {
    this.doctorStats = [];
    if (!d || d.length < 2) return;

    const headers = d[0] || [];
    const col = {
      name: this.getHeaderIndex(headers, ['الاسم الكامل', 'الاسم الثلاثي', 'الاسم']),
      abbr: this.getHeaderIndex(headers, ['الاختصار الرسمي', 'الاختصار']),
      spec: this.getHeaderIndex(headers, ['الاختصاص']),
      status: this.getHeaderIndex(headers, ['الحالة']),
      shift: this.getHeaderIndex(headers, ['فرز شهر']),
      shiftsCount: this.getHeaderIndex(headers, ['عدد_المناوبات', 'عدد المناوبات']),
      totalHours: this.getHeaderIndex(headers, ['مجموع_الساعات', 'مجموع الساعات']),
      avgPerShift: this.getHeaderIndex(headers, ['متوسط ساعات/مناوبة']),
      icuTotal: this.getHeaderIndex(headers, ['العنايات']),
      wardsTotal: this.getHeaderIndex(headers, ['الأجنحة']),
      emergencyTotal: this.getHeaderIndex(headers, ['الإسعاف']),
      miscTotal: this.getHeaderIndex(headers, ['المنوعات']),
      workDaysShifts: this.getHeaderIndex(headers, ['مناوبات أيام الدوام']),
      holidayShifts: this.getHeaderIndex(headers, ['العطل']),
      nightShifts: this.getHeaderIndex(headers, ['المناوبات الليلية']),
      hoursDiff: this.getHeaderIndex(headers, ['فرق الساعات عن متوسط الملتحقين']),
      shiftsDiff: this.getHeaderIndex(headers, ['فرق المناوبات عن متوسط الملتحقين']),
      hoursRank: this.getHeaderIndex(headers, ['ترتيب الساعات']),
      shiftsRank: this.getHeaderIndex(headers, ['ترتيب عدد المناوبات']),
      firstOncall: this.getHeaderIndex(headers, ['أول مناوبة']),
      lastOncall: this.getHeaderIndex(headers, ['آخر مناوبة']),
      joinDate: this.getHeaderIndex(headers, ['تاريخ الالتحاق'])
    };

    const detailSets = {
      icu: [
        { label: 'عناية قلبية', tokens: ['عناية قلب', 'قلبي'] },
        { label: 'عناية مركز', tokens: ['عناية مركز', 'المركز'] },
        { label: 'عناية داخلية', tokens: ['عناية داخل', 'داخلي'] }
      ],
      wards: [
        { label: 'سابع', tokens: ['سابع'] },
        { label: 'رابع', tokens: ['رابع'] },
        { label: 'تالت', tokens: ['تالت', 'ثالث'] },
        { label: 'تاني', tokens: ['تاني', 'ثاني'] },
        { label: 'خارجيات', tokens: ['خارجيات', 'خارجي'] }
      ],
      misc: [
        { label: 'ديال', tokens: ['ديال'] },
        { label: 'أورام', tokens: ['اورام', 'أورام'] }
      ]
    };

    const findIdxByTokens = tokens => {
      const normalizedTokens = tokens.map(t => normAr(t));
      for (let i = 0; i < headers.length; i++) {
        const hn = normAr(headers[i] || '');
        if (!hn) continue;
        if (normalizedTokens.some(t => hn.includes(t))) return i;
      }
      return -1;
    };

    const emergencyIndexes = headers
      .map((h, i) => ({ h, i }))
      .filter(x => {
        const n = normAr(x.h || '');
        return n.startsWith(normAr('إسعاف')) || n.startsWith(normAr('اسعاف'));
      })
      .map(x => x.i);

    const findDetail = defs => {
      const out = [];
      defs.forEach(def => {
        const idx = findIdxByTokens(def.tokens || [def.label]);
        if (idx >= 0) out.push({ key: def.label, idx });
      });
      return out;
    };

    const icuDetail = findDetail(detailSets.icu);
    const wardsDetail = findDetail(detailSets.wards);
    const miscDetail = findDetail(detailSets.misc);
    const emergencyDetail = emergencyIndexes.map(i => ({ key: headers[i], idx: i }));

    const cell = (row, idx) => {
      if (!Number.isInteger(idx) || idx < 0) return '';
      return (row[idx] || '').trim();
    };

    const makeGroup = (row, totalIdx, detailList) => {
      const explicitTotal = safeNum(cell(row, totalIdx));
      const details = detailList.map(x => ({ name: x.key, value: safeNum(cell(row, x.idx)) }));
      const detailsTotal = details.reduce((a, x) => a + x.value, 0);
      return {
        total: explicitTotal || detailsTotal,
        details
      };
    };

    for (let i = 1; i < d.length; i++) {
      const row = d[i] || [];
      const name = cell(row, col.name);
      if (!name || name.includes('الاسم')) continue;

      const joinDate = extractDate(cell(row, col.joinDate));
      this.doctorStats.push({
        seq: i,
        name,
        abbr: cell(row, col.abbr),
        spec: cell(row, col.spec),
        status: cell(row, col.status),
        monthShift: cell(row, col.shift),
        shiftsCount: safeNum(cell(row, col.shiftsCount)),
        totalHours: safeNum(cell(row, col.totalHours)),
        avgPerShift: safeNum(cell(row, col.avgPerShift)),
        icu: makeGroup(row, col.icuTotal, icuDetail),
        wards: makeGroup(row, col.wardsTotal, wardsDetail),
        emergency: makeGroup(row, col.emergencyTotal, emergencyDetail),
        misc: makeGroup(row, col.miscTotal, miscDetail),
        workDaysShifts: safeNum(cell(row, col.workDaysShifts)),
        holidayShifts: safeNum(cell(row, col.holidayShifts)),
        nightShifts: safeNum(cell(row, col.nightShifts)),
        hoursDiff: safeNum(cell(row, col.hoursDiff)),
        shiftsDiff: safeNum(cell(row, col.shiftsDiff)),
        hoursRank: safeNum(cell(row, col.hoursRank)),
        shiftsRank: safeNum(cell(row, col.shiftsRank)),
        firstOncall: extractDate(cell(row, col.firstOncall)) || cell(row, col.firstOncall),
        lastOncall: extractDate(cell(row, col.lastOncall)) || cell(row, col.lastOncall),
        joinDate: joinDate || cell(row, col.joinDate),
        daysSinceJoin: daysSinceDate(joinDate)
      });
    }
  }

  getFilteredDoctorStats() {
    let list = this.doctorStats.slice();

    if (this.doctorStatsSearchTerm) {
      const q = this.doctorStatsSearchTerm;
      list = list.filter(x => smartSearch(`${x.name} ${x.abbr} ${x.spec}`, q));
    }

    if (this.doctorStatsSort.key === 'hours' && this.doctorStatsSort.dir) {
      const dir = this.doctorStatsSort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => (a.totalHours - b.totalHours) * dir);
    } else if (this.doctorStatsSort.key === 'shifts' && this.doctorStatsSort.dir) {
      const dir = this.doctorStatsSort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => (a.shiftsCount - b.shiftsCount) * dir);
    }

    return list;
  }

  toggleDoctorStatsSort(key) {
    if (this.doctorStatsSort.key !== key) {
      this.doctorStatsSort = { key, dir: 'asc' };
    } else if (this.doctorStatsSort.dir === 'asc') {
      this.doctorStatsSort = { key, dir: 'desc' };
    } else if (this.doctorStatsSort.dir === 'desc') {
      this.doctorStatsSort = { key: '', dir: '' };
    } else {
      this.doctorStatsSort = { key, dir: 'asc' };
    }

    this.renderDoctorStats();
  }

  detailGroupHtml(group) {
    const lines = group.details.map(d => `<span class="doctor-detail-chip">${d.name}: ${this.formatNumDisplay(d.value)}</span>`).join('');
    return `<div class="doctor-group-total">${this.formatNumDisplay(group.total)}</div><div class="doctor-detail-list">${lines}</div>`;
  }

  renderDoctorStats() {
    const head = document.getElementById('doctorStatsHead');
    const body = document.getElementById('doctorStatsBody');
    const cards = document.getElementById('doctorStatsCards');
    if (!head || !body || !cards) return;

    const list = this.getFilteredDoctorStats();

    const sortHoursBtn = document.getElementById('sortHoursBtn');
    const sortShiftsBtn = document.getElementById('sortShiftsBtn');
    if (sortHoursBtn) {
      const active = this.doctorStatsSort.key === 'hours';
      sortHoursBtn.classList.toggle('active-filter', active);
      const label = active ? (this.doctorStatsSort.dir === 'asc' ? 'تصاعدي' : this.doctorStatsSort.dir === 'desc' ? 'تنازلي' : 'بدون') : 'بدون';
      sortHoursBtn.innerHTML = `<i class="fas fa-arrow-up-wide-short"></i> ترتيب الساعات (${label})`;
    }
    if (sortShiftsBtn) {
      const active = this.doctorStatsSort.key === 'shifts';
      sortShiftsBtn.classList.toggle('active-filter', active);
      const label = active ? (this.doctorStatsSort.dir === 'asc' ? 'تصاعدي' : this.doctorStatsSort.dir === 'desc' ? 'تنازلي' : 'بدون') : 'بدون';
      sortShiftsBtn.innerHTML = `<i class="fas fa-arrow-up-wide-short"></i> ترتيب عدد المناوبات (${label})`;
    }

    head.innerHTML = '<tr><th>الاسم</th><th>الاختصار</th><th>الاختصاص</th><th>الحالة</th><th>الفرز</th><th>عدد المناوبات</th><th>مجموع الساعات</th><th>متوسط ساعات/مناوبة</th><th>العنايات</th><th>الأجنحة</th><th>الإسعاف</th><th>المنوعات</th><th>مناوبات أيام الدوام</th><th>العطل</th><th>المناوبات الليلية</th><th>فرق الساعات</th><th>فرق المناوبات</th><th>ترتيب الساعات</th><th>ترتيب عدد المناوبات</th><th>أول مناوبة</th><th>آخر مناوبة</th><th>تاريخ الالتحاق</th><th>أيام الدوام منذ الالتحاق</th></tr>';

    body.innerHTML = '';
    cards.innerHTML = '';

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="23" style="text-align:center;padding:30px;">لا توجد بيانات</td></tr>';
      cards.innerHTML = '<div class="no-results"><i class="fas fa-magnifying-glass"></i> لا يوجد نتائج مطابقة.</div>';
      return;
    }

    for (const r of list) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="text-align:right;">${r.name}</td><td>${r.abbr || '-'}</td><td>${r.spec || '-'}</td><td>${r.status || '-'}</td><td>${r.monthShift || '-'}</td><td>${this.formatNumDisplay(r.shiftsCount)}</td><td>${this.formatNumDisplay(r.totalHours)}</td><td>${this.formatNumDisplay(r.avgPerShift)}</td><td>${this.detailGroupHtml(r.icu)}</td><td>${this.detailGroupHtml(r.wards)}</td><td>${this.detailGroupHtml(r.emergency)}</td><td>${this.detailGroupHtml(r.misc)}</td><td>${this.formatNumDisplay(r.workDaysShifts)}</td><td>${this.formatNumDisplay(r.holidayShifts)}</td><td>${this.formatNumDisplay(r.nightShifts)}</td><td>${this.formatNumDisplay(r.hoursDiff)}</td><td>${this.formatNumDisplay(r.shiftsDiff)}</td><td>${this.formatNumDisplay(r.hoursRank)}</td><td>${this.formatNumDisplay(r.shiftsRank)}</td><td>${r.firstOncall || '-'}</td><td>${r.lastOncall || '-'}</td><td>${r.joinDate || '-'}</td><td>${r.daysSinceJoin ?? '-'}</td>`;
      body.appendChild(tr);

      const card = document.createElement('div');
      card.className = 'resident-card doctor-stats-card';
      card.innerHTML = `<div class="card-header"><span class="card-name">${r.name}</span><span class="card-abbr">${r.abbr || '-'}</span></div><div class="card-row"><span class="card-label">الاختصاص</span><span class="card-value">${r.spec || '-'}</span></div><div class="card-row"><span class="card-label">الحالة</span><span class="card-value">${r.status || '-'}</span></div><div class="card-row"><span class="card-label">الفرز</span><span class="card-value">${r.monthShift || '-'}</span></div><div class="card-row"><span class="card-label">عدد المناوبات</span><span class="card-value">${this.formatNumDisplay(r.shiftsCount)}</span></div><div class="card-row"><span class="card-label">مجموع الساعات</span><span class="card-value">${this.formatNumDisplay(r.totalHours)}</span></div><div class="card-row"><span class="card-label">متوسط ساعات/مناوبة</span><span class="card-value">${this.formatNumDisplay(r.avgPerShift)}</span></div><details class="doctor-mobile-details"><summary>العنايات (${this.formatNumDisplay(r.icu.total)})</summary>${r.icu.details.map(d => `<div class="card-row"><span class="card-label">${d.name}</span><span class="card-value">${this.formatNumDisplay(d.value)}</span></div>`).join('')}</details><details class="doctor-mobile-details"><summary>الأجنحة (${this.formatNumDisplay(r.wards.total)})</summary>${r.wards.details.map(d => `<div class="card-row"><span class="card-label">${d.name}</span><span class="card-value">${this.formatNumDisplay(d.value)}</span></div>`).join('')}</details><details class="doctor-mobile-details"><summary>الإسعاف (${this.formatNumDisplay(r.emergency.total)})</summary>${r.emergency.details.map(d => `<div class="card-row"><span class="card-label">${d.name}</span><span class="card-value">${this.formatNumDisplay(d.value)}</span></div>`).join('')}</details><details class="doctor-mobile-details"><summary>المنوعات (${this.formatNumDisplay(r.misc.total)})</summary>${r.misc.details.map(d => `<div class="card-row"><span class="card-label">${d.name}</span><span class="card-value">${this.formatNumDisplay(d.value)}</span></div>`).join('')}</details><div class="card-row"><span class="card-label">مناوبات أيام الدوام</span><span class="card-value">${this.formatNumDisplay(r.workDaysShifts)}</span></div><div class="card-row"><span class="card-label">العطل</span><span class="card-value">${this.formatNumDisplay(r.holidayShifts)}</span></div><div class="card-row"><span class="card-label">المناوبات الليلية</span><span class="card-value">${this.formatNumDisplay(r.nightShifts)}</span></div><div class="card-row"><span class="card-label">فرق الساعات</span><span class="card-value">${this.formatNumDisplay(r.hoursDiff)}</span></div><div class="card-row"><span class="card-label">فرق المناوبات</span><span class="card-value">${this.formatNumDisplay(r.shiftsDiff)}</span></div><div class="card-row"><span class="card-label">ترتيب الساعات</span><span class="card-value">${this.formatNumDisplay(r.hoursRank)}</span></div><div class="card-row"><span class="card-label">ترتيب عدد المناوبات</span><span class="card-value">${this.formatNumDisplay(r.shiftsRank)}</span></div><div class="card-row"><span class="card-label">أول مناوبة</span><span class="card-value">${r.firstOncall || '-'}</span></div><div class="card-row"><span class="card-label">آخر مناوبة</span><span class="card-value">${r.lastOncall || '-'}</span></div><div class="card-row"><span class="card-label">تاريخ الالتحاق</span><span class="card-value">${r.joinDate || '-'}</span></div><div class="card-row"><span class="card-label">أيام الدوام منذ الالتحاق</span><span class="card-value">${r.daysSinceJoin ?? '-'}</span></div>`;
      cards.appendChild(card);
    }
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

  parseOncallRules(d) {
    this.oncallRules = null;
    if (!d || d.length < 2) return;

    const typeHeaders = d[0] || [];
    const categoryCols = {};
    for (let i = 1; i < typeHeaders.length; i++) {
      const name = (typeHeaders[i] || '').trim();
      if (name) categoryCols[name] = i;
    }

    const getRowVal = (rowIndex, colIndex) => {
      const row = d[rowIndex] || [];
      return (row[colIndex] || '').trim();
    };

    const buildSet = baseRow => {
      const out = {};
      Object.entries(categoryCols).forEach(([cat, idx]) => {
        out[cat] = {
          workTime: getRowVal(baseRow, idx),
          workDuration: getRowVal(baseRow + 1, idx),
          holidayTime: getRowVal(baseRow + 2, idx),
          holidayDuration: getRowVal(baseRow + 3, idx)
        };
      });
      return out;
    };

    const switchDate = extractDate((d[5] || [])[1] || '');
    const oldSet = buildSet(1);
    const newSet = buildSet(6);

    const annualHolidayDates = [];
    const annualStart = d.findIndex(r => normAr((r[0] || '').trim()).includes(normAr('العطل السنوية')));
    if (annualStart >= 0) {
      for (let i = annualStart + 1; i < d.length; i++) {
        const dateCandidate = extractDate((d[i] || [])[1] || '');
        if (dateCandidate) annualHolidayDates.push(dateCandidate);
      }
    }

    this.oncallRules = {
      switchDate,
      oldSet,
      newSet,
      annualHolidaySet: new Set(annualHolidayDates)
    };
  }

  isHolidayDate(dateIso) {
    if (!dateIso) return false;
    if (isWeekend(dateIso)) return true;
    if (!this.oncallRules) return false;
    return this.oncallRules.annualHolidaySet.has(dateIso);
  }

  getRuleSetForToday() {
    if (!this.oncallRules) return null;
    const { switchDate, oldSet, newSet } = this.oncallRules;
    if (switchDate && this.today >= switchDate) return newSet;
    return oldSet;
  }

  getCategorySchedule(cat, dateIso) {
    const ruleSet = this.getRuleSetForToday();
    if (!ruleSet) return null;

    const pickByNorm = name => {
      const target = normAr(name || '');
      const k = Object.keys(ruleSet).find(x => normAr(x) === target);
      return k ? ruleSet[k] : null;
    };

    let cfg = pickByNorm(cat);
    if (!cfg && (normAr(cat).startsWith(normAr('إسعاف')) || normAr(cat).startsWith(normAr('اسعاف')))) {
      cfg = Object.keys(ruleSet)
        .map(k => ({ k, n: normAr(k) }))
        .find(x => x.n.startsWith(normAr('إسعاف')) || x.n.startsWith(normAr('اسعاف')));
      cfg = cfg ? ruleSet[cfg.k] : null;
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

      let cls = 'calendar-day';
      if (it) cls += ' today';
      if (sel) cls += ' selected-day';
      if (pa && !sel) cls += ' past-day';
      if (di === 5 || di === 6) cls += ' weekend';

      h += `<div class="${cls}" onclick="app.clickCalendarDay('${ds}')">${day}</div>`;
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

  renderOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    if (!wrap) return;

    const d = this._oncRaw;
    if (!d || d.length < 2) {
      wrap.innerHTML = '<p style="padding:16px;color:#888;">لا توجد بيانات.</p>';
      return;
    }

    const headers = d[0] || [];
    const startIdx = (d[1] && (d[1][0] || '').trim() === 'اليوم') ? 2 : 1;
    const lastUsedCol = this.getOncallRawLastUsedCol(d, startIdx);

    let html = '<div class="table-wrapper oncall-raw-table-wrap"><table class="oncall-raw-table"><thead><tr>';
    for (let j = 0; j <= lastUsedCol; j++) {
      const h = headers[j] || '';
      html += `<th>${this.escapeHtml(h || '-')}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let i = startIdx; i < d.length; i++) {
      const row = d[i] || [];
      if (!row.slice(0, lastUsedCol + 1).some(x => String(x || '').trim())) continue;
      html += '<tr>';
      for (let j = 0; j <= lastUsedCol; j++) {
        const raw = (row[j] || '').toString();
        let val = raw;
        if (j === 1) val = this.formatOncallRawDateCell(raw);
        else if (j >= 2) val = this.formatOncallRawNamesCell(raw);
        html += `<td>${this.escapeHtml(val)}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    wrap.innerHTML = html;
  }

  toggleOncallRawTable() {
    const wrap = document.getElementById('oncallRawTableWrap');
    if (!wrap) return;
    if (wrap.style.display === 'none') {
      this.renderOncallRawTable();
      wrap.style.display = 'block';
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      wrap.style.display = 'none';
    }
  }

  showOncallDate(ds) {
    const dp = document.getElementById('oncallDayDisplay');
    const dstr = ds || this.selectedOncallDate || this.today;
    if (!dstr || !dp || !this.oncRows.length) return;

    this.selectedOncallDate = dstr;

    const oncRow = this.getOncRow(dstr);
    if (!oncRow) {
      dp.innerHTML = `<div class="oncall-day-card"><h3><i class="fas fa-calendar-day"></i> ${dstr} - ${getDayName(dstr)}</h3><p style="color:#888;">لا توجد مناوبات لهذا التاريخ.</p></div>`;
      return;
    }

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const cats = {};
    for (let col = 2; col < this.oncHeaders.length; col++) {
      const cn = this.oncHeaders[col] || 'أخرى';
      const cc = (oncRow.row[col] || '').trim();
      if (!cc) continue;
      const names = splitNames(cc);
      if (!names.length) continue;

      if (!cats[cn]) cats[cn] = [];
      for (const n of names) {
        const resident = this.findRbyExact(n);
        const fn = resident ? resident.name : n;
        const ph = resident ? resident.phone : '';
        const ab = resident ? resident.abbr : n;
        if (!cats[cn].find(x => x.abbr === ab)) cats[cn].push({ abbr: ab, name: fn, phone: ph, resAbbr: ab });
      }
    }

    const dn = getDayName(dstr);
    const we = this.isHolidayDate(dstr);
    const catEntries = Object.entries(cats);
    const catCount = catEntries.length;
    const totalDoctors = catEntries.reduce((a, [, n]) => a + n.length, 0);

    let h = `<div class="oncall-day-card" id="oncallCardContent"><div class="oncall-card-head"><h3 class="${we ? 'weekend' : ''}"><i class="fas fa-calendar-day"></i> ${dstr} - ${dn}${we ? ' <span class="day-badge weekend">عطلة</span>' : ''}</h3><div class="oncall-card-stats"><span class="oncall-stat-pill"><i class="fas fa-layer-group"></i> ${catCount} فئة</span><span class="oncall-stat-pill"><i class="fas fa-user-doctor"></i> ${totalDoctors} طبيب</span></div></div><div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div>`;

    if (!catCount) {
      h += '<p style="color:#888;">لا توجد مناوبات مسجلة لهذا التاريخ.</p>';
    } else {
      h += '<div class="oncall-categories-grid">';
      for (const [cn, names] of catEntries) {
        const schedule = this.getCategorySchedule(cn, dstr);
        const scheduleHtml = schedule && (schedule.time || schedule.duration) ? `<div class="oncall-schedule-meta${schedule.isHoliday ? ' holiday' : ''}"><span>${schedule.time || '-'}</span><span>${schedule.duration || '-'}</span></div>` : '';

        h += `<div class="oncall-category${schedule && schedule.isHoliday ? ' holiday' : ''}"><h4><span>${cn}</span><span class="cat-count">${names.length}</span></h4>${scheduleHtml}<div class="oncall-names-list">`;
        for (const n of names) h += `<span class="oncall-name-tag">${mcn(n.name, n.phone, n.resAbbr)}</span>`;
        h += '</div></div>';
      }
      h += '</div>';
    }

    h += `<div class="oncall-export-actions"><button class="download-btn" onclick="app.downloadOncallImage(false,this)"><i class="fas fa-camera btn-icon"></i><span class="btn-spinner"></span> تحميل المناوبات (عادي)</button><button class="download-btn hq-btn" onclick="app.downloadOncallImage(true,this)"><i class="fas fa-wand-magic-sparkles btn-icon"></i><span class="btn-spinner"></span> تحميل المناوبات (دقة فائقة)</button></div></div>`;
    dp.innerHTML = h;
  }

  setDownloadBtnState(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = !!loading;
  }

  async _captureImage(el, fn, bg, btn, mode = 'normal') {
    if (this._id) return;
    this._id = true;
    this.setDownloadBtnState(btn, true);
    showDownloadProgress('جاري توليد الصورة...');
    updateDownloadProgress(5);

    let stage = null;
    try {
      await new Promise(requestAnimationFrame);
      const isOncall = el.id === 'oncallCardContent';
      const isHQ = isOncall && mode === 'hq';
      const baseW = isOncall ? 840 : 920;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const sc = isHQ ? Math.min(3.6, Math.max(2.85, dpr * 1.35)) : isOncall ? Math.min(3.0, Math.max(2.35, dpr * 1.2)) : Math.min(2.95, Math.max(2.2, dpr * 1.2));

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

      const maxSide = isHQ ? 3400 : isOncall ? 2850 : 3500;
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
        showToast(isHQ ? 'تم التحميل بدقة فائقة!' : 'تم التحميل بجودة عالية وبحجم أنسب للمشاركة!');
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

  downloadOncallImage(hq = false, triggerBtn = null) {
    const el = document.getElementById('oncallCardContent');
    if (!el) return;
    const btn = triggerBtn || el.querySelector('.download-btn');
    const bg = document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff';
    this._captureImage(el, `مناوبات_${document.getElementById('oncallDatePicker').value || this.today}.png`, bg, btn, hq ? 'hq' : 'normal');
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
        .map((m, i) => `<div class="search-result-item" onclick="app.selectMe(${i})"><span><strong>${m.name}</strong> (${m.abbr})</span><span style="color:#667eea;">${m.spec}</span></div>`)
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
    this.showMyInfoPast = !this.showMyInfoPast;
    this.showMe(this.currentMyInfo);
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
        const colleagues = [];
        for (const n of names) {
          if (!exactNameMatch(n, r.abbr) && !exactNameMatch(n, r.name)) {
            const cr = this.findRbyExact(n);
            if (cr) colleagues.push({ name: cr.name, abbr: cr.abbr, phone: cr.phone });
            else colleagues.push({ name: n, abbr: n, phone: '' });
          }
        }

        const schedule = this.getCategorySchedule(cn, onc.date);
        allOncalls.push({
          date: onc.date,
          day: onc.day || getDayName(onc.date),
          dayIdx: getDayIndex(onc.date),
          cat: cn,
          colleagues,
          schedule
        });
      }
    }

    allOncalls.sort((a, b) => a.date.localeCompare(b.date));

    const firstOncallDate = allOncalls.length ? allOncalls[0].date : '-';
    const lastOncallDate = allOncalls.length ? allOncalls[allOncalls.length - 1].date : '-';

    const visibleOncalls = this.showMyInfoPast ? allOncalls : allOncalls.filter(o => o.date >= this.today);
    const visibleCounts = {};
    visibleOncalls.forEach(o => {
      visibleCounts[o.cat] = (visibleCounts[o.cat] || 0) + 1;
    });

    const totVisible = visibleOncalls.length;

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const evalInfo = this.getEvalForResident(r.name, r.abbr);
    const doctorStats = this.getDoctorStatsForResident(r.name, r.abbr);
    const daysSinceJoin = daysSinceDate(extractDate(r.join));

    let h = `<div id="myInfoContent" style="padding:8px;"><h3 style="color:#667eea;text-align:center;font-size:1.4em;margin-bottom:14px;"><i class="fas fa-user"></i> ${r.name} (${r.abbr}) <span style="font-size:0.6em;color:var(--text-secondary);">#${r.seq}</span></h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px;"><div class="cumulative-box" style="margin:0;"><div class="cum-num">${this.formatNumDisplay(r.cumulativeOnc || '0')}</div><div class="cum-lbl">إجمالي المناوبات التراكمية</div></div><div class="cumulative-box" style="margin:0;"><div class="cum-num">${totVisible}</div><div class="cum-lbl">المناوبات المتبقية</div></div><div class="cumulative-box" style="margin:0;"><div class="cum-num">${daysSinceJoin ?? '-'}</div><div class="cum-lbl">عدد أيام الدوام منذ الالتحاق</div></div></div>`;

    h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-circle-info"></i> معلومات إضافية</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid"><div class="info-item"><div class="info-label">الرقم التسلسلي</div><div class="info-value">${r.seq}</div></div><div class="info-item"><div class="info-label">الاختصاص</div><div class="info-value">${r.spec}</div></div><div class="info-item"><div class="info-label">الهاتف</div><div class="info-value"><span dir="ltr">${r.phone}</span> <button class="copy-btn" onclick="copyPhone('${r.phone}',this)"><i class="fas fa-copy"></i></button></div></div><div class="info-item"><div class="info-label">الالتحاق</div><div class="info-value">${r.join || '-'}</div></div><div class="info-item"><div class="info-label">الحالة</div><div class="info-value"><span class="status-badge ${ok ? 'status-joined' : getStatusBadgeClass(r.st)}">${ok ? '<i class="fas fa-circle-check"></i>' : '<i class="fas fa-hourglass-half"></i>'} ${r.st || 'غير محدد'}</span></div></div><div class="info-item"><div class="info-label">مجال المناوبات في الجدول</div><div class="info-value">${firstOncallDate} ← ${lastOncallDate}</div></div><div class="info-item"><div class="info-label">عدد أيام الدوام منذ الالتحاق</div><div class="info-value">${daysSinceJoin ?? '-'}</div></div></div></div></div>`;

    if (evalInfo) {
      h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-chart-line"></i> التقييم السنوي</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid">`;
      for (const skill of evalInfo.skills) h += `<div class="info-item"><div class="info-label">${skill.label}</div><div class="info-value">${skill.value}</div></div>`;
      h += `</div>`;
      if (evalInfo.praise && evalInfo.praise.trim()) h += `<div style="margin-top:10px;padding:10px 14px;background:rgba(39,174,96,0.08);border-radius:10px;border-right:4px solid #27ae60;"><strong style="color:#27ae60;"><i class="fas fa-star"></i> الثناءات:</strong><br><span style="font-weight:600;color:#27ae60;">${evalInfo.praise}</span></div>`;
      if (evalInfo.penalty && evalInfo.penalty.trim()) h += `<div style="margin-top:6px;padding:10px 14px;background:rgba(231,76,60,0.08);border-radius:10px;border-right:4px solid #e74c3c;"><strong style="color:#e74c3c;"><i class="fas fa-triangle-exclamation"></i> العقوبات:</strong><br><span style="font-weight:600;color:#e74c3c;">${evalInfo.penalty}</span></div>`;
      h += `<div class="stat-card" style="margin-top:10px;"><div class="stat-num">${evalInfo.total}</div><div class="stat-lbl">المحصلة الاجمالية</div></div></div></div>`;
    }

    if (doctorStats) {
      h += `<div class="collapsible-section"><button class="collapsible-btn" onclick="toggleCollapsible(this)"><span><i class="fas fa-chart-column"></i> احصائيات</span><i class="fas fa-chevron-down"></i></button><div class="collapsible-content"><div class="info-grid"><div class="info-item"><div class="info-label">عدد المناوبات</div><div class="info-value">${this.formatNumDisplay(doctorStats.shiftsCount)}</div></div><div class="info-item"><div class="info-label">مجموع الساعات</div><div class="info-value">${this.formatNumDisplay(doctorStats.totalHours)}</div></div><div class="info-item"><div class="info-label">متوسط ساعات/مناوبة</div><div class="info-value">${this.formatNumDisplay(doctorStats.avgPerShift)}</div></div><div class="info-item"><div class="info-label">العنايات</div><div class="info-value">${this.formatNumDisplay(doctorStats.icu.total)}</div></div><div class="info-item"><div class="info-label">الأجنحة</div><div class="info-value">${this.formatNumDisplay(doctorStats.wards.total)}</div></div><div class="info-item"><div class="info-label">الإسعاف</div><div class="info-value">${this.formatNumDisplay(doctorStats.emergency.total)}</div></div><div class="info-item"><div class="info-label">المنوعات</div><div class="info-value">${this.formatNumDisplay(doctorStats.misc.total)}</div></div><div class="info-item"><div class="info-label">ترتيب الساعات</div><div class="info-value">${this.formatNumDisplay(doctorStats.hoursRank)}</div></div><div class="info-item"><div class="info-label">ترتيب عدد المناوبات</div><div class="info-value">${this.formatNumDisplay(doctorStats.shiftsRank)}</div></div></div></div></div>`;
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
      h += `<div class="capture-timestamp"><i class="fas fa-clock"></i> ${ts}</div><div class="controls-row" style="margin-bottom:8px;"><button class="filter-btn ${this.showMyInfoPast ? 'active-filter' : ''}" onclick="app.toggleMyInfoPastOncalls()"><i class="fas fa-history"></i> ${this.showMyInfoPast ? 'إخفاء المناوبات القديمة' : 'إظهار المناوبات القديمة'}</button><span class="count-badge">أول مناوبة: ${firstOncallDate}</span><span class="count-badge">آخر مناوبة: ${lastOncallDate}</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:10px;"><div class="stat-card"><div class="stat-num">${totVisible}</div><div class="stat-lbl">المناوبات المتبقية</div></div>`;
      for (const [type, count] of Object.entries(visibleCounts).sort((a, b) => b[1] - a[1])) h += `<div class="stat-card"><div class="stat-num">${count}</div><div class="stat-lbl">${type}</div></div>`;
      h += '</div>';

      visibleOncalls.forEach(o => {
        const we = this.isHolidayDate(o.date);
        const sch = o.schedule;
        h += `<div class="oncall-info-row${we ? ' holiday' : ''}"><div class="oc-header"><span class="oc-date${we ? ' weekend' : ''}">${we ? '<span class="day-dot weekend"></span>' : ''}<i class="fas fa-calendar-day"></i> ${o.date} - ${o.day}</span><span class="oc-type">${o.cat}</span></div>`;
        if (sch && (sch.time || sch.duration)) h += `<div class="myinfo-oncall-meta${sch.isHoliday ? ' holiday' : ''}"><span><i class="fas fa-clock"></i> ${sch.time || '-'}</span><span><i class="fas fa-hourglass-half"></i> ${sch.duration || '-'}</span></div>`;
        if (o.colleagues.length) h += `<div class="colleague-row"><span class="cl-label"><i class="fas fa-users"></i> الزملاء:</span><span class="cl-names">${o.colleagues.map((c, i) => `${i > 0 ? '<span class="cl-sep"> - </span>' : ''}${mcn(c.name, c.phone, c.abbr)}`).join('')}</span></div>`;
        h += '</div>';
      });
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

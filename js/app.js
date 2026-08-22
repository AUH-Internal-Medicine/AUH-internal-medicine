/**
 * HospitalApp — the orchestrator.
 *
 * Responsibilities kept here on purpose (everything else lives in a module):
 *   • UI shell: nav, tabs, searches, loading screen, background refresh
 *   • the load pipeline: fetch → parse → derive → render
 *   • a thin facade the view mixins call into, so no view reaches into the data
 *     or domain layers directly
 *
 * The per-tab rendering lives in js/views/* and is mixed into the prototype at
 * the bottom of this file.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml, formatNumber, toAsciiDigits } = AUH.text;
  const { todayIso } = AUH.dates;
  const { showToast, debounce } = AUH.ui;
  const { MONTH_NAMES } = AUH.constants;
  const repository = AUH.data.repository;
  const schedule = AUH.domain.oncallSchedule;

  class HospitalApp {
    constructor() {
      const now = new Date();

      /* --- calendar context ------------------------------------------------ */
      this.m = now.getMonth();
      this.mn = MONTH_NAMES[this.m];
      this.today = todayIso();

      /* --- data (parsed models + the flat aliases the views read) ---------- */
      this.rawTables = {};
      this.dataset = null;
      this.residentsModel = AUH.parse.emptyResidents();
      this.oncallModel = AUH.parse.emptyOncall('oncall');
      this.oncall2Model = AUH.parse.emptyOncall('oncallYear2');
      this.evaluationModel = AUH.parse.emptyEvaluation();
      this.linksModel = { list: [] };
      this.qaModel = { list: [], categories: [] };

      this.res = [];
      this.oncHeaders = [];
      this.oncRows = [];
      this.oncHeaders2 = [];
      this.oncRows2 = [];
      this.lectures = [];
      this.annualHolidays = new Set();
      this.adjustmentOverrides = new Map();
      this.adjustmentAdditions = [];
      this.doctorStats = [];

      /* --- roster tab state ------------------------------------------------ */
      this.filterJoined = false;
      this.filterDetached = false;
      this.filterSpecialty = '';
      this.filterShift = '';
      this.selectedResidents = new Set();
      this._lrs = '';

      /* --- statistics tab state -------------------------------------------- */
      this.doctorStatsSearchTerm = '';
      this.doctorStatsSort = { key: 'hoursCompleted', dir: 'desc' };

      /* --- lectures tab state ---------------------------------------------- */
      this.lecturesSearchTerm = '';
      this.lecturesCategoryFilter = '';
      this.lecturesDeptFilter = '';
      this.lecturesYearFilter = '';
      this.showPastLectures = false;
      this.lecturesSelectedDate = '';
      this.lecturesUserSelectedDate = false;
      this.lecturesCalendarMonth = this.m;
      this.lecturesCalendarYear = now.getFullYear();

      /* --- shifts + on-call tab state -------------------------------------- */
      this.currentShiftsMonth = this.m;
      this.userSelectedShiftsMonth = false;
      this.currentDisplayMonth = this.m;
      this.selectedOncallDate = this.today;
      this.oncallYearFilter = 'y1';

      /* --- "my info" tab state --------------------------------------------- */
      this.currentMyInfo = null;
      this.currentMyInfoOncallStats = null;
      this.myInfoMonthKey = this.today.slice(0, 7);
      this.myInfoFocusedOncallDate = '';

      /* --- internals -------------------------------------------------------- */
      this._id = false; // an image download is in progress
      this._dataReady = false;
      this._buildId = AUH.config.buildId;
      this._updateCheckRunning = false;
      this._manualRefreshRunning = false;

      this.init();
    }

    /* =================================================================== init */

    init() {
      document.getElementById('navContainer').innerHTML = AUH.views.layout.buildNav();
      document.getElementById('mainContent').innerHTML = AUH.views.layout.buildMainContent();
      this.ensureAdditionalStaticTabs();

      const yearEl = document.getElementById('currentYear');
      if (yearEl) yearEl.textContent = new Date().getFullYear();

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

      // Refresh when the tab becomes visible again, and on a timer while visible.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        this.loadFresh(true);
        this.checkForAppUpdate();
      });

      setInterval(() => {
        if (!document.hidden) this.loadFresh(true);
      }, AUH.config.refreshIntervalMs);

      setInterval(() => {
        if (!document.hidden) this.checkForAppUpdate();
      }, AUH.config.updateCheckIntervalMs);

      this.checkForAppUpdate();
    }

    /** The two "work in progress" tabs have no data and are created here. */
    ensureAdditionalStaticTabs() {
      const root = document.getElementById('mainContent');
      if (!root) return;

      const placeholder = (id, icon, title) => {
        if (document.getElementById(`${id}-tab`)) return;
        const section = document.createElement('section');
        section.className = 'tab-content';
        section.id = `${id}-tab`;
        section.innerHTML =
          `<div class="section-header"><h2><i class="fas ${icon}"></i> ${title}</h2></div>` +
          '<div class="work-in-progress-panel"><i class="fas fa-screwdriver-wrench"></i><h3>هذا القسم قيد العمل والتطوير</h3><p>سيتم تحديثه في المستقبل</p></div>';
        root.appendChild(section);
      };

      placeholder('exams', 'fa-file-pen', 'الامتحانات والاختبارات');
      placeholder('clinicalcases', 'fa-stethoscope', 'مشروع الحالات السريرية');
    }

    setupTabs() {
      const activateTab = (tabId, doScroll) => {
        document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));

        const btn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('active');

        const section = document.getElementById(tabId + '-tab');
        if (section) section.classList.add('active');

        AUH.storage.set('activeTab', tabId);
        if (doScroll) window.scrollTo({ top: 0, behavior: 'smooth' });

        this.renderTab(tabId);
      };

      this.activateTab = activateTab;
      this.activeTab = AUH.storage.get('activeTab') || 'residents';

      document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab, true)));

      const stored = AUH.storage.get('activeTab');
      if (stored) activateTab(stored, false);
    }

    /** Renders whatever a tab needs when it becomes visible. */
    renderTab(tabId) {
      this.activeTab = tabId;
      if (tabId === 'evaluation') this.renderEval();
      else if (tabId === 'links') this.renderLinks();
      else if (tabId === 'qa') this.renderQA();
      else if (tabId === 'shifts') this.renderShiftsFromResidents();
      else if (tabId === 'lectures') this.renderLectures();
      else if (tabId === 'doctorstats') this.renderDoctorStats();
      else if (tabId === 'oncall') this.showOncallDate(this.selectedOncallDate);
    }

    setupSearches() {
      const on = (id, handler, wait) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', debounce(handler, wait || 120));
      };

      on('residentSearch', e => {
        this._lrs = e.target.value;
        this.displayResidents();
        this.updateResCount();
        this.refreshSelectionUI();
      });
      on('shiftSearch', e => this.filterShf(e.target.value));
      on('myInfoSearch', e => this.searchMe(e.target.value), 130);
      on('evalSearch', e => this.filterEval(e.target.value));
      on('qaSearch', e => this.filterQA(e.target.value));
      on('lecturesSearch', e => {
        this.lecturesSearchTerm = e.target.value || '';
        this.renderLectures();
      });
      on('doctorStatsSearch', e => {
        this.doctorStatsSearchTerm = e.target.value || '';
        this.renderDoctorStats();
      });
    }

    setupBackToTop() {
      const btn = document.getElementById('backToTop');
      if (!btn) return;
      window.addEventListener(
        'scroll',
        () => {
          if (window.scrollY > 300) btn.classList.add('show');
          else btn.classList.remove('show');
        },
        { passive: true }
      );
    }

    setupSupportShortcut() {
      const btn = document.getElementById('supportShortcut');
      if (!btn) return;
      btn.addEventListener('click', e => {
        e.preventDefault();
        this.openComplaintsTab();
      });
    }

    openComplaintsTab(doScroll = true) {
      if (typeof this.activateTab === 'function') this.activateTab('complaints', doScroll);
    }

    /* ============================================================ load cycle */

    async loadData() {
      const cached = repository.readCache();
      if (cached) {
        this.rawTables = cached;
        this.applyDataset(repository.parseAll(cached));
        await this.finishFirstPaint();
        this.loadFresh(true);
        return;
      }

      this.updateProgress(15, 'جاري جلب البيانات...');
      await this.loadFresh(false);
      // The loading screen is always dismissed, even on a failed first load —
      // an empty page with a clear error beats an endless spinner.
      await this.finishFirstPaint();
    }

    /** Hides the loading screen once the header image is ready (or timed out). */
    async finishFirstPaint() {
      if (this._dataReady) return;
      await this.waitForHeaderImage();
      this._dataReady = true;
      this.showLoading(true);
    }

    /**
     * Fetch → parse → derive → render.
     * `silent` skips the progress bar (background refreshes).
     */
    async loadFresh(silent) {
      try {
        const result = await repository.fetchAll();

        // Keep the previous table for any source that failed this round, so one
        // flaky request cannot blank out a whole tab.
        Object.keys(result.tables).forEach(key => {
          this.rawTables[key] = result.tables[key];
        });

        // Keep only the summary — the raw tables are huge and already stored.
        this.lastFetch = { ok: result.ok, failed: result.failed, source: result.source, at: new Date().toISOString() };

        if (!silent) this.updateProgress(60, 'جاري عرض البيانات...');

        this.applyDataset(repository.parseAll(this.rawTables));
        repository.writeCache(this.rawTables);

        this.reportLoadResult(result);

        if (!silent) this.updateProgress(100, result.failed.length && !this.res.length ? 'تعذر تحميل البيانات' : 'تم التحميل');
        this.updateTime();
        return result;
      } catch (e) {
        AUH.log.error('app', e);
        this.showDataError('تعذر تحميل البيانات — حدث خطأ غير متوقع.', { fatal: !this.res.length });
        if (!silent) this.updateProgress(100, 'تعذر الاتصال');
        return null;
      }
    }

    /**
     * Turns a load result into something the visitor can actually see and act
     * on. Silent emptiness was the worst failure mode of the old app: the page
     * looked fine and simply had no data in it.
     */
    reportLoadResult(result) {
      if (!result) return;

      if (!result.failed.length) {
        this.hideDataError();
        return;
      }

      const everythingFailed = result.failed.length === repository.SOURCES.length;
      if (everythingFailed && !this.res.length) {
        const viaFile = AUH.data.gviz.isFileProtocol();
        this.showDataError(
          viaFile
            ? 'تعذر تحميل البيانات من Google Sheets. الصفحة مفتوحة من الملف مباشرة (file://) — جرّب فتحها عبر الرابط المنشور أو خادم محلي، أو تأكد من الاتصال بالإنترنت.'
            : 'تعذر تحميل البيانات من Google Sheets. تحقّق من اتصالك بالإنترنت ومن أن الشيت ما زال مشارَكاً للقراءة العامة.',
          { fatal: true }
        );
      } else if (everythingFailed) {
        this.showDataError('تعذر تحديث البيانات الآن — يتم عرض آخر نسخة محفوظة.', { fatal: false });
      } else {
        this.showDataError(`تعذر تحميل بعض الأقسام (${result.failed.join('، ')}) — باقي البيانات معروضة.`, { fatal: false });
      }
    }

    /** The error bar shown under the navigation. Created on first use. */
    ensureDataErrorBar() {
      let bar = document.getElementById('dataErrorBar');
      if (bar) return bar;

      bar = document.createElement('div');
      bar.id = 'dataErrorBar';
      bar.style.cssText =
        'display:none;margin:10px auto;max-width:1200px;padding:12px 16px;border-radius:12px;' +
        'font-weight:700;line-height:1.7;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.08);';

      const main = document.getElementById('mainContent');
      if (main && main.parentNode) main.parentNode.insertBefore(bar, main);
      else document.body.appendChild(bar);
      return bar;
    }

    showDataError(message, options) {
      const fatal = !!(options && options.fatal);
      const bar = this.ensureDataErrorBar();
      bar.style.background = fatal ? 'rgba(192,57,43,0.12)' : 'rgba(217,140,61,0.14)';
      bar.style.border = `2px solid ${fatal ? 'rgba(192,57,43,0.45)' : 'rgba(217,140,61,0.45)'}`;
      bar.style.color = fatal ? '#a5281c' : '#8a5a1d';
      bar.innerHTML =
        `<span><i class="fas fa-triangle-exclamation"></i> ${AUH.text.escapeHtml(message)}</span>` +
        ' <button class="filter-btn" style="margin-inline-start:10px;" onclick="app.manualRefresh()">' +
        '<i class="fas fa-rotate"></i> إعادة المحاولة</button>';
      bar.style.display = 'block';
    }

    hideDataError() {
      const bar = document.getElementById('dataErrorBar');
      if (bar) bar.style.display = 'none';
    }

    /** Quick self-check for the console: where data came from and what failed. */
    diagnose() {
      const client = repository.clientFor();
      return {
        build: this._buildId,
        protocol: location.protocol,
        dataSource: AUH.config.dataSource,
        apiConfigured: AUH.data.api.isConfigured(),
        transport: client.primary === AUH.data.api ? 'api' : 'gviz',
        sheetsTransport: AUH.config.sheetsTransport,
        persistentStorage: AUH.storage.isPersistent,
        lastFetch: this.lastFetch || null,
        counts: {
          residents: this.res.length,
          oncallDays: this.oncRows.length,
          year2Days: this.oncRows2.length,
          lectures: this.lectures.length,
          evaluation: this.evaluationModel.list ? this.evaluationModel.list.length : 0,
          links: (this.linksModel.list || []).length,
          qa: (this.qaModel.list || []).length,
          stats: this.doctorStats.length
        }
      };
    }

    /**
     * Installs a parsed dataset: exposes the models, derives everything computed
     * from them (adjustments, statistics) and re-renders.
     */
    applyDataset(dataset) {
      this.dataset = dataset;

      this.residentsModel = dataset.residents;
      this.oncallModel = dataset.oncall;
      this.oncall2Model = dataset.oncallYear2;
      this.evaluationModel = dataset.evaluation;
      this.linksModel = dataset.links;
      this.qaModel = dataset.qa;

      // Flat aliases used throughout the views.
      this.res = dataset.residents.residents.map(r =>
        Object.assign(r, { monthlyShift: dataset.residents.getShift(r, this.m + 1) })
      );
      this.oncHeaders = dataset.oncall.headers;
      this.oncRows = dataset.oncall.rows;
      this.oncHeaders2 = dataset.oncallYear2.headers;
      this.oncRows2 = dataset.oncallYear2.rows;
      this.lectures = dataset.lectures.list;
      this.annualHolidays = dataset.rules.annualHolidays;

      // Derived data (order matters: adjustments need residents + on-call,
      // statistics need adjustments).
      const resolved = AUH.domain.adjustments.resolveAdjustments(dataset.adjustments.entries, {
        residents: dataset.residents,
        oncall: dataset.oncall
      });
      this.adjustmentOverrides = resolved.overrides;
      this.adjustmentAdditions = resolved.additions;

      this.doctorStats = AUH.domain.doctorStats.computeDoctorStats({
        residents: dataset.residents,
        oncall: dataset.oncall,
        evaluation: dataset.evaluation,
        overrides: this.adjustmentOverrides,
        additions: this.adjustmentAdditions,
        annualHolidays: this.annualHolidays,
        today: this.today,
        currentMonth: this.m + 1
      });

      this.renderAll();
      this.updateTime();
    }

    /** Re-renders every always-on tab, plus the active one if it is lazy. */
    renderAll() {
      this.displayResidents();
      this.buildFilters();
      this.renderShiftsFromResidents();

      document.getElementById('oncallMonthTitle').textContent = this.currentDisplayMonth + 1;
      this.renderMonthlyCalendar();
      this.showOncallDate(this.selectedOncallDate);
      this.renderOncallRawTable();

      this.renderLectures();
      this.renderDoctorStats();

      // Evaluation / links / Q&A render on tab activation; refresh them only
      // when the visitor is actually looking at them (so open cards are not
      // collapsed under them during a background refresh).
      if (this.activeTab === 'evaluation') this.renderEval();
      else if (this.activeTab === 'links') this.renderLinks();
      else if (this.activeTab === 'qa') this.renderQA();
    }

    /* ======================================================= app auto-update */

    extractBuildIdFromHtml(html) {
      const m = String(html || '').match(/<meta\s+name=["']app-build["']\s+content=["']([^"']+)["']/i);
      return m ? (m[1] || '').trim() : '';
    }

    /** Reloads the page when a newer build has been deployed. */
    async checkForAppUpdate() {
      if (this._updateCheckRunning) return;
      this._updateCheckRunning = true;

      try {
        const res = await fetch(`index.html?__check=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;

        const remoteBuild = this.extractBuildIdFromHtml(await res.text());
        if (!remoteBuild || remoteBuild === this._buildId) return;

        repository.clearOldCaches();
        location.replace(`./?v=${encodeURIComponent(remoteBuild)}`);
      } catch (e) {
        /* offline — try again on the next tick */
      } finally {
        this._updateCheckRunning = false;
      }
    }

    async manualRefresh() {
      if (this._manualRefreshRunning) return;
      this._manualRefreshRunning = true;

      const btn = document.getElementById('lastUpdateTime');
      if (btn) btn.classList.add('refreshing');

      try {
        await this.loadFresh(true);
        showToast('تم تحديث البيانات بنجاح ✅');
      } catch (e) {
        showToast('تعذر التحديث، حاول مرة أخرى.');
      } finally {
        if (btn) btn.classList.remove('refreshing');
        this._manualRefreshRunning = false;
      }
    }

    updateTime() {
      const el = document.getElementById('lastUpdateTime');
      if (el) el.innerHTML = `<i class="fas fa-rotate"></i> آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
    }

    /* ================================================== loading screen shell */

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

    showLoading(hide) {
      const screen = document.getElementById('loadingScreen');
      if (!screen) return;
      if (hide) {
        screen.classList.add('hidden');
        setTimeout(() => {
          screen.style.display = 'none';
        }, 400);
      } else {
        screen.style.display = 'flex';
        screen.classList.remove('hidden');
      }
    }

    updateProgress(percent, text) {
      const bar = document.getElementById('progressBar');
      const label = document.getElementById('loaderPercentage');
      const subtitle = document.getElementById('loaderSubtitle');
      if (bar) bar.style.width = percent + '%';
      if (label) label.textContent = percent + '%';
      if (text && subtitle) subtitle.textContent = text;
    }

    /* ========================================================= view facades */
    /* The view mixins call these instead of reaching into data/domain modules. */

    escapeHtml(value) {
      return escapeHtml(value);
    }

    formatNumDisplay(value) {
      return formatNumber(value);
    }

    toAsciiDigits(value) {
      return toAsciiDigits(value);
    }

    /** Resolves a name/abbreviation coming from any sheet to a roster record. */
    findRbyExact(nameOrAbbr) {
      return this.residentsModel.findByNameOrAbbr(nameOrAbbr);
    }

    isHolidayDate(dateIso) {
      return schedule.isHolidayDate(dateIso, this.annualHolidays);
    }

    getCategorySchedule(category, dateIso) {
      return schedule.getCategorySchedule(category, dateIso, this.annualHolidays);
    }

    getEvalForResident(name, abbr) {
      return this.evaluationModel.findFor(name, abbr);
    }

    getDoctorStatsForResident(name, abbr) {
      return AUH.domain.doctorStats.findStatsFor(this.doctorStats, name, abbr);
    }

    getAllShiftMonths() {
      return this.residentsModel.getShiftMonths();
    }

    getPreferredShiftMonth() {
      return this.residentsModel.getPreferredShiftMonth(this.m + 1);
    }
  }

  // Per-tab rendering, mixed in from js/views/*.
  Object.assign(
    HospitalApp.prototype,
    AUH.views.residents,
    AUH.views.shifts,
    AUH.views.oncall,
    AUH.views.lectures,
    AUH.views.evaluation,
    AUH.views.linksQa,
    AUH.views.doctorStats,
    AUH.views.myInfo,
    AUH.views.exports
  );

  AUH.HospitalApp = HospitalApp;

  document.addEventListener('DOMContentLoaded', () => {
    global.app = new HospitalApp();
    AUH.app = global.app;
  });
})(typeof window !== 'undefined' ? window : globalThis);

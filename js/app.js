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
      this.holidaysModel = AUH.parse.emptyHolidays();
      this.annualHolidays = new Set();
      this.adjustmentOverrides = new Map();
      this.adjustmentAdditions = [];
      this.bonusHours = [];
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
      // '' | 'group:<key>' | 'cat:<category>' — see views/doctor-stats.js
      this.doctorStatsShiftFilter = '';
      this.doctorStatsOnlyWithShift = true;

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

      /* --- render bookkeeping ---------------------------------------------- */
      // Tabs whose DOM no longer matches the data. A tab is rendered when it is
      // opened, not on every refresh — rendering all of them cost ~1.5 MB of
      // HTML on a timer and made every click feel slow.
      this._dirtyTabs = new Set();
      this._dataSignature = '';
      this._hasNewData = false;

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

      this.updateDateBadge();

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

      // Keeps the date badge correct if the page stays open past midnight.
      setInterval(() => this.updateDateBadge(), 60 * 1000);

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

        // كل واجهة تُرسم على سنتها هي. بلا هذا السطر تُورَّث سنة الواجهة
        // السابقة، فيرى من اختار الثانية في اللائحة مناوباتِ الثانية أيضاً.
        this.activeTab = tabId;
        const want = this.yearForTab(tabId);
        if (want !== this.year) this.applyYear(want, { silent: true });

        this.renderTab(tabId);
        // the switcher lives inside each tab's own header, so it is (re)drawn
        // whenever a tab is shown
        this.renderYearSwitches();
      };

      this.activateTab = activateTab;
      this.activeTab = AUH.storage.get('activeTab') || 'residents';

      document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => activateTab(b.dataset.tab, true)));

      const stored = AUH.storage.get('activeTab');
      if (stored) activateTab(stored, false);
    }

    /**
     * Renders a tab's content — but only when it is actually out of date.
     *
     * Every tab is marked dirty when new data arrives and re-rendered the next
     * time it is opened. Re-rendering all of them on every background refresh is
     * what used to make the site stutter: the statistics tab alone is ~780 KB of
     * HTML, the roster ~420 KB.
     */
    renderTab(tabId, options) {
      const opts = options || {};
      this.activeTab = tabId;

      if (!opts.force && !this._dirtyTabs.has(tabId)) return;
      this._dirtyTabs.delete(tabId);

      const scrollY = opts.preserveScroll ? window.scrollY : null;

      switch (tabId) {
        case 'residents':
          this.buildFilters();
          this.displayResidents();
          break;
        case 'shifts':
          this.renderShiftsFromResidents();
          break;
        case 'oncall':
          document.getElementById('oncallMonthTitle').textContent = this.currentDisplayMonth + 1;
          this.renderMonthlyCalendar();
          this.showOncallDate(this.selectedOncallDate);
          this.renderOncallRawTable();
          break;
        case 'lectures':
          this.renderLectures();
          break;
        case 'doctorstats':
          this.renderDoctorStats();
          break;
        case 'evaluation':
          this.renderEval();
          break;
        case 'links':
          this.renderLinks();
          break;
        case 'qa':
          this.renderQA();
          break;
        case 'myinfo':
          // Keeps the searched resident on screen across refreshes instead of
          // making them search again.
          if (this.currentMyInfo) this.showMe(this.currentMyInfo, { keepScroll: true });
          break;
        default:
          break;
      }

      if (scrollY !== null) window.scrollTo(0, scrollY);
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
    async loadFresh(silent, options) {
      const opts = options || {};
      try {
        const result = await repository.fetchAll();

        // Keep the previous table for any source that failed this round, so one
        // flaky request cannot blank out a whole tab.
        Object.keys(result.tables).forEach(key => {
          this.rawTables[key] = result.tables[key];
        });

        this.lastFetch = result;
        this.reportLoadResult(result);

        const signature = repository.tablesSignature(this.rawTables);
        const isFirstLoad = !this._dataSignature;
        const changed = signature !== this._dataSignature;

        // Nothing changed in any sheet: skip parsing, computing and rendering
        // entirely. A background refresh that brings identical data must cost
        // nothing and must not move anything on screen.
        if (!changed && !opts.force) {
          this.updateTime();
          if (!silent) this.updateProgress(100, 'تم التحميل');
          return result;
        }

        this._dataSignature = signature;

        if (!silent) this.updateProgress(60, 'جاري عرض البيانات...');

        this.applyDataset(repository.parseAll(this.rawTables), {
          // A background refresh must not scroll the reader away from what they
          // were looking at.
          preserveScroll: !!silent
        });
        repository.writeCache(this.rawTables);

        if (changed && !isFirstLoad && silent && !opts.force) this.markNewData();
        if (opts.force) this.clearNewData();

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
    /* --------------------------------------------------------------- years */
    /**
     * The site covers several residency years. Their data never mixes: each
     * year has its own roster, on-call sheet and rotations, and every lookup
     * happens inside ONE year. That separation is what keeps «عمر» of the first
     * year from being taken for «عمر» of the second — 37 abbreviations are
     * shared between the two rosters.
     *
     * Switching a year re-points the flat aliases the views already read
     * (`this.res`, `this.oncRows` …), so no view needs to know about years.
     */
    yearsAvailable() {
      return (AUH.config.years || []).filter(y => y.ready);
    }


    yearInfo(id) {
      return (AUH.config.years || []).find(y => y.id === (id || this.year)) || null;
    }


    /** Builds the per-year bundles from a freshly parsed dataset. */
    buildYearBundles(dataset) {
      this.yearBundles = {
        1: {
          id: 1,
          residents: dataset.residents.residents,
          residentsModel: dataset.residents,
          oncall: { headers: dataset.oncall.headers, rows: dataset.oncall.rows },
          rotations: null
        },
        2: {
          id: 2,
          residents: (dataset.residentsYear2 && dataset.residentsYear2.residents) || [],
          residentsModel: dataset.residentsYear2,
          oncall: {
            headers: dataset.oncallYear2.headers,
            rows: dataset.oncallYear2.rows
          },
          rotations: dataset.rotationsYear2 || null
        }
      };

      // The third and fourth years: a roster each — no on-call sheet and no
      // rotations tab yet, so their calendars stay empty rather than borrowing
      // another year's.
      [[3, dataset.residentsYear3], [4, dataset.residentsYear4]].forEach(([id, model]) => {
        this.yearBundles[id] = {
          id,
          residents: (model && model.residents) || [],
          residentsModel: model,
          oncall: { headers: [], rows: [] },
          rotations: null
        };
      });
    }


    /** Points the flat aliases at one year's data. */
    applyYear(id, options) {
      const opts = options || {};
      const bundle = (this.yearBundles || {})[id];
      if (!bundle) return false;

      this.year = id;

      if (id === 1) {
        // The first year keeps every derived feature (statistics, adjustments,
        // evaluation), so its aliases come straight from the main dataset.
        this.res = this.dataset.residents.residents.map(r =>
          Object.assign(r, { monthlyShift: this.dataset.residents.getShift(r, this.m + 1) })
        );
        this.residentsModel = this.dataset.residents;
      } else {
        this.res = bundle.residents;
        this.residentsModel = bundle.residentsModel;
      }
      this.oncHeaders = bundle.oncall.headers;
      this.oncRows = bundle.oncall.rows;
      this.yearRotations = bundle.rotations;

      if (!opts.silent) {
        this._dirtyTabs = new Set(['residents', 'shifts', 'oncall', 'doctorstats', 'myinfo']);
        this.renderTab(this.activeTab, { force: true, preserveScroll: true });
        this.renderYearSwitches();
      }
      return true;
    }


    /**
     * سنة كل واجهة على حدة. الافتراضي دائماً السنة الأولى، واختيارك في واجهة
     * لا ينتقل إلى غيرها: من يختار السنة الثانية في لائحة المقيمين ثم ينتقل
     * إلى المناوبات يجب أن يجد المناوبات على السنة الأولى.
     */
    yearForTab(tabId) {
      if (!this._tabYears) this._tabYears = {};
      return this._tabYears[tabId || this.activeTab] || 1;
    }

    setYear(id) {
      const n = Number(id);
      const tab = this.activeTab;
      if (n === this.yearForTab(tab)) return;
      const info = this.yearInfo(n);
      if (!info || !info.ready) {
        AUH.ui.showToast(`بيانات ${info ? info.label : 'هذه السنة'} لم تُضف بعد`, true);
        return;
      }
      if (!this._tabYears) this._tabYears = {};
      this._tabYears[tab] = n;
      this.applyYear(n);
      AUH.ui.showToast(`عرض ${info.label}`);
    }


    /** The switcher markup, reused by every tab that shows year-bound data. */
    yearSwitchHtml() {
      const years = AUH.config.years || [];
      const current = this.yearForTab(this.activeTab);
      return '<div class="year-switch" role="tablist" aria-label="اختيار السنة">' +
        years.map(y => {
          const on = y.id === current;
          const cls = ['year-btn', on ? 'on' : '', y.ready ? '' : 'soon'].filter(Boolean).join(' ');
          return `<button type="button" class="${cls}" role="tab" aria-selected="${on}"` +
            `${y.ready ? '' : ' disabled'} onclick="app.setYear(${y.id})">` +
            `<span class="year-n">${y.short}</span>` +
            (y.ready ? '' : '<span class="year-soon">قريباً</span>') + '</button>';
        }).join('') + '</div>';
    }


    /** Re-renders every switcher on the page so they stay in step. */
    renderYearSwitches() {
      document.querySelectorAll('.year-switch-host').forEach(host => {
        host.innerHTML = this.yearSwitchHtml();
      });
    }


    applyDataset(dataset, options) {
      const opts = options || {};
      this.dataset = dataset;

      this.residentsModel = dataset.residents;
      this.oncallModel = dataset.oncall;
      this.oncall2Model = dataset.oncallYear2;
      this.evaluationModel = dataset.evaluation;
      this.linksModel = dataset.links;
      this.qaModel = dataset.qa;

      // Flat aliases used throughout the views — pointed at the active year.
      this.buildYearBundles(dataset);
      // الافتراضي دائماً السنة الأولى، ولكل واجهة اختيارها بعد ذلك.
      this._tabYears = {};
      this.applyYear(1, { silent: true });

      // The second-year schedule stays available under its own alias: the
      // calendar shows both years side by side on the same day.
      this.oncHeaders2 = dataset.oncallYear2.headers;
      this.oncRows2 = dataset.oncallYear2.rows;
      this.lectures = dataset.lectures.list;

      // Official holidays come from their own sheet tab; the old rules tab is
      // still merged in for backward compatibility. Everything downstream
      // (duty times, hours, holiday counters, calendar colours) reads this set.
      this.holidaysModel = dataset.holidays;
      this.annualHolidays = new Set([...(dataset.rules.annualHolidays || []), ...dataset.holidays.dates]);

      // Derived data (order matters: adjustments need residents + on-call,
      // statistics need adjustments).
      const resolved = AUH.domain.adjustments.resolveAdjustments(dataset.adjustments.entries, {
        residents: dataset.residents,
        oncall: dataset.oncall,
        bonuses: dataset.adjustments.bonuses
      });
      this.adjustmentOverrides = resolved.overrides;
      this.adjustmentAdditions = resolved.additions;
      this.bonusHours = resolved.bonuses;

      this.doctorStats = AUH.domain.doctorStats.computeDoctorStats({
        residents: dataset.residents,
        oncall: dataset.oncall,
        evaluation: dataset.evaluation,
        overrides: this.adjustmentOverrides,
        additions: this.adjustmentAdditions,
        bonuses: this.bonusHours,
        annualHolidays: this.annualHolidays,
        today: this.today,
        currentMonth: this.m + 1
      });

      this.renderAll(options);
      this.renderYearSwitches();
      this.updateTime();
    }

    /**
     * Marks every tab as needing a re-render and refreshes the one on screen,
     * keeping the visitor exactly where they were (same tab, same selected
     * on-call day, same month, same scroll position).
     */
    renderAll(options) {
      const opts = options || {};
      this._dirtyTabs = new Set(['residents', 'shifts', 'oncall', 'lectures', 'doctorstats', 'evaluation', 'links', 'qa', 'myinfo']);
      this.renderTab(this.activeTab, { force: true, preserveScroll: !!opts.preserveScroll });
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

    /**
     * The "refresh now" badge: re-fetches everything and re-renders the current
     * tab even when the data is byte-identical — including "معلوماتي", so a
     * resident who searched for their name does not have to search again.
     */
    async manualRefresh() {
      if (this._manualRefreshRunning) return;
      this._manualRefreshRunning = true;

      const btn = document.getElementById('lastUpdateTime');
      if (btn) btn.classList.add('refreshing');
      this.clearNewData();

      try {
        const result = await this.loadFresh(true, { force: true });
        showToast(result && result.failed.length ? 'تم التحديث مع تعذر بعض الأقسام' : 'تم تحديث البيانات ✅');
      } catch (e) {
        showToast('تعذر التحديث، حاول مرة أخرى.');
      } finally {
        if (btn) btn.classList.remove('refreshing');
        this._manualRefreshRunning = false;
      }
    }

    /* ------------------------------------------------------- header badges */

    /** e.g. "Saturday, 22 آب 2026" — English words and digits, Levantine month. */
    updateDateBadge() {
      const el = document.getElementById('currentDateHeader');
      if (!el) return;
      const now = new Date();
      const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
      el.setAttribute('dir', 'ltr');
      // <bdi> keeps the Arabic month from swallowing the year: without it the
      // bidi algorithm renders "23 2026 آب" inside an LTR line.
      el.innerHTML = `<i class="fas fa-calendar-day"></i> ${weekday}, ${now.getDate()} <bdi>${MONTH_NAMES[now.getMonth()]}</bdi> ${now.getFullYear()}`;
    }

    /** e.g. "Last update 7:44 PM". Leaves the red "new data" state alone. */
    updateTime() {
      const el = document.getElementById('lastUpdateTime');
      if (!el || this._hasNewData) return;
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      el.setAttribute('dir', 'ltr');
      el.title = 'Tap to refresh now';
      el.innerHTML = `<i class="fas fa-rotate"></i> Last update ${time}`;
    }

    /** Red reminder that the sheet changed since the visitor last refreshed. */
    markNewData() {
      this._hasNewData = true;
      const el = document.getElementById('lastUpdateTime');
      if (!el) return;
      el.classList.add('has-update');
      el.setAttribute('dir', 'ltr');
      el.title = 'البيانات تغيّرت — اضغط لتحديث الصفحة';
      el.innerHTML = '<span class="update-dot"></span> New data — tap to refresh';
    }

    clearNewData() {
      if (!this._hasNewData) return;
      this._hasNewData = false;
      const el = document.getElementById('lastUpdateTime');
      if (el) el.classList.remove('has-update');
      this.updateTime();
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

    /** لائحة سنة بعينها — لا اللائحة النشطة. */
    rosterModelFor(yearId) {
      const y = Number(yearId) || 1;
      if (y === 1) return (this.dataset && this.dataset.residents) || this.residentsModel;
      const b = (this.yearBundles || {})[y];
      return (b && b.residentsModel) || null;
    }

    /**
     * يحلّ اسماً/اختصاراً من أي شيت إلى مقيم — **داخل سنته وحدها**.
     *
     * الاختصارات تتكرر بين السنوات («احمد» في الأولى والثانية معاً)، فالبحث
     * في اللائحة النشطة كان يعطي طبيب السنة الأولى لصفوف السنة الثانية.
     * تمرير `yearId` صريحاً هو ما يمنع الخلط جذرياً.
     */
    findRbyExact(nameOrAbbr, yearId) {
      const model = yearId ? this.rosterModelFor(yearId) : this.residentsModel;
      if (!model) return null;
      return model.findByNameOrAbbr(nameOrAbbr);
    }

    isHolidayDate(dateIso) {
      return schedule.isHolidayDate(dateIso, this.annualHolidays);
    }

    /** Name of an official holiday ('' for weekends and ordinary days). */
    getHolidayName(dateIso) {
      return this.holidaysModel.nameFor(dateIso);
    }

    /** True only for a date listed in the holidays sheet (not for Fri/Sat). */
    isOfficialHoliday(dateIso) {
      return this.holidaysModel.isOfficialHoliday(dateIso);
    }

    /** Official holidays inside a `YYYY-MM` month. */
    getHolidaysInMonth(key) {
      return this.holidaysModel.inMonth(key);
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

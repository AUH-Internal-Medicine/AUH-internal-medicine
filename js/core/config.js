/**
 * Central configuration — every id, endpoint, interval and feature flag lives here.
 *
 * This is the file to edit when the data moves: pointing the app at a different
 * spreadsheet, or (later) at a real backend, should not require touching any
 * parser, view or statistic. See 4-التوثيق/خطة-التحويل.md.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  /** Build id injected at deploy time (`__BUILD_ID__` in index.html). */
  const BUILD_ID = String(global.__APP_BUILD_ID__ || 'dev').trim();

  const CONFIG = {
    buildId: BUILD_ID,

    /**
     * Where the data comes from. `data/repository.js` is the only place that
     * branches on this.
     *   'auto' — use the API when `apiBaseUrl` is set, otherwise Google Sheets,
     *            and fall back to Google Sheets if the API request fails.
     *   'gviz' — always read the public Google Sheets directly (today's default).
     *   'api'  — always read the JSON backend (see 4-التوثيق/خطة-التحويل.md).
     *
     * So the site keeps working with the sheets right now, and switching to a
     * server later is a one-line change: set `apiBaseUrl`.
     */
    dataSource: 'auto',

    /**
     * Base URL of the JSON backend, e.g. 'https://api.example.com'.
     * Empty = no backend yet → everything reads from Google Sheets.
     */
    apiBaseUrl: '',

    /**
     * Transport for Google Sheets:
     *   'auto'   — normal fetch, falling back to a <script> (JSONP) request when
     *              the browser blocks it (this is what makes opening index.html
     *              directly from disk, file://, work at all — Google only sends
     *              CORS headers to a real http(s) origin).
     *   'fetch'  — fetch only.
     *   'jsonp'  — JSONP only (useful for testing the fallback).
     */
    sheetsTransport: 'auto',

    /** How long to wait for one sheet request before giving up (ms). */
    requestTimeoutMs: 20000,

    /** Google Sheets (gviz) source spreadsheets, keyed by the name used in the schema. */
    spreadsheets: {
      /** Main spreadsheet: residents, on-call, evaluation, links, Q&A, lectures, rules, adjustments. */
      main: '1Pb5VK1HsccaJpKXm-jersktd8yk4jf1V7o8qsDDmCI4',
      /** Second-year on-call schedule — a separate sheet maintained by another team. */
      year2: '1dOvCHFQBYz0wFklUFicjf8iU3IscJNzUrUcSYeKMlh8',
      /** Third and fourth years — one roster tab, names and abbreviations only. */
      year34: '1zJ9O5jKp5YwZomLdCZMgUOV4wCaTenmVOvEfxkhFhY4',
      /** Swap-request responses (the Google Form's own sheet). Read-only, and
       *  only for the "متابعة طلبات التبديل" box in معلوماتي. */
      swaps: '1ILIE9UFtRwo0aHufEo9edOZ-XEpMM5EFvio9aylahFU',
      /** استبيان المناوبات الشهري (شيت استمارة Google نفسها). للقراءة فقط،
       *  وتستعمله صفحة «نتائج الاستبيان» العامة. */
      survey: '1_GZlYCJRAeQlpCnsv9zzMM7HCANNVi2hFmaEM1l0kQ4'
    },

    /**
     * استبيانُ الشهر داخلَ الموقع — تبويبُ «استبيان شهر ١١».
     *
     * هذا هو **كلُّ** ما يُضبط لتشغيله أو إغلاقه أو نقلِه إلى الشهر التالي.
     * والكتابةُ تَمرّ عبر سكربتِ Apps Script في `5-أدوات/apps-script/`،
     * فالموقعُ ساكنٌ ولا يَكتب في شيتٍ بنفسه. خطواتُ النشر كاملةً في
     * `4-التوثيق/استبيان-الشهر-على-الموقع.md`.
     */
    surveyForm: {
      /**
       * رابطُ تطبيقِ الويب من Apps Script، المنتهي بـ `/exec`.
       * فارغاً ← يُعرض في التبويب «لم يُفتح بعد» بلا أيِّ عطل.
       */
      endpoint: 'https://script.google.com/macros/s/AKfycbwSOCA_xQbqgZSp6-1PHf-jU5zeghZgl4imjWlVZD-oTd9kZoizJWaoTA-qls56HxXBRA/exec',

      /**
       * معرّفُ OAuth للويب (Google Cloud Console). يُفعّل «الدخول بحساب
       * Google» فيصبح البريدُ موثَّقاً من Google لا مكتوباً بيد صاحبه.
       * فارغاً ← يُسأل المقيمُ عن بريدِه ويُطابَق ببُرُدِ من أجاب الشهرَ
       * الماضي. **اضبطه على القيمة نفسِها في السكربت أيضاً** — الصفحةُ
       * تُرسل الرمزَ والسكربتُ هو من يَتحقّق منه.
       */
      googleClientId: '',

      /** الشهرُ المسؤولُ عنه الاستبيان (أيامُ عدم القدرة على المناوبة). */
      month: 11,
      year: 2026,

      /** الشهرُ الذي يُقيَّم فرزُه ورزنامتُه (الشهرُ المنصرف). */
      ratedMonth: 10
    },

    /**
     * The residency years the site covers. Each year is a self-contained set of
     * sources: its own roster, its own on-call sheet, its own rotations. They
     * are never merged — a name or an abbreviation is only ever resolved inside
     * ONE year, which is what keeps «عمر» of the first year and «عمر» of the
     * second from being confused (37 abbreviations are shared between them).
     *
     * To add a year: fill in `sources` with its gids and flip `ready` to true.
     */
    years: [
      {
        id: 1, label: 'السنة الأولى', short: 'أولى', ready: true,
        spreadsheet: 'main',
        sources: { residents: 'residents', oncall: 'oncall' },
        /** Only the first year has a swap request form so far. */
        swaps: true
      },
      {
        id: 2, label: 'السنة الثانية', short: 'ثانية', ready: true,
        spreadsheet: 'year2',
        sources: { residents: 'residentsYear2', oncall: 'oncallYear2', rotations: 'rotationsYear2' },
        swaps: false
      },
      {
        id: 3, label: 'السنة الثالثة', short: 'ثالثة', ready: true,
        spreadsheet: 'year34',
        sources: { residents: 'residentsYear3' },
        /** Roster only — no on-call sheet and no rotations tab yet. */
        rosterOnly: true, swaps: false
      },
      {
        id: 4, label: 'السنة الرابعة', short: 'رابعة', ready: true,
        spreadsheet: 'year34',
        sources: { residents: 'residentsYear4' },
        rosterOnly: true, swaps: false
      }
    ],

    /** The year shown on first visit. */
    defaultYear: 1,

    /** localStorage cache. Bump `cacheVersion` to invalidate every visitor's cache. */
    cacheVersion: 'hc_v65',
    get cacheKey() {
      return `${this.cacheVersion}_${this.buildId}`;
    },
    /** Cached payloads older than this are ignored (ms). */
    cacheTtlMs: 10 * 60 * 1000,

    /** Background data refresh while the tab is visible (ms). Nothing re-renders
     * unless the sheet actually changed. */
    refreshIntervalMs: 180 * 1000,
    /** How often to check whether a newer build was deployed (ms). */
    updateCheckIntervalMs: 90 * 1000,

    /** Console diagnostics. Turn on at runtime with: localStorage.setItem('auh_debug','1') */
    debug: AUH.storage.get('auh_debug') === '1'
  };

  /** Arabic (Levantine) month names, index 0 = January. */
  const MONTH_NAMES = [
    'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'
  ];

  /** Arabic day names, index 0 = Sunday (matches Date#getDay). */
  const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /** Calendar grids in this app start on Monday. */
  const CALENDAR_DAY_HEADERS = ['اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

  /**
   * Primary navigation tabs, in display order.
   *
   * `hidden: true` يُخفي **زرَّ** التبويب من الشريط فقط. والتبويبُ نفسُه يبقى
   * كاملاً — قسمُه في الصفحة، ودالّةُ رسمِه، وبياناتُه — فيُفتح بـ
   * `app.activateTab('<id>')` من الكونسول، ويعود بحذف السطر لا بإعادة كتابته.
   * فالإخفاءُ قرارُ عرض، لا حذفُ ميزة.
   */
  const TABS = [
    { id: 'residents', icon: '<i class="fas fa-user-doctor"></i>', label: 'لائحة المقيمين' },
    // استبيانُ الشهر — مُوقَّتٌ بطبعه: يُعبَّأ مرّةً في الشهر ثم يُغلق. ولذلك
    // زرُّه مميَّزٌ بلونٍ خاصٍّ لا بلونِ «الأدوية الإسعافية»، فلا يُزاحمه في
    // جلبِ النظر. وإخفاؤه بعد انتهاء الشهر بسطرٍ واحد: `hidden: true`.
    { id: 'survey11', icon: '<i class="fas fa-clipboard-question"></i>', label: 'استبيان شهر 11', highlight: 'survey' },
    { id: 'lectures', icon: '<i class="fas fa-calendar-check"></i>', label: 'رزنامة المحاضرات', hidden: true },
    { id: 'shifts', icon: '<i class="fas fa-clipboard-list"></i>', label: 'الفروز' },
    { id: 'oncall', icon: '<i class="fas fa-calendar-days"></i>', label: 'المناوبات' },
    { id: 'exams', icon: '<i class="fas fa-file-pen"></i>', label: 'الامتحانات والاختبارات', hidden: true },
    { id: 'clinicalcases', icon: '<i class="fas fa-stethoscope"></i>', label: 'مشروع الحالات السريرية', hidden: true },
    { id: 'doctorstats', icon: '<i class="fas fa-chart-column"></i>', label: 'احصائيات الأطباء' },
    { id: 'evaluation', icon: '<i class="fas fa-chart-line"></i>', label: 'التقييم السنوي' },
    // مبادرة الأدوية الإسعافية — تُعرض عالياً لأن الحاجة إليها لحظية: زميل
    // في الإسعاف يحتاج دواءً الآن، فيفتح الموقع ليجد رقم المناوب اليوم.
    { id: 'emergencymeds', icon: '<i class="fas fa-kit-medical"></i>', label: 'أدوية إسعافية', highlight: true },
    { id: 'links', icon: '<i class="fas fa-link"></i>', label: 'روابط هامة' },
    { id: 'myinfo', icon: '<i class="fas fa-id-card"></i>', label: 'معلوماتي' },
    { id: 'qa', icon: '<i class="fas fa-circle-question"></i>', label: 'Q&A' }
  ];

  AUH.config = CONFIG;
  AUH.constants = { MONTH_NAMES, DAY_NAMES, CALENDAR_DAY_HEADERS, TABS };
})(typeof window !== 'undefined' ? window : globalThis);

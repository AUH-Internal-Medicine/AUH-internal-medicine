/**
 * THE DATA CONTRACT — one declarative description of every sheet the app reads.
 *
 * Why this file exists
 * --------------------
 * The Google Sheets are maintained by people, not by developers: columns get
 * renamed, reordered, inserted and re-worded. The old code addressed most cells
 * by fixed position (`row[4]`), so any of those edits silently produced wrong
 * numbers on the site. Here, every field is described by the *names* it may
 * appear under, and `data/header-map.js` resolves those names to whatever
 * position they happen to occupy today — reporting anything it could not find
 * instead of guessing.
 *
 * Adding a field: add an entry to `columns` with the header labels it can have.
 * Adding a monthly column: nothing to do, `patterns` already discovers it.
 * Moving to a backend: this file becomes the mapping between API/DB fields and
 * the app's field names (see docs/BACKEND-MIGRATION.md).
 *
 * Per-column options
 *   labels    — accepted header names, best first (compared Arabic-normalized).
 *   required  — a missing column is reported as an error, not a warning.
 *   match     — strategies to try, in order. Default: exact → prefix → contains.
 *               'contains' only claims a column when exactly one header matches.
 *   type      — 'text' | 'number' | 'date' | 'url' | 'multiline' (documentation
 *               + used by the data-health checks).
 *   note      — free text shown in the generated data-contract documentation.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  const SCHEMA = {
    /* ------------------------------------------------------------ residents */
    residents: {
      key: 'residents',
      label: 'لائحة المقيمين',
      spreadsheet: 'main',
      gid: '0',
      format: 'csv',
      headerRow: 0,
      columns: {
        seq: { labels: ['ت', 'م', '#', 'التسلسل', 'الرقم'], match: ['exact'], type: 'number', fallbackIndex: 0, note: 'الترقيم كما في الشيت (العمود الأول عادةً بلا عنوان)' },
        name: { labels: ['الاسم الثلاثي', 'الاسم الكامل', 'الاسم'], required: true, type: 'text' },
        phone: { labels: ['رقم الهاتف', 'الهاتف', 'الموبايل', 'الجوال'], type: 'text' },
        abbr: { labels: ['الاختصار', 'الكنية'], required: true, type: 'text', note: 'المفتاح المستخدم لربط المقيم بجداول المناوبات' },
        gender: { labels: ['الجنس'], type: 'text' },
        spec: { labels: ['الاختصاص'], type: 'text' },
        leaveAvg: { labels: ['معدل الإجازة'], type: 'number' },
        rankAvg: { labels: ['معدل التفاضل'], type: 'number' },
        regType: { labels: ['نوع التسجيل'], type: 'text' },
        university: { labels: ['الجامعة الأم'], type: 'text' },
        join: { labels: ['تاريخ الالتحاق', 'الالتحاق'], type: 'date' },
        status: { labels: ['الحالة'], required: true, type: 'text' },
        detachDate: { labels: ['تاريخ الانفكاك'], type: 'date' },
        detachReason: { labels: ['سبب الانفكاك'], type: 'text' },
        advanceOncalls: { labels: ['مناوبات سلف'], type: 'number', note: 'مناوبات مدفوعة سلفاً — غير مستخدمة في الواجهة حالياً' },
        // Optional: only present in older copies of the sheet. The roster column
        // now shows the value computed from the on-call log instead.
        cumulativeOncalls: { labels: ['المناوبات+', 'المناوبات التراكمية'], match: ['exact'], type: 'number', silentIfMissing: true }
      },
      patterns: {
        /** "فرز شهر 8" → the resident's rotation for month 8. */
        shiftByMonth: { regex: /^فرز\s*شهر\s*(\d{1,2})$/, field: 'month', label: 'الفرز الشهري' },
        /** "مناوبات شهر 8" → number of on-calls assigned that month (informational). */
        oncallsByMonth: { regex: /^مناوبات\s*شهر\s*(\d{1,2})$/, field: 'month', label: 'عدد مناوبات الشهر' }
      },
      /** Rows whose name cell is empty or echoes a header are skipped. */
      skipNameValues: ['الاسم', 'الاسم الثلاثي'],
      unspecifiedValue: 'غير محدد'
    },

    /* -------------------------------------------------------------- on-call */
    oncall: {
      key: 'oncall',
      label: 'المناوبات (السنة الأولى)',
      spreadsheet: 'main',
      gid: '238974679',
      format: 'json',
      headerRow: 0,
      columns: {
        day: { labels: ['اليوم'], type: 'text' },
        date: { labels: ['التاريخ', 'Date'], required: true, type: 'date' }
      },
      /**
       * Every remaining column with a non-empty header is an on-call category
       * ("عناية قلبية", "تالت", "اسعاف بارد ليلي", …) whose cells hold one or
       * more resident names. Adding a category to the sheet needs no code change.
       */
      categoryColumns: true
    },

    /** Second-year on-call schedule — different spreadsheet, different shape. */
    oncallYear2: {
      key: 'oncallYear2',
      label: 'مناوبات السنة الثانية',
      spreadsheet: 'year2',
      gid: '0',
      format: 'csv',
      /**
       * The header is EITHER one row of already-repeated labels, OR two merged
       * rows (group + sub-role) that need forward-filling. The parser detects
       * which by checking whether row 1 starts with a date. Column 0 is the
       * date; every other column is one resident per duty slot.
       */
      headerRow: 'auto',
      categoryColumns: true
    },

    /** Manual corrections/additions that cannot be expressed in the on-call table. */
    oncallAdjustments: {
      key: 'oncallAdjustments',
      label: 'تعديلات المناوبات',
      spreadsheet: 'main',
      gid: '1181737768',
      format: 'csv',
      headerRow: 0,
      columns: {
        name: { labels: ['الاسم', 'الاسم الثلاثي'], required: true, fallbackIndex: 0, type: 'text' },
        abbr: { labels: ['الاختصار'], fallbackIndex: 1, type: 'text' },
        date: { labels: ['تاريخ المناوبة', 'التاريخ'], required: true, fallbackIndex: 2, type: 'date' },
        category: { labels: ['نوع المناوبة', 'المناوبة'], required: true, fallbackIndex: 3, type: 'text' },
        hours: { labels: ['عدد الساعات', 'الساعات'], required: true, fallbackIndex: 4, type: 'number' }
      }
    },

    /* ----------------------------------------------------------- evaluation */
    evaluation: {
      key: 'evaluation',
      label: 'التقييم السنوي',
      spreadsheet: 'main',
      gid: '253629565',
      format: 'csv',
      headerRow: 0,
      columns: {
        seq: { labels: ['ت', 'م', '#'], match: ['exact'], fallbackIndex: 0, type: 'number' },
        name: { labels: ['الاسم الثلاثي', 'الاسم'], required: true, type: 'text' },
        abbr: { labels: ['الاختصار'], required: true, type: 'text' },
        spec: { labels: ['الاختصاص'], type: 'text' },
        total: { labels: ['المحصلة الإجمالية', 'المحصلة الاجمالية', 'المحصلة'], type: 'text' },
        praise: { labels: ['الثناءات'], type: 'text', note: 'عدد الثناءات (رقم) أو نص يحوي ثناءً في كل سطر' },
        penalty: { labels: ['العقوبات'], type: 'text', note: 'عدد العقوبات (رقم) أو نص يحوي عقوبة في كل سطر' }
      },
      /**
       * The eight scored skills, in display order. Header labels in the sheet
       * carry their weight ("المهارات السريرية 25%"), so they are matched by
       * prefix and the full sheet label is what gets displayed.
       */
      skills: [
        { key: 'clinical', labels: ['المهارات السريرية'], label: 'المهارات السريرية' },
        { key: 'knowledge', labels: ['المعرفة الطبية'], label: 'المعرفة الطبية' },
        { key: 'decision', labels: ['اتخاذ القرار السريري', 'اتخاذ القرار'], label: 'اتخاذ القرار السريري' },
        { key: 'procedural', labels: ['المهارات الإجرائية', 'المهارات الاجرائية'], label: 'المهارات الإجرائية' },
        { key: 'teamwork', labels: ['العمل ضمن فريق'], label: 'العمل ضمن فريق' },
        { key: 'professionalism', labels: ['المهنية والانضباط'], label: 'المهنية والانضباط' },
        { key: 'communication', labels: ['التواصل مع المرضى'], label: 'التواصل مع المرضى' },
        { key: 'academic', labels: ['النشاطات الأكاديمية', 'النشاطات الاكاديمية'], label: 'النشاطات الأكاديمية' }
      ],
      /** Demo row kept in the sheet for the staff who fill it in. */
      exampleNameValues: ['مثال توضيحي'],
      /** A trailing row with totals but no name — skipped (name is required). */
      note: 'صفوف بلا اسم (كصف المجاميع الأخير) تُتجاهَل تلقائياً'
    },

    /* ---------------------------------------------------------------- links */
    links: {
      key: 'links',
      label: 'روابط هامة',
      spreadsheet: 'main',
      gid: '1649404909',
      format: 'csv',
      headerRow: 0,
      columns: {
        seq: { labels: ['ت', 'م', '#'], match: ['exact'], fallbackIndex: 0, type: 'number' },
        name: { labels: ['الاسم'], required: true, type: 'text' },
        type: { labels: ['النوع'], type: 'text' },
        purpose: { labels: ['الغاية والهدف', 'الغاية'], type: 'text' },
        members: { labels: ['الأعضاء', 'الاعضاء'], type: 'text' },
        url: { labels: ['رابط الانضمام', 'الرابط'], type: 'url' }
      }
    },

    /* ------------------------------------------------------------------ Q&A */
    qa: {
      key: 'qa',
      label: 'الأسئلة والأجوبة',
      spreadsheet: 'main',
      gid: '680270268',
      format: 'json',
      headerRow: 0,
      columns: {
        seq: { labels: ['ت', 'م', '#'], match: ['exact'], fallbackIndex: 0, type: 'number' },
        category: { labels: ['التصنيف'], fallbackIndex: 1, type: 'text' },
        question: { labels: ['السؤال'], required: true, fallbackIndex: 2, type: 'text' },
        answer: { labels: ['الجواب', 'الإجابة'], required: true, fallbackIndex: 3, type: 'multiline' }
      },
      defaultCategory: 'عام'
    },

    /* ------------------------------------------------------------- lectures */
    lectures: {
      key: 'lectures',
      label: 'رزنامة المحاضرات والأنشطة',
      spreadsheet: 'main',
      gid: '393274093',
      format: 'csv',
      headerRow: 0,
      columns: {
        date: { labels: ['التاريخ'], required: true, type: 'date' },
        category: { labels: ['التصنيف'], type: 'text' },
        title: { labels: ['العنوان'], required: true, type: 'text' },
        content: { labels: ['المحتويات', 'المحتوى'], type: 'multiline' },
        speaker: { labels: ['المحاضر'], type: 'text' },
        speakerBio: { labels: ['تعريف عن المحاضر'], type: 'multiline' },
        place: { labels: ['المكان'], type: 'text' },
        time: { labels: ['التوقيت', 'الوقت'], type: 'text' },
        duration: { labels: ['المدة'], type: 'text' },
        dept: { labels: ['القسم'], type: 'text' },
        year: { labels: ['السنة'], type: 'text' },
        supervisor: { labels: ['المشرف'], type: 'text' },
        regLink: { labels: ['رابط التسجيل'], type: 'url' },
        annLink: { labels: ['رابط الاعلان', 'رابط الإعلان'], type: 'url' }
      }
    },

    /* ------------------------------------------------------ official holidays */
    holidays: {
      key: 'holidays',
      label: 'العطل الرسمية',
      spreadsheet: 'main',
      gid: '1388329552',
      format: 'csv',
      headerRow: 0,
      columns: {
        date: { labels: ['التاريخ', 'تاريخ العطلة', 'اليوم'], required: true, fallbackIndex: 0, type: 'date', note: 'يوم - شهر - سنة (يقبل - / . \\ كفواصل)' },
        name: { labels: ['اسم العطلة', 'المناسبة', 'العطلة', 'الاسم'], required: true, fallbackIndex: 1, type: 'text' }
      },
      note: 'كل تاريخ هنا يُعامل كعطلة في كل الموقع: توقيت ومدة المناوبة، حساب الساعات، عدّاد مناوبات العطل، وتلوين الرزنامات.'
    },

    /* -------------------------------------------------- on-call rules sheet */
    oncallRules: {
      key: 'oncallRules',
      label: 'قواعد المناوبات (العطل السنوية)',
      spreadsheet: 'main',
      gid: '1364488029',
      format: 'csv',
      headerRow: 0,
      /**
       * Duty times/durations are FIXED IN CODE (domain/oncall-schedule.js).
       * This tab is read only for the annual-holiday dates listed under a
       * "العطل السنوية" row: column B of every row below it.
       */
      annualHolidaysSection: { label: 'العطل السنوية', dateColumn: 1 }
    }
  };

  /** Sources fetched on every load, in the order they are requested. */
  const SOURCE_ORDER = [
    'residents',
    'oncall',
    'oncallYear2',
    'oncallAdjustments',
    'evaluation',
    'links',
    'qa',
    'lectures',
    'holidays',
    'oncallRules'
  ];

  AUH.data.schema = SCHEMA;
  AUH.data.sourceOrder = SOURCE_ORDER;
})(typeof window !== 'undefined' ? window : globalThis);

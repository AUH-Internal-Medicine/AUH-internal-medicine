/**
 * استبيان المناوبات الشهري — طبقة البيانات.
 *
 * مصدرها شيت استمارة Google نفسه (وليس الشيت الرئيسي)، ولذلك تعريف أعمدتها
 * يعيش هنا لا في `schema.js`: هذه الأعمدة تتبع أسئلة الاستمارة، وتتبدّل كلّما
 * بُدِّل سؤال — تماماً كما فعلت `swap-requests.js` مع شيت طلبات التبديل.
 *
 * القاعدة نفسها تسري: **لا يُقرأ عمود بموضعه أبداً.** كل حقل يُعلَن بالعناوين
 * التي قد يحملها، و`data/header-map.js` يجد موضعه اليوم ويبلّغ عمّا لم يجده.
 * فلو أعاد أحدهم صياغة سؤال في الاستمارة، ظهر ذلك تحذيراً في الطرفية وفي
 * شريط الحالة أعلى الصفحة، لا رقماً خاطئاً بصمت.
 *
 * الطبقة تُعيد صفوفاً منظّفة فقط؛ الحساب في `domain/survey-stats.js`، والعرض
 * في `views/survey-*.js`.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;
  const { toAsciiDigits, normAr } = AUH.text;

  /* ------------------------------------------------------------- the contract */

  /**
   * القسم الأول من الاستبيان + حقول الطلبات.
   * العناوين منسوخة كما هي من الاستمارة؛ المقارنة تتم بعد تطبيع عربي، فلا
   * تهمّ الهمزات ولا المسافات الزائدة ولا أسطر السؤال المتعددة.
   */
  const SOURCE = {
    key: 'survey',
    label: 'استبيان المناوبات الشهري',
    spreadsheet: 'survey',
    gid: '0',
    format: 'json',
    headerRow: 0,
    columns: {
      /* — هوية المشارك: لا تُعرض إطلاقاً في الصفحة العامة — */
      ts:    { labels: ['Timestamp', 'الطابع الزمني'], match: ['exact'], required: true, type: 'date' },
      email: { labels: ['Email Address', 'عنوان البريد الإلكتروني', 'البريد الإلكتروني'], match: ['exact', 'prefix'], type: 'text' },
      name:  { labels: ['الاسم الثلاثي', 'الاسم الكامل'], match: ['exact'], required: true, type: 'text' },
      abbr:  { labels: ['الاختصار', 'الكنية'], match: ['exact'], type: 'text' },
      phone: { labels: ['رقم الهاتف', 'الهاتف', 'الموبايل'], match: ['exact', 'prefix'], type: 'text' },

      /* — القسم الأول: الفرز الحالي وصعوبته والتفريغ — */
      rotation:    { labels: ['ماهو فرزك لهذا الشهر ؟', 'ما هو فرزك لهذا الشهر'], match: ['exact', 'prefix'], required: true, type: 'text' },
      difficulty:  { labels: ['تقييمك لصعوبة الفرز من 10', 'تقييمك لصعوبة الفرز'], match: ['exact', 'prefix'], required: true, type: 'number' },
      hadRelief:   { labels: ['هل كان هناك تفريغ ؟', 'هل كان هناك تفريغ'], match: ['exact', 'prefix'], type: 'text' },
      reliefCount: { labels: ['كم عدد التفريغات ؟', 'كم عدد التفريغات'], match: ['exact', 'prefix'], type: 'number' },

      /* — الطلبات والتوصيات: تُعدّ في الصفحة العامة، وتُقرأ كاملةً في لوحة الإدارة — */
      wanted:        { labels: ['فرز'], match: ['exact'], type: 'text', note: 'صعب / سهل — الفرز المطلوب للشهر القادم' },
      wantedReason:  { labels: ['السبب'], match: ['exact'], type: 'multiline', note: 'سبب طلب الفرز الصعب/السهل' },
      daysRequested: { labels: ['اذكر تواريخ الايام', 'اذكر تواريخ الأيام'], match: ['exact', 'prefix'], type: 'text' },
      daysReason:    { labels: ['السبب ذكر السبب هام ولن يقبل الطلب دون ذكر السبب', 'ذكر السبب هام'], type: 'multiline' },
      scheduleProblem: { labels: ['هل كان هناك مشاكل في جدول مناوبات الشهر الماضي ؟ ما هو وماذا تقترح', 'هل كان هناك مشاكل في جدول مناوبات الشهر الماضي'], type: 'multiline' },
      otherRequests:   { labels: ['هل هناك طلبات اخرى ترغب بها بخصوص المناوبات ؟ لاسباب اضطرارية', 'هل هناك طلبات اخرى ترغب بها بخصوص المناوبات'], type: 'multiline' }
    }
  };

  /**
   * أعمدة التقييم الرقمية (القسم الثاني وما بعده): تقييم بقية الفروز، ثم
   * تقييم المناوبات. تُعلَن قائمةً لأنها متشابهة الشكل، ويُعرَض متوسطها في
   * لوحة الإدارة وحدها — الصفحة العامة لا تقترب منها.
   *
   * `labels` هنا جزءٌ مميِّز من عنوان السؤال الطويل، لأن السؤال في الاستمارة
   * يحمل مقدّمةً واحدة مكرّرة قبل اسم الفرز.
   */
  const RATING_GROUPS = [
    {
      key: 'rotations',
      label: 'تقييم بقية الفروز',
      note: 'يجيب عنها من داوم في الفرز سابقاً فقط',
      items: [
        ['kidney', 'الكلية', 'فرز الكلية'],
        ['chest', 'الصدرية', 'فرز الصدرية'],
        ['erInternal', 'الإسعاف الداخلي', 'فرز الاسعاف الداخلي'],
        ['gi', 'الهضمية', 'فرز الهضمية'],
        ['heartHospital', 'مشفى القلب', 'فرز مشفى القلب'],
        ['generalWard', 'جناح العامة', 'فرز جناح العامة'],
        ['ccu', 'العناية القلبية', 'فرز العناية القلبية'],
        ['neuro', 'العصبية', 'فرز عصبية'],
        ['hema', 'الدموية', 'فرز دموية'],
        ['icu', 'العناية الداخلية', 'فرز عناية داخلية'],
        ['cardioClinic', 'عيادة القلبية', 'فرز عيادة القلبية'],
        ['generalClinic', 'العيادة العامة', 'فرز عيادة العامة'],
        ['rheum', 'الرثوية', 'فرز رثوية'],
        ['onco', 'الأورام', 'فرز أورام'],
        ['endo', 'الغدية', 'فرز غدية'],
        ['cardioConsult', 'استشارات قلبية', 'فرز استشارات قلبية']
      ]
    },
    {
      key: 'duties',
      label: 'تقييم المناوبات',
      note: 'تقييم كل نوع مناوبة على حدة',
      items: [
        ['dCcu', 'عناية قلبية', 'تقييم مناوبة عناية قلبية'],
        ['dCenterIcu', 'عناية مركز', 'تقييم مناوبة عناية مركز'],
        ['dIcu', 'عناية داخلية', 'تقييم مناوبة عناية داخلية'],
        ['dSeventh', 'سابع', 'سابع'],
        ['dFourth', 'رابع', 'رابع'],
        ['dThird', 'ثالث', 'ثالث'],
        ['dSecond', 'ثاني', 'ثاني'],
        ['dOut', 'خارجيات', 'خارجيات'],
        ['dOnco', 'أورام', 'أورام'],
        ['dCenterAm', 'إسعاف مركز صباحي', 'اسعاف مركز صباحي'],
        ['dCenterPm', 'إسعاف مركز ليلي', 'اسعاف مركز ليلي'],
        ['dColdAm', 'إسعاف بارد صباحي', 'اسعاف بارد صباحي'],
        ['dColdPm', 'إسعاف بارد ليلي', 'اسعاف بارد ليلي'],
        ['dGateAm', 'إسعاف باب نهاري', 'اسعاف باب نهاري'],
        ['dGatePm', 'إسعاف باب ليلي', 'اسعاف باب ليلي'],
        ['dInternalPm', 'إسعاف داخلي ليلي', 'اسعاف داخلي ليلي'],
        ['dInternalAm', 'إسعاف داخلي نهاري', 'اسعاف داخلي نهاري'],
        ['dDialysis', 'ديال', 'ديال']
      ]
    }
  ];

  /* ------------------------------------------------------------------ helpers */

  /**
   * أوّل عدد في الخلية: "٥" → 5 · "7-8" → 7 · "١٠ ١١" → 10 · "لا يوجد" → null.
   *
   * **أوّل عدد، لا كل الأرقام.** حقل «كم عدد التفريغات» نصٌّ حرّ في الاستمارة،
   * وقد كُتب فيه «حسب عدد المرضى ١٠ ١١». حذف غير الأرقام كان يجعلها 1011،
   * فيقفز متوسط التفريغات إلى 50 — وهو أوّل رقم خاطئ ظهر في هذه الصفحة.
   */
  function num(value) {
    const t = toAsciiDigits(String(value === null || value === undefined ? '' : value));
    const m = t.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function clean(value) {
    return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  }

  /** نصّ حرّ: تُبقى الأسطر، ويُهمَل الجواب الفارغ أو «لا» وحدها. */
  function freeText(value) {
    const t = String(value === null || value === undefined ? '' : value).trim();
    if (!t) return '';
    const n = normAr(t).replace(/[.،؟!]/g, '').trim();
    if (n === 'لا' || n === 'ﻻ' || n === 'no' || n === 'لايوجد' || n === 'لا يوجد' || n === 'ماشي' || n === 'لاشي' || n === 'لا شي') return '';
    return t;
  }

  /** الشهر الذي تعود إليه المشاركة: `YYYY-MM` من الطابع الزمني. */
  function monthOf(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : '';
  }

  /* --------------------------------------------------------------------- load */

  /**
   * يقرأ الشيت ويعيد `{ responses, issues, headers, ratingDefs }`.
   * لا يرمي أبداً: الفشل يعود `responses: null` ليعرضه العارض رسالةً ظاهرة
   * بدل صفحة فارغة صامتة (وهو أحد ثوابت المشروع).
   */
  async function load() {
    const table = await AUH.data.gviz.fetchSource(SOURCE);
    if (!table || table.length < 2) {
      log.warn('survey', 'لم تصل أي بيانات من شيت الاستبيان');
      return { responses: null, issues: [], headers: [], ratingDefs: [] };
    }

    const [headerRow, ...rows] = table;
    const resolution = AUH.data.headers.resolveColumns(headerRow, SOURCE);
    AUH.data.headers.logResolution(SOURCE, resolution);
    const get = AUH.data.headers.createAccessor(resolution.map);

    /* أعمدة التقييم: تُحلّ بعد الحقول المسمّاة حتى لا تسرق عموداً منها. */
    const claimed = new Set(Object.values(resolution.map).filter(Number.isInteger));
    const ratingDefs = [];
    for (const group of RATING_GROUPS) {
      const defs = group.items.map(([key, label, header]) => ({ key, label, labels: [header] }));
      const found = AUH.data.headers.resolveList(headerRow, defs, { claimed });
      found.forEach((entry, i) => {
        if (entry.index >= 0) claimed.add(entry.index);
        ratingDefs.push({
          group: group.key,
          groupLabel: group.label,
          key: entry.key,
          label: group.items[i][1],
          index: entry.index
        });
      });
    }

    const responses = [];
    for (const row of rows) {
      const name = clean(get(row, 'name'));
      const rotation = clean(get(row, 'rotation'));
      if (!name && !rotation) continue;

      const ts = clean(get(row, 'ts'));
      const ratings = {};
      for (const def of ratingDefs) {
        if (def.index < 0) continue;
        const v = num(row[def.index]);
        if (v !== null) ratings[def.key] = v;
      }

      responses.push({
        ts,
        month: monthOf(ts),
        name,
        abbr: clean(get(row, 'abbr')),
        /* الأرقام العربية-الهندية تُحوَّل: رابط `tel:` لا يتصل بـ«٠٩٦٦…». */
        phone: toAsciiDigits(clean(get(row, 'phone'))),
        email: clean(get(row, 'email')),
        rotation,
        rotationKey: normAr(rotation),
        difficulty: num(get(row, 'difficulty')),
        hadRelief: clean(get(row, 'hadRelief')),
        reliefCount: num(get(row, 'reliefCount')),
        wanted: clean(get(row, 'wanted')),
        wantedReason: freeText(get(row, 'wantedReason')),
        daysRequested: freeText(get(row, 'daysRequested')),
        daysReason: freeText(get(row, 'daysReason')),
        scheduleProblem: freeText(get(row, 'scheduleProblem')),
        otherRequests: freeText(get(row, 'otherRequests')),
        ratings
      });
    }

    log.info('survey', `قُرئت ${responses.length} مشاركة`);
    return {
      responses,
      issues: resolution.issues.filter(i => i.level === 'error' || i.level === 'warn'),
      headers: resolution.headers,
      ratingDefs: ratingDefs.filter(d => d.index >= 0)
    };
  }

  AUH.data.survey = { SOURCE, RATING_GROUPS, load, num, freeText };
})(typeof window !== 'undefined' ? window : globalThis);

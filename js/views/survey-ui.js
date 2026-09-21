/**
 * استبيان المناوبات — لبنات العرض المشتركة بين الصفحة العامة ولوحة الإدارة.
 *
 * كل ما هنا يبني نصّ HTML من أرقامٍ حُسبت في `domain/survey-stats.js`.
 * لا يجلب شيئاً، ولا يحسب شيئاً — وكل قيمة قادمة من الشيت تمرّ بـ`escapeHtml`
 * قبل أن تدخل الصفحة، فالشيت مفتوح للتعديل لأكثر من شخص.
 *
 * قواعد الرسم (وهي التي تجعل الأشكال مقروءة لا مزخرفة):
 *   · **فوق كل عمود عدده مكتوباً.** فاللون والارتفاع تأكيدٌ، والرقم هو الأصل:
 *     تمييز الأخضر عن الذهبي يضعف عند عمى الألوان، ويختفي في الطباعة.
 *   · لونٌ واحد لكل تقييم: الأخضر لمن يداوم في الفرز الآن، والذهبي لمن مرّ
 *     عليه — ولكلٍّ عنوانه المكتوب فوقه، فلا يُحمَّل اللون وحده معنى.
 *   · طرف العمود وحده مدوَّر، وقاعدته مربّعة على خطّ الأساس.
 *   · التوزيع يُعرض كاملاً ١..١٠ حتى الدرجات التي لم يخترها أحد — غيابها
 *     معلومة، وحذفها يجعل الشكل يكذب.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml } = AUH.text;
  const MONTHS = AUH.constants.MONTH_NAMES;

  /* ------------------------------------------------------------------ أرقام */

  /** رقم للعرض: أرقام لاتينية، فاصلة عشرية عند الحاجة فقط. */
  function fmt(value, digits) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    const d = digits === undefined ? 0 : digits;
    const n = Number(value);
    return d ? n.toFixed(d).replace(/\.0+$/, '') : String(Math.round(n));
  }

  function pct(part, whole) {
    if (!whole) return 0;
    return (part / whole) * 100;
  }

  /**
   * صيغة العدد العربية الصحيحة: «تقييم واحد» · «تقييمان» · «3 تقييمات» ·
   * «12 تقييماً». الشكل الآلي «1 تقييمات» هو أوّل ما يفضح واجهةً لم يقرأها أحد.
   */
  function countLabel(n, singular, dual, plural) {
    if (n === 0) return `بلا ${singular}`;
    if (n === 1) return singular + ' واحد';
    if (n === 2) return dual;
    if (n <= 10) return `${n} ${plural}`;
    return `${n} ${singular}اً`;
  }

  /** `2026-09` → «أيلول 2026». */
  function monthLabel(key) {
    const m = String(key || '').match(/^(\d{4})-(\d{2})$/);
    if (!m) return 'كل الردود';
    const idx = parseInt(m[2], 10) - 1;
    return `${MONTHS[idx] || m[2]} ${m[1]}`;
  }

  /** طابع زمني ISO → «17/09/2026». */
  function when(iso) {
    return AUH.dates.formatDisplayDate(iso) || '';
  }

  /* ------------------------------------------------------------- حالة الصفحة */

  /**
   * العطل يُرى دائماً. صفحةٌ فارغة بلا سبب هي أسوأ ما يمكن أن يحدث هنا:
   * الزائر يظنّ أن لا أحد شارك، والحقيقة أن التحميل فشل.
   */
  function status(el, level, title, message) {
    if (!el) return;
    el.className = `status show${level === 'warn' ? ' warn' : ''}`;
    el.innerHTML =
      `<i class="fas ${level === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation'}"></i>` +
      `<div><b>${escapeHtml(title)}</b>${escapeHtml(message)}</div>`;
  }

  function clearStatus(el) {
    if (el) el.className = 'status';
  }

  /* ------------------------------------------------------------- شريط الأرقام */

  /** cells: [{label, value, unit, sub}] */
  function band(cells) {
    return (
      '<section class="band">' +
      cells
        .map(
          c =>
            '<div class="band-cell">' +
            `<div class="band-label">${escapeHtml(c.label)}</div>` +
            `<div class="band-value"><span class="num">${escapeHtml(String(c.value))}</span>` +
            (c.unit ? `<span class="unit">${escapeHtml(c.unit)}</span>` : '') +
            '</div>' +
            (c.sub ? `<div class="band-sub">${escapeHtml(c.sub)}</div>` : '') +
            '</div>'
        )
        .join('') +
      '</section>'
    );
  }

  /* --------------------------------------------------------- توزيع الدرجات */

  /**
   * مدرّج الدرجات ١..١٠ لتقييم واحد: كم واحداً وضع ١، وكم وضع ٢ … وفوق كل
   * عمود عدده. `subject` يدخل في تلميح كل عمود ليقول ماذا يعني الرقم.
   */
  function distChart(bins, subject) {
    const max = Math.max(1, ...bins.map(b => b.count));
    const cols = bins
      .map(b => {
        const h = b.count ? Math.max(6, (b.count / max) * 100) : 2;
        const title = b.count
          ? `${b.value} من 10 — ${countLabel(b.count, 'مشارك', 'مشاركان', 'مشاركين')}${subject ? ' · ' + subject : ''}`
          : `${b.value} من 10 — لم يخترها أحد`;
        return (
          `<div class="dist-col${b.count ? '' : ' zero'}" title="${escapeHtml(title)}">` +
          `<span class="dist-n num">${b.count || ''}</span>` +
          `<span class="dist-bar" style="height:${h.toFixed(1)}%"></span>` +
          '</div>'
        );
      })
      .join('');
    const axis = bins.map(b => `<span class="num${b.value >= 8 ? ' hot' : ''}">${b.value}</span>`).join('');
    return `<div class="dist">${cols}</div><div class="dist-axis">${axis}</div>`;
  }

  /**
   * كتلة تقييم كاملة: عنوانها، ومتوسطها كبيراً، وسطر تفصيلها، ثم توزيعها.
   * `tone` يختار اللون: 'now' لمن يداوم في الفرز، 'ever' لمن مرّ عليه.
   */
  function ratingBlock(rating, title, tone, subject, emptyText) {
    const tag = `<span class="rb-tag ${escapeHtml(tone)}">${escapeHtml(title)}</span>`;

    if (!rating || !rating.n) {
      return (
        `<div class="rb ${escapeHtml(tone)}">` +
        `<div class="rb-head">${tag}</div>` +
        `<p class="rb-none">${escapeHtml(emptyText || 'لم يقيّمه أحد بعد')}</p>` +
        '</div>'
      );
    }

    return (
      `<div class="rb ${escapeHtml(tone)}">` +
      `<div class="rb-head">${tag}` +
      `<span class="rb-avg num">${fmt(rating.avg, 1)}</span><span class="rb-of">/ 10</span></div>` +
      '<div class="rb-meta">' +
      `<span>${escapeHtml(countLabel(rating.n, 'تقييم', 'تقييمان', 'تقييمات'))}</span>` +
      `<span>الوسيط <b class="num">${fmt(rating.med, 1)}</b></span>` +
      (rating.mode === null ? '' : `<span>الأكثر تكراراً <b class="num">${fmt(rating.mode)}</b></span>`) +
      `<span><b class="num">${rating.hard}</b> وضعوا 8 فأكثر</span>` +
      '</div>' +
      distChart(rating.dist, subject) +
      '</div>'
    );
  }

  /* ------------------------------------------------ بطاقة فرز · بطاقة مناوبة */

  /**
   * بطاقة الفرز: تقييمان مستقلّان لا رقمٌ واحد، لأنهما رأيان مختلفان —
   * من هو فيه الآن، ومن مرّ عليه يوماً. وفوقهما كم شخصاً هذا فرزه أصلاً.
   */
  function rotationCards(rows) {
    if (!rows.length) return '<div class="empty">لا بيانات بعد</div>';
    return (
      '<div class="rc-grid">' +
      rows
        .map(r => {
          const dead = !r.people && !r.current.n && !r.general.n ? ' dim' : '';
          const spellings = r.spellings && r.spellings.length
            ? r.spellings.map(sp => `${sp[0]} (${sp[1]})`).join('، ')
            : '';
          return (
            `<article class="rc${dead}">` +
            '<header class="rc-head">' +
            `<h3 class="rc-name">${escapeHtml(r.label)}</h3>` +
            /**
             * **مؤشّر الصعوبة** بجانب اسم الفرز: متوسّط كل من صوّت له —
             * من فيه الآن ومن مرّ عليه معاً. وهو الرقم الذي يُبنى عليه
             * حساب عبء كل طبيب، فمكانه أوّل ما يُرى لا آخره.
             *
             * ومعه عدد أصواته دائماً: رقمٌ بلا عدده يُقرأ حقيقةً وهو تقدير.
             */
            (r.combined && r.combined.n
              ? `<span class="rc-index" title="متوسّط ${r.combined.n} صوتاً — من يداوم فيه ومن مرّ عليه">` +
                `<b class="num">${fmt(r.combined.avg, 1)}</b>` +
                `<i>من ١٠ · <span class="num">${r.combined.n}</span> صوتاً</i></span>`
              : '') +
            `<span class="rc-people" title="${escapeHtml(spellings ? 'كما كُتبت: ' + spellings : '')}">` +
            (r.people
              ? `في الفرز <b class="num">${r.people}</b>` +
                (r.current.n ? ` · قيّمه <b class="num">${r.current.n}</b>` : '')
              : 'لم يذكره أحد فرزاً له') +
            '</span></header>' +
            ratingBlock(r.current, 'تقييم من يداوم فيه', 'now', `في ${r.label}`, 'لا أحد في هذا الفرز قيّمه بعد') +
            ratingBlock(r.general, 'تقييم من مرّ عليه', 'ever', `لِـ${r.label}`, 'لم يقيّمه من مرّ عليه بعد') +
            '</article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /** بطاقة المناوبة: تقييم واحد — من كل من داوم هذا النوع. */
  function dutyCards(rows) {
    if (!rows.length) return '<div class="empty">لا بيانات بعد</div>';
    return (
      '<div class="rc-grid duties">' +
      rows
        .map(r => {
          const dead = r.rating.n ? '' : ' dim';
          return (
            `<article class="rc${dead}">` +
            '<header class="rc-head">' +
            `<h3 class="rc-name">${escapeHtml(r.label)}</h3>` +
            `<span class="rc-people">${r.rating.n ? `قيّمها <b class="num">${r.rating.n}</b>` : 'بلا تقييم بعد'}</span>` +
            '</header>' +
            ratingBlock(r.rating, 'تقييم من داومها', 'ever', `لمناوبة ${r.label}`, 'لم يقيّمها أحد بعد') +
            '</article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /** أزرار الترتيب فوق الشبكة. `current` هو المفتاح المفعَّل الآن. */
  function sortChips(options, current, attr) {
    return (
      '<div class="chips">' +
      options
        .map(o =>
          `<button type="button" class="chip${o.key === current ? ' on' : ''}" ` +
          `data-${escapeHtml(attr)}="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>`)
        .join('') +
      '</div>'
    );
  }

  /* ------------------------------------------------------------- الوضع الليلي */

  /** مفتاح التخزين نفسه الذي يستعمله الموقع، فالاختيار يتبع الزائر بين الصفحات. */
  function restoreDarkMode() {
    if (AUH.storage.get('darkMode') !== 'true') return;
    document.body.classList.add('dark-mode');
    syncDarkIcon();
  }

  function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    AUH.storage.set('darkMode', isDark ? 'true' : 'false');
    syncDarkIcon();
  }

  function syncDarkIcon() {
    const icon = document.getElementById('darkIcon');
    if (icon) icon.className = document.body.classList.contains('dark-mode') ? 'fas fa-sun' : 'fas fa-moon';
  }

  /* ---------------------------------------------------------------- مساعدات */

  /** يملأ قائمة الأشهر ويعيد الشهر المختار (الأحدث افتراضاً). */
  function fillMonthPicker(select, monthList, includeAll) {
    if (!select) return '';
    const options = monthList.map(m => `<option value="${escapeHtml(m.month)}">${escapeHtml(monthLabel(m.month))} (${m.count})</option>`);
    if (includeAll !== false) options.push('<option value="all">كل الأشهر</option>');
    select.innerHTML = options.join('');
    const first = monthList.length ? monthList[0].month : 'all';
    select.value = first;
    return first;
  }

  AUH.views.surveyUi = {
    fmt,
    pct,
    countLabel,
    monthLabel,
    when,
    status,
    clearStatus,
    band,
    distChart,
    ratingBlock,
    rotationCards,
    dutyCards,
    sortChips,
    restoreDarkMode,
    toggleDarkMode,
    syncDarkIcon,
    fillMonthPicker
  };
})(typeof window !== 'undefined' ? window : globalThis);

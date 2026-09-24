/**
 * صفحة نتائج الاستبيان — العامة.
 *
 * ما تعرضه: عدد المشاركات، وكم طلب فرزاً صعباً وكم طلب سهلاً، ثم **تفصيلٌ
 * لكل فرز ولكل مناوبة على حدة**.
 *
 * والفرز الواحد له تقييمان لا واحد، وهما رأيان مختلفان عمداً:
 *   · **تقييم من يداوم فيه** — صعوبته كما قدّرها من هو فيه هذا الشهر.
 *   · **تقييم من مرّ عليه** — من كل من داوم فيه يوماً، لا من أهله اليوم.
 * وخلطهما في رقم واحد كان سيُخفي أكثر ممّا يُظهر.
 *
 * ما لا تعرضه، ولا يجوز أن تعرضه: **هويّة مُجيب، أو رقم هاتف، أو بريد، أو
 * نصّ حرّ كتبه مشارك.** السبب ليس تجميلاً: نصّ السبب في هذا الاستبيان يذكر
 * سفراً ومرضاً وظروفاً عائلية، وصاحبه يُعرَف منه ولو حُذف اسمه. النصوص كلّها
 * للوحة الإدارة وحدها (`survey-admin.html`).
 *
 * ┌ لماذا يظهر قسم «حصيلة الفروز» بأسماء، والقاعدة أعلاه؟ ─────────────────┐
 * │ لأن القاعدة تحمي **من قال ماذا**، لا الاسم في ذاته. وأسماء ذلك الجدول  │
 * │ من لائحة المقيمين المنشورة على الموقع أصلاً بلا حساب (انظر بوّابة      │
 * │ التبويبات في `js/views/auth-ui.js`)، ودرجاته متوسّطاتُ فرزٍ مجهولةُ    │
 * │ المصدر. فهو يقول «هذا الفرز صعب، وفلانٌ داوم فيه» — وكلا الطرفين       │
 * │ منشور سلفاً — ولا يقول قطّ «فلانٌ قيّمه كذا».                          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * إن أضفت قسماً هنا، اسأل أولاً: هل يمكن أن يُستدلّ منه على **رأي** شخص بعينه؟
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const ui = AUH.views.surveyUi;
  const stats = AUH.domain.surveyStats;
  const { escapeHtml } = AUH.text;

  const state = {
    all: [], ratingDefs: [], month: '', rotSort: 'general', dutySort: 'avg',
    residents: null, rankAll: false
  };

  const ROT_SORTS = [
    { key: 'general', label: 'الأصعب لمن مرّ عليه' },
    { key: 'current', label: 'الأصعب لمن فيه الآن' },
    { key: 'people', label: 'الأكثر أطباءً' },
    { key: 'name', label: 'أبجدياً' }
  ];
  const DUTY_SORTS = [
    { key: 'avg', label: 'الأصعب أولاً' },
    { key: 'n', label: 'الأكثر تقييماً' },
    { key: 'name', label: 'أبجدياً' }
  ];

  /* ------------------------------------------------------------------ أقسام */

  /** الطلبات تخصّ شهراً بعينه: هي طلبٌ لجدول الشهر القادم. */
  function sectionWanted(monthRows) {
    const s = stats.summary(monthRows);
    const seg = (n, cls) => `<span class="${cls}" style="flex:${Math.max(n, 0)} 0 auto"></span>`;

    return (
      ui.band([
        { label: 'المشاركات', value: ui.fmt(s.total), sub: ui.monthLabel(state.month) },
        { label: 'طلبوا فرزاً سهلاً', value: ui.fmt(s.wantedEasy), sub: `${ui.fmt(ui.pct(s.wantedEasy, Math.max(1, s.total)))}% من المشاركين` },
        { label: 'طلبوا فرزاً صعباً', value: ui.fmt(s.wantedHard), sub: `${ui.fmt(ui.pct(s.wantedHard, Math.max(1, s.total)))}% من المشاركين` },
        { label: 'لم يطلبوا شيئاً', value: ui.fmt(s.wantedNone), sub: 'تركوا السؤال' }
      ]) +
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-hand"></i> طلبات الفرز للشهر القادم</h2>' +
      `<span class="hint">${escapeHtml(ui.monthLabel(state.month))}</span></div>` +
      '<div class="split">' + seg(s.wantedEasy, 's-easy') + seg(s.wantedHard, 's-hard') + seg(s.wantedNone, 's-none') + '</div>' +
      '<div class="legend">' +
      `<span><i class="sw sw-easy"></i>سهل <b class="num">${ui.fmt(s.wantedEasy)}</b></span>` +
      `<span><i class="sw sw-hard"></i>صعب <b class="num">${ui.fmt(s.wantedHard)}</b></span>` +
      `<span><i class="sw sw-none"></i>لم يطلب <b class="num">${ui.fmt(s.wantedNone)}</b></span>` +
      '</div>' +
      '<p class="sec-note" style="margin-top:14px;margin-bottom:0">أسباب الطلبات لا تُعرض هنا — تصل إلى مسؤول الجدول وحده.</p>' +
      '</section>'
    );
  }

  /** الفروز والمناوبات تُحسب من **كل** المشاركات: تقييمٌ عام لا شهري. */
  function sectionRotations(allRows) {
    const data = stats.rotationBreakdown(allRows, state.ratingDefs);
    const sorted = stats.sortBreakdown(data.rows, state.rotSort);
    const withPeople = data.rows.filter(r => r.people).length;

    const tail = data.unmatched.length
      ? '<div class="tail"><b>فروز ذُكرت كما هي ولم تُطابِق فرزاً في قائمة الاستمارة:</b><br>' +
        data.unmatched.map(u => `<span class="raw">${escapeHtml(u.label)} · ${u.count}</span>`).join('') +
        '<br>تُترك كما كُتبت: دمج مسمّىً بآخر قرارٌ يخصّ القسم لا الصفحة.</div>'
      : '';

    return (
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-layer-group"></i> الفروز — من فيها وكيف قُيّمت</h2>' +
      `<span class="hint">كل من شارك حتى الآن · ${ui.fmt(allRows.length)} مشاركة</span></div>` +
      '<div class="toolbar" style="margin-bottom:14px">' +
      ui.sortChips(ROT_SORTS, state.rotSort, 'rotsort') +
      '<span class="col-key now" style="margin-inline-start:auto"><i></i>من يداوم فيه</span>' +
      '<span class="col-key ever"><i></i>من مرّ عليه</span>' +
      '</div>' +
      ui.rotationCards(sorted) +
      `<p class="sec-note" style="margin:14px 0 0">«فرزهم هذا الشهر» عدد من ذكر هذا الفرز فرزاً له، و«قيّموه» كم منهم أعطاه درجة صعوبة — ` +
      `${ui.fmt(withPeople)} فرزاً ذُكر حتى الآن. و«تقييم من مرّ عليه» من سؤال الاستمارة الذي يجيب عنه كل من داوم في الفرز سابقاً، ` +
      'ولو لم يكن فيه اليوم. والأعمدة تحت كل تقييم توزيعه: كم واحداً وضع 1، وكم وضع 2 … إلى 10.</p>' +
      tail +
      '</section>'
    );
  }

  function sectionDuties(allRows) {
    const rows = stats.dutyBreakdown(allRows, state.ratingDefs);
    const sorted = stats.sortBreakdown(rows, state.dutySort === 'avg' ? 'default' : state.dutySort);
    const rated = rows.filter(r => r.rating.n).length;

    return (
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-moon"></i> المناوبات — تقييم كل نوع</h2>' +
      `<span class="hint">${ui.fmt(rated)} نوعاً فيه تقييم</span></div>` +
      '<div class="toolbar" style="margin-bottom:14px">' + ui.sortChips(DUTY_SORTS, state.dutySort, 'dutysort') + '</div>' +
      ui.dutyCards(sorted) +
      '<p class="sec-note" style="margin:14px 0 0">التقييم من 10 كما تسأله الاستمارة، ومن كل من داوم هذا النوع — لا من مناوبات هذا الشهر وحده. ' +
      'والأعمدة توزيع الدرجات: كم واحداً وضع كل درجة.</p>' +
      '</section>'
    );
  }

  /**
   * حصيلة الفروز — ترتيب الأطباء.
   *
   * السؤال الذي يجيب عنه: من حمل فوق نصيبه ومن دونه؟ وجوابه ليس المجموع
   * ولا المتوسّط، لأن الخدمة ليست متساوية الطول:
   *
   * ┌ المجموع وحده ────────────────────────────────────────────────────────┐
   * │ يكافئ الأقدم لا الأتعب: من داوم أربعة أشهر سهلة يسبق من داوم شهراً   │
   * │ واحداً قاسياً، وهو عكس المطلوب تماماً.                                │
   * ├ المتوسّط وحده ───────────────────────────────────────────────────────┤
   * │ يمحو الطول أصلاً: شهرٌ واحد بصعوبة 9 يساوي أربعة أشهر بـ9، مع أن     │
   * │ الثاني حمل أربعة أضعاف ما حمله الأول.                                 │
   * ├ الفرق عن المتوقَّع ← المعتمَد ────────────────────────────────────────┤
   * │ المجموع − (عدد أشهره × متوسّط القسم لكل شهر). يعطي كل طبيب سقفاً     │
   * │ يخصّ طول خدمته، ويقيس بُعده عنه. فمن داوم شهراً متوقَّعه ~6.6 ومن    │
   * │ داوم أربعة متوقَّعه ~26.3، والفرق وحده قابلٌ للمقارنة بينهما.        │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * والأعمدة الأربعة معروضةٌ كلّها — أشهر · مجموع · متوسّط · فرق — فالترتيب
   * **يُراجَع** ولا يُصدَّق: رقمٌ واحد بلا ما بُني عليه يُقبل أو يُرفض بالثقة
   * لا بالفحص. والقائمة كاملةٌ في الـDOM دائماً وإن عُرض منها ٢٥: البحث
   * يجب أن يجد من هو في المرتبة ١٤٠، لا من هو في الصفحة الأولى فقط.
   */

  /** الكنية تُضيف معنى فقط إذا لم تكن آخر كلمة في الاسم. */
  function showAbbr(d) {
    if (!d.abbr) return false;
    const last = String(d.name || '').trim().split(/\s+/).pop() || '';
    return AUH.text.normAr(last) !== AUH.text.normAr(d.abbr);
  }

  function rankRow(d, rank, sd) {
    /* «ليس صدفة» = يتجاوز ضعف الانحراف المعياري. ودونه ضجيجُ فرزٍ لا نمط.
     * وعمود الفرق نفسه لا يُعرض هنا (حُذف بطلب المالك في 2026-09-24)، فبقي
     * أثره في الخطّ الجانبي وحده — والتفصيل الذي يُفسّر المرتبة صار في
     * لوحة الفروز التي تُفتح بنقر الصفّ. */
    const strong = sd > 0 && Math.abs(d.dev) >= 2 * sd;
    const hay = AUH.text.normAr(`${d.name || ''} ${d.abbr || ''}`);
    return (
      `<tr class="bd-row${strong ? ' bd-strong' : ''}" data-find="${escapeHtml(hay)}"` +
      ` tabindex="0" role="button" aria-expanded="false">` +
      `<td class="num">${rank}</td>` +
      `<td><i class="fas fa-chevron-left bd-caret"></i> ${escapeHtml(d.name)}` +
      `${showAbbr(d) ? ` <span class="bd-abbr">${escapeHtml(d.abbr)}</span>` : ''}</td>` +
      `<td class="num">${d.months}${d.skipped ? `<i class="bd-skip" title="${d.skipped} شهراً بفرزٍ غير مقيَّم — طُرحت من الحساب">+${d.skipped}؟</i>` : ''}</td>` +
      `<td class="num">${ui.fixed(d.sum, 1)}</td>` +
      `<td class="num">${ui.fixed(d.avg, 2)}</td>` +
      '</tr>'
    );
  }

  /**
   * صفّ التفصيل — فروز الطبيب شهراً شهراً ودرجة كلٍّ منها.
   *
   * يُبنى مع الجدول لا عند النقر: البناء المؤجَّل يحتاج إلى حفظ نتيجة
   * `burden()` في الحالة ثم مطابقة الصفّ بفهرسه، وهو ربطٌ ينكسر مع أي
   * إعادة ترتيب. والحجم هنا لا يُبرّره: خمسة أسطر لكل طبيب.
   *
   * والشهر الذي لا تقييم لفرزه يُعرض **مذكوراً بلا درجة** لا محذوفاً: أن
   * ترى أنك داومت «غير محدد» في أيلول هو نصف الجواب عن مرتبتك.
   */
  function detailRow(d) {
    const months = AUH.constants.MONTH_NAMES;
    const items = (d.detail || []).map(x => {
      const label = months[x.month - 1] || `شهر ${x.month}`;
      const score = x.value === null
        ? '<i class="bd-none">لا تقييم له</i>'
        : `<b class="num">${ui.fixed(x.value, 1)}</b>`;
      return `<span class="bd-hist-item${x.value === null ? ' is-none' : ''}">` +
        `<em>${escapeHtml(label)}</em>${escapeHtml(x.text)}${score}</span>`;
    }).join('');

    return (
      '<tr class="bd-detail" hidden><td colspan="5">' +
      `<div class="bd-hist">${items || '<span class="bd-hist-item">لا فرزَ مسجَّلاً.</span>'}</div>` +
      '</td></tr>'
    );
  }

  function sectionRank(allRows) {
    const head =
      '<div class="sec-head"><h2><i class="fas fa-ranking-star"></i> حصيلة الفروز — ترتيب الأطباء</h2>';

    /* فشل قراءة اللائحة **لا يُسقط الصفحة**: بقيّة الأقسام من الاستبيان
     * وحده وتبقى صحيحة، ويظهر هذا القسم برسالة تقول لماذا غاب — لا فارغاً
     * ولا بأرقام مخمَّنة. */
    if (!state.residents) {
      return '<section class="card">' + head + '</div>' +
        '<div class="empty">تعذّرت قراءة لائحة المقيمين، فلا يمكن حساب الحصيلة. ' +
        'وبقيّة أقسام الصفحة صحيحة.</div></section>';
    }

    const rot = stats.rotationBreakdown(allRows, state.ratingDefs);
    const items = (state.ratingDefs || []).filter(d => d.group === 'rotations');
    const b = stats.burden(state.residents, rot.rows, items);

    if (!b.doctors.length) {
      return '<section class="card">' + head + '</div>' +
        '<div class="empty">لا فرزَ مقيَّماً بعد في لائحة المقيمين.</div></section>';
    }

    const tail = b.unrated.length
      ? '<div class="tail"><b>أشهرٌ بفرزٍ لا تقييم له — طُرحت من الحساب ولم تُحسب صفراً:</b><br>' +
        b.unrated.map(u => `<span class="raw">${escapeHtml(u.label)} · ${u.count}</span>`).join('') +
        '</div>'
      : '';

    return (
      '<section class="card">' + head +
      `<span class="hint">${ui.fmt(b.doctors.length)} طبيباً · متوسّط القسم ` +
      `<b class="num">${ui.fixed(b.perMonth, 2)}</b> لكل شهر</span></div>` +
      '<p class="bd-note">الترتيب بما حمله كلٌّ <b>مقارنةً بعدد أشهره</b>، لا بالمجموع ' +
      'ولا بالمتوسّط: المجموع يُقدّم من طالت خدمته، والمتوسّط يُسوّي بين شهرٍ ' +
      `قاسٍ وأربعةٍ مثله. ومتوسّط القسم <b class="num">${ui.fixed(b.perMonth, 2)}</b> ` +
      'لكل شهر خدمة، ومن فوقه حمل أثقل من نصيبه. ' +
      '<b>واضغط على أي اسم</b> لترى فروزه السابقة ودرجة كلٍّ منها. ' +
      'ودرجة كل فرز متوسّط تقييمات من فيه ومن مرّ عليه — لا يُعرف من قيّمه.</p>' +
      '<div class="bd-find"><i class="fas fa-magnifying-glass"></i>' +
      '<input type="search" id="rankFind" autocomplete="off" placeholder="ابحث عن اسمك…" ' +
      'aria-label="ابحث عن طبيب في جدول الحصيلة"></div>' +
      '<div class="bd-wrap"><table class="bd">' +
      '<thead><tr><th>#</th><th>الطبيب</th>' +
      '<th>أشهر</th><th>المجموع</th><th>المتوسّط</th></tr></thead>' +
      `<tbody id="rankBody">${b.doctors.map((d, i) => rankRow(d, i + 1, b.sd) + detailRow(d)).join('')}</tbody>` +
      '</table></div>' +
      '<p class="bd-hint"><i class="fas fa-arrows-left-right"></i> مرّر الجدول أفقياً لرؤية المجموع والمتوسّط.</p>' +
      `<div class="bd-more"><button type="button" id="rankMore" class="chip"></button>` +
      '<span class="bd-count" id="rankCount"></span></div>' +
      tail +
      '</section>'
    );
  }

  /**
   * العرض والبحث يجريان على الـDOM مباشرةً بلا إعادة رسم: إعادة بناء الصفحة
   * عند كل حرف تُفقِد حقلَ البحث تركيزه ومؤشّرَه، فيكتب المستخدم حرفاً واحداً
   * ثم يجد لوحة المفاتيح قد أُغلقت على الهاتف.
   */
  function applyRankView() {
    const body = document.getElementById('rankBody');
    const btn = document.getElementById('rankMore');
    const label = document.getElementById('rankCount');
    if (!body) return;

    const input = document.getElementById('rankFind');
    const q = AUH.text.normAr(String(input ? input.value : '').trim());
    /* كل طبيب صفّان: صفُّه وصفُّ تفصيله. والتفصيل تابعٌ لا يُعدّ ولا يُصفّى
     * وحده — لو عومل صفّاً مستقلاً لحُسب في العدّ ولظهر بلا صاحبه. */
    const rows = [...body.children].filter(tr => tr.classList.contains('bd-row'));
    let hits = 0;

    for (const tr of rows) {
      const hit = !q || (tr.dataset.find || '').includes(q);
      if (hit) hits++;
      /* بحثٌ جارٍ ⇒ تُعرض كل المطابقات أياً كانت مرتبتها. ولولا ذلك لما
       * وجد من هو في المرتبة ١٤٠ نفسَه إلا بعد أن يضغط «أظهر الكل». */
      const visible = hit && (q || state.rankAll || hits <= 25);
      tr.hidden = !visible;
      const det = tr.nextElementSibling;
      if (det && det.classList.contains('bd-detail')) {
        det.hidden = !visible || tr.getAttribute('aria-expanded') !== 'true';
      }
    }

    if (btn) {
      btn.hidden = !!q || rows.length <= 25;
      btn.textContent = state.rankAll
        ? 'أظهر أثقل ٢٥ فقط'
        : `أظهر الكل (${ui.fmt(rows.length)})`;
    }
    if (label) {
      label.textContent = q
        ? (hits ? `${ui.fmt(hits)} من ${ui.fmt(rows.length)}` : 'لا اسم يطابق هذا البحث')
        : '';
    }
  }

  /** فتح صفّ أو إغلاقه. مفوَّضٌ على الجسم، فلا ٢٠٨ مستمعاً ولا ربطَ بعد كل رسم. */
  function toggleRank(tr) {
    if (!tr || !tr.classList.contains('bd-row')) return;
    const open = tr.getAttribute('aria-expanded') === 'true';
    tr.setAttribute('aria-expanded', open ? 'false' : 'true');
    const det = tr.nextElementSibling;
    if (det && det.classList.contains('bd-detail')) det.hidden = open;
  }

  /* -------------------------------------------------------------------- رسم */

  function render() {
    const host = document.getElementById('content');
    const all = state.all;
    const monthRows = stats.inMonth(all, state.month);

    if (!all.length) {
      host.innerHTML = '<section class="card"><div class="empty">لا توجد مشاركات بعد.</div></section>';
      return;
    }

    host.innerHTML =
      sectionWanted(monthRows) +
      sectionRotations(all) +
      sectionRank(all) +
      sectionDuties(all);

    wire();
    applyRankView();

    const last = all.map(r => r.ts).filter(Boolean).sort().pop();
    const el = document.getElementById('lastAnswer');
    if (el) el.textContent = last ? `آخر مشاركة: ${ui.when(last)}` : 'لا مشاركات بعد';
  }

  /** المحتوى يُعاد بناؤه كاملاً عند كل ترتيب، فتُربط أزراره بعد كل رسم. */
  function wire() {
    document.querySelectorAll('[data-rotsort]').forEach(btn =>
      btn.addEventListener('click', () => { state.rotSort = btn.dataset.rotsort; render(); }));
    document.querySelectorAll('[data-dutysort]').forEach(btn =>
      btn.addEventListener('click', () => { state.dutySort = btn.dataset.dutysort; render(); }));

    const find = document.getElementById('rankFind');
    if (find) find.addEventListener('input', applyRankView);
    const more = document.getElementById('rankMore');
    if (more) more.addEventListener('click', () => { state.rankAll = !state.rankAll; applyRankView(); });

    const rankBody = document.getElementById('rankBody');
    if (rankBody) {
      rankBody.addEventListener('click', e => toggleRank(e.target.closest('tr.bd-row')));
      /* الصفّ `role="button"`، ومن تعهّد بذلك لزمه المفتاحان اللذان يفتحان زرّاً.
       * والمسافة تُمنع من تمرير الصفحة تحت الإصبع. */
      rankBody.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const tr = e.target.closest('tr.bd-row');
        if (!tr) return;
        e.preventDefault();
        toggleRank(tr);
      });
    }
  }

  /* ------------------------------------------------------------------ تحميل */

  async function load(isRefresh) {
    const statusEl = document.getElementById('status');
    const host = document.getElementById('content');
    if (!isRefresh) host.innerHTML = '<div class="skeleton"><i class="fas fa-circle-notch"></i>جاري قراءة الردود من الشيت…</div>';

    const result = await AUH.data.survey.load();
    if (!result.responses) {
      host.innerHTML = '';
      ui.status(statusEl, 'error', 'تعذّرت قراءة نتائج الاستبيان.',
        'تأكّد من الاتصال بالإنترنت، ومن أن شيت الاستبيان ما زال مشارَكاً للقراءة العامة. الصفحة لا تخمّن الأرقام حين تعجز عن قراءتها.');
      return;
    }

    state.all = result.responses;
    state.ratingDefs = result.ratingDefs;

    /**
     * لائحة المقيمين — لحساب حصيلة كل طبيب. تُقرأ مرّةً وتُحفظ.
     *
     * ❗ فشلها **لا يُسقط الصفحة**: بقيّة الأقسام تُقرأ من الاستبيان وحده
     *   وتبقى صحيحة، ويظهر قسم الحصيلة برسالة تقول لماذا غاب — لا فارغاً
     *   ولا بأرقام مخمَّنة.
     */
    if (!state.residents) {
      try {
        const table = await AUH.data.gviz.fetchSource(AUH.data.schema.residents);
        const parsed = table ? AUH.parse.residents(table) : null;
        state.residents = parsed && parsed.residents && parsed.residents.length
          ? parsed.residents
          : null;
      } catch (err) {
        AUH.log.warn('survey-public', 'تعذّرت قراءة لائحة المقيمين: ' + err.message);
        state.residents = null;
      }
    }

    if (result.issues.length) {
      ui.status(statusEl, 'warn', 'تبدّل سؤال في الاستمارة.',
        `لم يُعثر على ${result.issues.length} عمود بالاسم المتوقَّع، فقد يكون قسمٌ ناقصاً أدناه. الأعمدة: ` +
        result.issues.map(i => i.field).join('، '));
    } else {
      ui.clearStatus(statusEl);
    }

    const months = stats.months(state.all);
    const picker = document.getElementById('monthPicker');
    if (!state.month) state.month = ui.fillMonthPicker(picker, months);
    else picker.value = state.month;

    render();
  }

  function init() {
    ui.restoreDarkMode();
    document.getElementById('darkBtn').addEventListener('click', ui.toggleDarkMode);
    document.getElementById('refreshBtn').addEventListener('click', () => load(true));
    document.getElementById('monthPicker').addEventListener('change', e => {
      state.month = e.target.value;
      render();
    });
    load(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

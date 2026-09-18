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
 * ما لا تعرضه، ولا يجوز أن تعرضه: **أي اسم، أو رقم هاتف، أو بريد، أو نصّ حرّ
 * كتبه مشارك.** السبب ليس تجميلاً: نصّ السبب في هذا الاستبيان يذكر سفراً
 * ومرضاً وظروفاً عائلية، وصاحبه يُعرَف منه ولو حُذف اسمه. النصوص كلّها
 * للوحة الإدارة وحدها (`survey-admin.html`).
 *
 * إن أضفت قسماً هنا، اسأل أولاً: هل يمكن أن يُستدلّ منه على شخص بعينه؟
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const ui = AUH.views.surveyUi;
  const stats = AUH.domain.surveyStats;
  const { escapeHtml } = AUH.text;

  const state = { all: [], ratingDefs: [], month: '', rotSort: 'general', dutySort: 'avg' };

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
      sectionDuties(all);

    wire();

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

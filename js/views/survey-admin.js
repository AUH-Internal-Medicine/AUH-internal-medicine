/**
 * لوحة الاستبيان — الخاصة بمسؤول الجدول.
 *
 * هذه هي الصفحة التي تُظهر **كل شيء**: الأسماء، وأرقام الهواتف، ونصوص الطلبات
 * والأسباب كما كُتبت. صُدِّرت الطلبات إلى أعلى الصفحة عمداً، لأنها الشيء الذي
 * يُفتح الاستبيان من أجله؛ أما المتوسطات فتأتي بعدها.
 *
 * عن «رمز الدخول»: هو سترٌ لا أمان. الصفحة ساكنة والبيانات تُقرأ في متصفّح
 * الزائر، فمن يفتح الشيفرة يجد الرمز. الأمان الحقيقي الوحيد هنا أن تبقى هذه
 * الصفحة غير منشورة (تُفتح من جهازك)، أو أن يُقفَل الشيت نفسه ويُنقل إلى خادم
 * له تسجيل دخول. الرمز يمنع الفضول العابر، لا أكثر — ولا يُقال غير ذلك.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const ui = AUH.views.surveyUi;
  const stats = AUH.domain.surveyStats;
  const { escapeHtml, smartSearch } = AUH.text;

  const UNLOCK_KEY = 'surveyAdminUnlocked';
  const state = {
    all: [], ratingDefs: [], month: '', filter: 'all', query: '',
    rotSort: 'general', dutySort: 'avg',
    /* لائحة المقيمين — تُقرأ من الشيت الرئيسي لا من الاستبيان: الاستبيان
     * يعرف رأي الشهر، واللائحة تعرف تاريخ الفروز شهراً بشهر. و`null` تعني
     * «لم تُقرأ» لا «فارغة»، فيُعرض السبب بدل صفرٍ كاذب. */
    residents: null,
    burdenAll: false
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

  /* -------------------------------------------------------------- بوّابة الرمز */

  function expectedCode() {
    return String(global.SURVEY_ADMIN_CODE || '').trim();
  }

  function isUnlocked() {
    const code = expectedCode();
    if (!code) return true;
    return AUH.storage.get(UNLOCK_KEY) === code;
  }

  function unlock() {
    const input = document.getElementById('gateInput');
    const err = document.getElementById('gateErr');
    if (input.value.trim() === expectedCode()) {
      AUH.storage.set(UNLOCK_KEY, expectedCode());
      showPage();
    } else {
      err.textContent = 'رمز غير صحيح.';
      input.select();
    }
  }

  function showPage() {
    document.getElementById('gate').hidden = true;
    document.getElementById('page').hidden = false;
    load(false);
  }

  /* ----------------------------------------------------------------- الطلبات */

  function field(cls, icon, label, value) {
    if (!value) return '';
    return (
      `<div class="field ${cls}"><div class="field-l"><i class="fas ${icon}"></i>${escapeHtml(label)}</div>` +
      `<div class="field-v">${escapeHtml(value)}</div></div>`
    );
  }

  function requestCard(r) {
    const wanted = AUH.text.normAr(r.wanted);
    const tag = wanted.includes('صعب')
      ? '<span class="tag hard"><i class="fas fa-arrow-trend-up"></i> يطلب فرزاً صعباً</span>'
      : wanted.includes('سهل')
        ? '<span class="tag easy"><i class="fas fa-arrow-trend-down"></i> يطلب فرزاً سهلاً</span>'
        : '';

    const phone = r.phone
      ? `<span class="req-phone"><a href="tel:${escapeHtml(r.phone.replace(/\s/g, ''))}">${escapeHtml(r.phone)}</a>` +
        `<button type="button" data-copy="${escapeHtml(r.phone)}" title="نسخ الرقم"><i class="fas fa-copy"></i></button></span>`
      : '';

    return (
      '<article class="req">' +
      '<div class="req-head">' +
      `<span class="req-name">${escapeHtml(r.name || 'بلا اسم')}</span>` +
      (r.abbr ? `<span class="req-abbr">(${escapeHtml(r.abbr)})</span>` : '') +
      tag +
      `<span class="req-when">${escapeHtml(ui.when(r.ts))}</span>` +
      phone +
      '</div>' +
      (r.rotation ? field('', 'fa-hospital', 'فرزه هذا الشهر', r.rotation + (typeof r.difficulty === 'number' ? ` — صعوبته ${r.difficulty}/10` : '')) : '') +
      field('pick', 'fa-hand-point-up', 'سبب طلب الفرز', r.wantedReason) +
      field('days', 'fa-calendar-day', 'أيام مطلوبة', r.daysRequested) +
      field('days', 'fa-comment-dots', 'سبب طلب الأيام', r.daysReason) +
      field('prob', 'fa-triangle-exclamation', 'مشاكل جدول الشهر الماضي ومقترحه', r.scheduleProblem) +
      field('', 'fa-envelope-open-text', 'طلبات أخرى', r.otherRequests) +
      '</article>'
    );
  }

  function matchesFilter(r, filter) {
    if (filter === 'rotation') return !!(r.wanted || r.wantedReason);
    if (filter === 'days') return !!(r.daysRequested || r.daysReason);
    if (filter === 'problems') return !!r.scheduleProblem;
    if (filter === 'other') return !!r.otherRequests;
    return true;
  }

  function matchesQuery(r, query) {
    if (!query) return true;
    const haystack = [r.name, r.abbr, r.rotation, r.wanted, r.wantedReason, r.daysRequested,
      r.daysReason, r.scheduleProblem, r.otherRequests, r.phone].join(' ');
    return smartSearch(haystack, query);
  }

  function sectionRequests(rows) {
    const req = stats.requests(rows);
    const visible = req.rows.filter(r => matchesFilter(r, state.filter) && matchesQuery(r, state.query));

    const chip = (key, label, n) =>
      `<button type="button" class="chip${state.filter === key ? ' on' : ''}" data-filter="${key}">` +
      `${escapeHtml(label)} <span class="n num">${n}</span></button>`;

    return (
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-inbox"></i> الطلبات والتوصيات</h2>' +
      `<span class="hint">${req.rows.length} مشاركة تحمل طلباً أو ملاحظة</span></div>` +
      '<div class="toolbar">' +
      '<div class="search"><i class="fas fa-magnifying-glass"></i>' +
      `<input id="reqSearch" type="search" placeholder="ابحث باسم أو بكلمة داخل الطلب…" value="${escapeHtml(state.query)}"></div>` +
      '<div class="chips">' +
      chip('all', 'الكل', req.rows.length) +
      chip('rotation', 'طلب فرز', req.counts.rotation) +
      chip('days', 'أيام مطلوبة', req.counts.days) +
      chip('problems', 'مشاكل الجدول', req.counts.problems) +
      chip('other', 'طلبات أخرى', req.counts.other) +
      '</div></div>' +
      (visible.length
        ? visible.map(requestCard).join('')
        : '<div class="empty">لا طلبات تطابق البحث.</div>') +
      '</section>'
    );
  }

  /* ------------------------------------------------------------ الجدول الكامل */

  function sectionTable(rows) {
    const head = ['التاريخ', 'الاسم', 'الاختصار', 'الهاتف', 'فرز الشهر', 'الصعوبة', 'تفريغ', 'عددها', 'الفرز المطلوب', 'سبب الطلب', 'أيام مطلوبة']
      .map(h => `<th>${escapeHtml(h)}</th>`).join('');

    const body = rows
      .map(r =>
        '<tr>' +
        `<td class="num">${escapeHtml(ui.when(r.ts))}</td>` +
        `<td>${escapeHtml(r.name)}</td>` +
        `<td>${escapeHtml(r.abbr)}</td>` +
        `<td class="num">${escapeHtml(r.phone)}</td>` +
        `<td>${escapeHtml(r.rotation)}</td>` +
        `<td class="n">${r.difficulty === null ? '—' : escapeHtml(String(r.difficulty))}</td>` +
        `<td>${escapeHtml(r.hadRelief)}</td>` +
        `<td class="n">${r.reliefCount === null ? '—' : escapeHtml(String(r.reliefCount))}</td>` +
        `<td>${escapeHtml(r.wanted)}</td>` +
        `<td class="wrap">${escapeHtml(r.wantedReason)}</td>` +
        `<td class="wrap">${escapeHtml(r.daysRequested)}</td>` +
        '</tr>')
      .join('');

    return (
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-table-list"></i> كل الردود</h2>' +
      '<button type="button" class="btn" id="csvBtn"><i class="fas fa-file-csv"></i> تنزيل CSV</button></div>' +
      `<div class="table-scroll"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
      '</section>'
    );
  }

  /* ------------------------------------------- التفصيل: كل فرز وكل مناوبة */

  /**
   * الجدولان نفساهما اللذان في الصفحة العامة، ومن **كل** المشاركات لا من شهر:
   * التقييم العام لفرزٍ أو مناوبة لا معنى له بشهر واحد. ما يخصّ الشهر هو
   * الطلبات، وهي أعلاه.
   */
  function sectionBreakdowns(allRows) {
    const rot = stats.rotationBreakdown(allRows, state.ratingDefs);
    const duties = stats.dutyBreakdown(allRows, state.ratingDefs);

    const tail = rot.unmatched.length
      ? '<div class="tail"><b>فروز ذُكرت كما هي ولم تُطابِق فرزاً في قائمة الاستمارة:</b><br>' +
        rot.unmatched.map(u => `<span class="raw">${escapeHtml(u.label)} · ${u.count}</span>`).join('') +
        '</div>'
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
      ui.rotationCards(stats.sortBreakdown(rot.rows, state.rotSort)) +
      tail +
      '</section>' +
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-moon"></i> المناوبات — تقييم كل نوع</h2>' +
      `<span class="hint">${ui.fmt(duties.filter(d => d.rating.n).length)} نوعاً فيه تقييم</span></div>` +
      '<div class="toolbar" style="margin-bottom:14px">' +
      ui.sortChips(DUTY_SORTS, state.dutySort, 'dutysort') + '</div>' +
      ui.dutyCards(stats.sortBreakdown(duties, state.dutySort === 'avg' ? 'default' : state.dutySort)) +
      '</section>'
    );
  }

  /* ------------------------------------------------------------- عبء الأطباء */

  /**
   * ترتيب الأطباء بعبء فروزهم المتراكم.
   *
   * ┌ المشكلة التي يحلّها ───────────────────────────────────────────────────┐
   * │ ليس الجميع داوم العدد نفسه من الأشهر. فمن داوم شهراً واحداً في أصعب    │
   * │ فرز مجموعه 8.6، ومن داوم أربعةً متوسّطةً مجموعه 26 — والثاني ليس       │
   * │ أشقى، بل أطولَ خدمةً. والمجموع وحده يظلم الأوّل، والمتوسّط وحده يظلم   │
   * │ الثاني.                                                                │
   * │                                                                        │
   * │ فالترتيب بـ**الفرق عن المتوقَّع**:                                      │
   * │     الفرق = المجموع − (أشهره × متوسّط القسم لكل شهر)                    │
   * │ موجبٌ = حمل فوق نصيبه · سالبٌ = دونه. ويُقارَن بين مختلفي الأشهر لأنه   │
   * │ يطرح أثر طول الخدمة أصلاً.                                             │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * والأعمدة الأربعة معروضةٌ كلّها — أشهر · مجموع · متوسّط · فرق — فالترتيب
   * **يُراجَع** ولا يُصدَّق: رقمٌ واحد بلا ما بُني عليه يُقبل أو يُرفض بالثقة
   * لا بالفحص.
   */
  /** الكنية تُضيف معنى فقط إذا لم تكن آخر كلمة في الاسم. */
  function showAbbr(d) {
    if (!d.abbr) return false;
    const last = String(d.name || '').trim().split(/\s+/).pop() || '';
    return AUH.text.normAr(last) !== AUH.text.normAr(d.abbr);
  }

  function burdenRow(d, rank, sd) {
    /* «ليس صدفة» = يتجاوز ضعف الانحراف المعياري. ودونه ضجيجُ فرزٍ لا نمط. */
    const strong = sd > 0 && Math.abs(d.dev) >= 2 * sd;
    const tone = d.dev > 0 ? 'hard' : 'easy';
    const sign = d.dev > 0 ? '+' : '';
    return (
      `<tr class="${strong ? 'bd-strong ' : ''}bd-${tone}">` +
      `<td class="num">${rank}</td>` +
      /* الكنية تُعرض **إن أضافت شيئاً**: هي آخر كلمة في الاسم عند أكثر
       * المقيمين، فعرضها دائماً يُنتج «أحمد عبد العزيز الصفوك الصفوك». */
      `<td>${escapeHtml(d.name)}${showAbbr(d) ? ` <span class="bd-abbr">${escapeHtml(d.abbr)}</span>` : ''}</td>` +
      `<td class="num bd-dev">${sign}${ui.fixed(d.dev, 1)}</td>` +
      `<td class="num">${d.months}${d.skipped ? `<i class="bd-skip" title="${d.skipped} شهراً بفرزٍ غير مقيَّم — طُرحت من الحساب">+${d.skipped}؟</i>` : ''}</td>` +
      `<td class="num">${ui.fixed(d.sum, 1)}</td>` +
      `<td class="num">${ui.fixed(d.avg, 2)}</td>` +
      '</tr>'
    );
  }

  function sectionBurden(allRows) {
    if (!state.residents) {
      return (
        '<section class="card">' +
        '<div class="sec-head"><h2><i class="fas fa-scale-unbalanced"></i> عبء الفروز — ترتيب الأطباء</h2></div>' +
        '<div class="empty">تعذّرت قراءة لائحة المقيمين، فلا يمكن حساب العبء. ' +
        'وبقيّة أقسام اللوحة صحيحة.</div></section>'
      );
    }

    const rot = stats.rotationBreakdown(allRows, state.ratingDefs);
    const items = (state.ratingDefs || []).filter(d => d.group === 'rotations');
    const b = stats.burden(state.residents, rot.rows, items);

    if (!b.doctors.length) {
      return (
        '<section class="card">' +
        '<div class="sec-head"><h2><i class="fas fa-scale-unbalanced"></i> عبء الفروز — ترتيب الأطباء</h2></div>' +
        '<div class="empty">لا فرزَ مقيَّماً بعد في لائحة المقيمين.</div></section>'
      );
    }

    const shown = state.burdenAll ? b.doctors : b.doctors.slice(0, 25);
    const tail = b.unrated.length
      ? '<div class="tail"><b>أشهرٌ بفرزٍ لا تقييم له — طُرحت من الحساب ولم تُحسب صفراً:</b><br>' +
        b.unrated.map(u => `<span class="raw">${escapeHtml(u.label)} · ${u.count}</span>`).join('') +
        '</div>'
      : '';

    return (
      '<section class="card">' +
      '<div class="sec-head"><h2><i class="fas fa-scale-unbalanced"></i> عبء الفروز — ترتيب الأطباء</h2>' +
      `<span class="hint">${ui.fmt(b.doctors.length)} طبيباً · متوسّط القسم ` +
      `<b class="num">${ui.fixed(b.perMonth, 2)}</b> لكل شهر</span></div>` +
      '<p class="bd-note">الترتيب بـ<b>الفرق عن المتوقَّع</b> = المجموع − (عدد أشهره × متوسّط القسم). ' +
      'موجبٌ يعني أنه حمل فوق نصيبه بحسب طول خدمته، وسالبٌ دونه — ' +
      `وهو وحده يُقارَن بين من داوم شهراً ومن داوم أربعة. والفرق الذي يتجاوز ` +
      `<b class="num">${ui.fixed(2 * b.sd, 1)}</b> ليس صدفةَ فرزٍ.</p>` +
      '<div class="bd-wrap"><table class="bd">' +
      '<thead><tr><th>#</th><th>الطبيب</th><th>الفرق عن المتوقَّع</th>' +
      '<th>أشهر</th><th>المجموع</th><th>المتوسّط</th></tr></thead>' +
      '<tbody>' +
      shown.map((d, i) => burdenRow(d, i + 1, b.sd)).join('') +
      '</tbody></table></div>' +
      '<p class="bd-hint"><i class="fas fa-arrows-left-right"></i> مرّر الجدول أفقياً لرؤية المجموع والمتوسّط.</p>' +
      (b.doctors.length > 25
        ? `<div class="bd-more"><button type="button" id="burdenMore" class="chip">` +
          (state.burdenAll ? 'أظهر أثقل ٢٥ فقط' : `أظهر الكل (${ui.fmt(b.doctors.length)})`) +
          '</button></div>'
        : '') +
      tail +
      '</section>'
    );
  }

  /* -------------------------------------------------------------------- رسم */

  function render() {
    const rows = stats.inMonth(state.all, state.month);
    const s = stats.summary(rows);
    const req = stats.requests(rows);
    const host = document.getElementById('content');

    if (!rows.length) {
      host.innerHTML = '<section class="card"><div class="empty">لا توجد مشاركات في هذا الشهر.</div></section>';
      return;
    }

    host.innerHTML =
      ui.band([
        { label: 'مشاركات الشهر', value: ui.fmt(s.total), sub: ui.monthLabel(state.month) },
        { label: 'طلبات وتوصيات', value: ui.fmt(req.rows.length), sub: 'مشاركة تحتاج قراءة' },
        { label: 'طلبوا سهلاً', value: ui.fmt(s.wantedEasy), sub: 'للشهر القادم' },
        { label: 'طلبوا صعباً', value: ui.fmt(s.wantedHard), sub: 'للشهر القادم' }
      ]) +
      sectionRequests(rows) +
      sectionTable(rows) +
      sectionBurden(state.all) +
      sectionBreakdowns(state.all);

    wireContent(rows);
  }

  /* أحداث ما رُسم للتو — المحتوى يُعاد بناؤه كاملاً، فتُربط بعد كل رسم. */
  function wireContent(rows) {
    const moreBtn = document.getElementById('burdenMore');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => { state.burdenAll = !state.burdenAll; render(); });
    }

    const search = document.getElementById('reqSearch');
    if (search) {
      search.addEventListener('input', e => {
        state.query = e.target.value;
        render();
        const again = document.getElementById('reqSearch');
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      });
    }

    document.querySelectorAll('[data-filter]').forEach(btn =>
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        render();
      })
    );

    document.querySelectorAll('[data-copy]').forEach(btn =>
      btn.addEventListener('click', () => {
        const value = btn.dataset.copy;
        if (global.navigator && navigator.clipboard) navigator.clipboard.writeText(value);
        btn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1400);
      })
    );

    document.querySelectorAll('[data-rotsort]').forEach(btn =>
      btn.addEventListener('click', () => { state.rotSort = btn.dataset.rotsort; render(); }));
    document.querySelectorAll('[data-dutysort]').forEach(btn =>
      btn.addEventListener('click', () => { state.dutySort = btn.dataset.dutysort; render(); }));

    const csv = document.getElementById('csvBtn');
    if (csv) csv.addEventListener('click', () => downloadCsv(rows));
  }

  /** تصدير ما يُعرض الآن. الـBOM ضروري وإلا فتح Excel العربية حروفاً مشوّهة. */
  function downloadCsv(rows) {
    const head = ['التاريخ', 'الاسم', 'الاختصار', 'الهاتف', 'البريد', 'فرز الشهر', 'الصعوبة', 'تفريغ',
      'عدد التفريغات', 'الفرز المطلوب', 'سبب الطلب', 'أيام مطلوبة', 'سبب الأيام', 'مشاكل الجدول', 'طلبات أخرى'];
    const cell = v => `"${String(v === null || v === undefined ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')];
    for (const r of rows) {
      lines.push([r.ts, r.name, r.abbr, r.phone, r.email, r.rotation, r.difficulty, r.hadRelief,
        r.reliefCount, r.wanted, r.wantedReason, r.daysRequested, r.daysReason, r.scheduleProblem,
        r.otherRequests].map(cell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `استبيان-${state.month || 'الكل'}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ------------------------------------------------------------------ تحميل */

  async function load(isRefresh) {
    const statusEl = document.getElementById('status');
    const host = document.getElementById('content');
    if (!isRefresh) host.innerHTML = '<div class="skeleton"><i class="fas fa-circle-notch"></i>جاري قراءة الردود…</div>';

    const result = await AUH.data.survey.load();
    if (!result.responses) {
      host.innerHTML = '';
      ui.status(statusEl, 'error', 'تعذّرت قراءة الردود.',
        'تحقّق من الاتصال ومن أن شيت الاستبيان ما زال مشارَكاً للقراءة. لا تُعرض أرقام مخمَّنة بدلاً عنها.');
      return;
    }

    state.all = result.responses;
    state.ratingDefs = result.ratingDefs;

    /**
     * لائحة المقيمين — لحساب عبء كل طبيب.
     *
     * ❗ فشلها **لا يُسقط اللوحة**: بقيّة الأقسام تُقرأ من الاستبيان وحده
     *   وتبقى صحيحة، ويظهر قسم العبء برسالة تقول لماذا غاب — لا فارغاً
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
        AUH.log.warn('survey-admin', 'تعذّرت قراءة لائحة المقيمين: ' + err.message);
        state.residents = null;
      }
    }

    if (result.issues.length) {
      ui.status(statusEl, 'warn', 'أعمدة لم يُعثر عليها بالاسم المتوقَّع.',
        `قد يكون سؤالٌ في الاستمارة قد أُعيدت صياغته: ${result.issues.map(i => i.field).join('، ')}. ` +
        'صحّح العناوين في `js/data/survey-responses.js` أو أعد السؤال إلى صيغته السابقة.');
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
    /* نموذج حقيقي لا زرّ وحده: فـ«Enter» في حقل الرمز يجب أن يدخل، وهو ما
       يفعله كل من يكتب رمزاً — والزرّ وحده كان يتجاهله. */
    document.getElementById('gateForm').addEventListener('submit', e => {
      e.preventDefault();
      unlock();
    });
    /* وبعض المتصفّحات لا ترسل النموذج بـ«Enter» حين يكون فيه حقل واحد. */
    document.getElementById('gateInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); unlock(); }
    });

    if (isUnlocked()) showPage();
    else document.getElementById('gateInput').focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * «البحث عن بديل» (swap-find.html) — واجهةٌ تساعد على العثور على بديلٍ
 * لمناوبةٍ قبل طلب التبديل/الشيل الرسمي، ولا تُلغيه. يُعلن مقيمٌ عن مناوبته، يَعرض آخرون المساعدة،
 * وعند قبول عرضٍ واحد يُؤخَذ صاحبُ الإعلان تلقائياً إلى `swap.html` مُعبَّأً
 * سلفاً إلا مربّع التأكيد الأخير.
 *
 * يُعيد استخدام `js/domain/swap-rules.js` حرفياً لكل فحص ستريبٍ/تعارض — **لا
 * تكرار لذاك المنطق هنا إطلاقاً**، تماماً كما يفعل `js/swap.js`. ما هو خاصٌّ
 * بهذه الصفحة فقط: رسم الرزنامات والبطاقات (DOM)، وتدفّق التبويبات الأربعة.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, escapeHtml } = AUH.text;
  const { getDayName } = AUH.dates;
  const swapRules = AUH.domain.swapRules;
  const { sameDuty, afterExchange, evaluate, dutyGroup, isDoorDuty, isMale, genderBlocked,
    coverFeasible, swapFeasible, feasibleSwaps, dutiesAfter } = swapRulesWrappers();

  const $ = id => document.getElementById(id);
  const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب',
    'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const DOW = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const fmt = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const minShiftDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const AUTOFILL_KEY = 'auh_swap_find_autofill';

  /* -------------------------------------------------------------- app state */
  const S = {
    roster: [], duties: new Map(), months: [], allCategories: [],
    me: null,
    open: [], mine: [], myOffers: [],
    showAll: false,
    tab: 'browse',
    // معالج «تقديم إعلان» (يُعاد تدويره للتعديل أيضاً):
    sub: { kind: 'شيل', shift: null, days: 'ALL', cats: 'ALL', urgent: false, editId: null, m: 0 },
    // معالج «اختيار مناوبتي للعرض» المشترك بين المعاينة وتقديم العرض:
    pick: { requestId: null, mode: null, m: 0 } // mode: 'offer' | 'preview'
  };
  // الشهر الذي يفتح عليه معالج «إعلان جديد» افتراضياً — يُحسَب مرّةً في
  // boot() (أول شهرٍ ≥ شهر اليوم)، ويُستعمَل من resetSubWizard() في كل مرّة
  // يُفتَح فيها تبويب «إعلان جديد» من جديد — لا صفراً ثابتاً دائماً.
  let defaultSubMonthIdx = 0;

  /** أغلفةٌ تحافظ على نفس أسماء الدوال محلياً — القيم الفعلية من swapRules. */
  function swapRulesWrappers() {
    return {
      sameDuty: swapRules.sameDuty,
      afterExchange: swapRules.afterExchange,
      evaluate: (duties, date, ignore, allowStrip) => swapRules.evaluate(duties, date, ignore, !!allowStrip),
      dutyGroup: swapRules.dutyGroup,
      isDoorDuty: swapRules.isDoorDuty,
      isMale: swapRules.isMale,
      genderBlocked: swapRules.genderBlocked,
      coverFeasible: (myDuty, toDuties, toDoc) => swapRules.coverFeasible(myDuty, toDuties, toDoc, false),
      swapFeasible: (fromDoc, fromDuties, myDuty, toDoc, toDuties, theirDuty) =>
        swapRules.swapFeasible(fromDoc, fromDuties, myDuty, toDoc, toDuties, theirDuty, false),
      feasibleSwaps: (fromDoc, fromDuties, shift, toDoc, toDuties) =>
        swapRules.feasibleSwaps(fromDoc, fromDuties, shift, toDoc, toDuties, today, false),
      dutiesAfter: swapRules.dutiesAfter
    };
  }

  const keyOf = swapRules.keyOf;
  const dutiesOf = doc => swapRules.dutiesOf(S.duties, doc);

  let authIdentity = null;

  function applyAuthIdentity() {
    if (!authIdentity || !S.roster.length) return;
    const doc = S.roster.find(r => normAr(r.abbr) === normAr(authIdentity.abbr));
    if (!doc) return;
    S.me = doc;
    if ($('app')) { $('app').hidden = false; }
    loadAll();
  }

  async function boot() {
    try {
      const fetched = await AUH.data.repository.fetchAll({
        only: ['residents', 'oncall', 'holidays', 'oncallAdjustments', 'oncallRules']
      });
      const ds = AUH.data.repository.parseAll(fetched.tables);
      const idx = swapRules.buildDutyIndex(ds);
      S.roster = idx.roster; S.duties = idx.duties; S.months = idx.months;

      const cats = new Set();
      S.duties.forEach(list => list.forEach(d => cats.add(d.cat)));
      S.allCategories = Array.from(cats).sort((a, b) => a.localeCompare(b, 'ar'));

      // رزنامة «تقديم إعلان» تفتح على الشهر الحالي، لا أوّل شهرٍ في الجدول —
      // ويبقى كذلك في كل مرّةٍ يُفتَح التبويب من جديد (راجع resetSubWizard).
      const upcoming = S.months.findIndex(m => m >= today.slice(0, 7));
      defaultSubMonthIdx = upcoming < 0 ? Math.max(0, S.months.length - 1) : upcoming;
      S.sub.m = defaultSubMonthIdx;

      $('boot').hidden = true;
      wire();
      applyAuthIdentity();
    } catch (err) {
      $('boot').innerHTML =
        '<div class="verdict no"><h3><i class="fas fa-triangle-exclamation"></i> تعذر تحميل البيانات</h3>' +
        '<div>تأكد من الاتصال بالإنترنت ثم أعد تحميل الصفحة. ' +
        escapeHtml(err && err.message ? err.message : '') + '</div></div>';
    }
  }

  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast._h);
    toast._h = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  /* ============================================================ تحميل الإعلانات */
  function loadAll() {
    const token = AUH.storage.get('auh_swap_session');
    if (!token) return;
    Promise.all([
      AUH.data.swapFind.listFindRequests(token),
      AUH.data.swapFind.myFindRequests(token)
    ]).then(([listRes, mineRes]) => {
      if (listRes && listRes.state === 'ok') S.open = listRes.requests || [];
      if (mineRes && mineRes.state === 'ok') { S.mine = mineRes.mine || []; S.myOffers = mineRes.myOffers || []; }
      renderAll();
    }).catch(() => toast('تعذّر تحميل الإعلانات — أعد تحميل الصفحة.', true));
  }

  function renderAll() {
    renderTabs();
    renderBrowse();
    renderMine();
    renderOffers();
  }

  function renderTabs() {
    const feasible = S.open.filter(iCanFulfill);
    $('cnt-browse').textContent = feasible.length;
    $('cnt-mine').textContent = S.mine.filter(r => r.status === 'open').length;
    $('cnt-offers').textContent = S.myOffers.filter(o => o.status === 'pending').length;
    document.querySelectorAll('#sfTabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === S.tab);
    });
    ['browse', 'submit', 'mine', 'offers'].forEach(t => {
      $('panel' + t[0].toUpperCase() + t.slice(1)).hidden = t !== S.tab;
    });
  }

  function switchTab(tab) {
    S.tab = tab;
    if (tab === 'submit' && !S.sub.editId) resetSubWizard();
    renderTabs();
  }

  /**
   * صاحبُ الإعلان معروفٌ باختصاره فقط من صفّ الإعلان — جدولُه الحقيقيّ وجنسُه
   * موجودان في نفس فهرس الجدول/اللائحة المُحمَّل أصلاً لكل الأطباء (`S.roster`/
   * `S.duties`)، فلا داعي لبناء كائنٍ جزئيّ ناقص الجنس يُفسد فحص `genderBlocked`.
   */
  function docByAbbr(abbr, fallbackName) {
    return S.roster.find(x => normAr(x.abbr) === normAr(abbr)) || { abbr, name: fallbackName, gender: '' };
  }

  /* ---------------------------------------------------------- هل أستطيع؟ */
  /** شيل → coverFeasible بسيط. تبديل → أيّ مناوبةٍ لديّ تقع ضمن تفضيلاته وتُجيز swapFeasible. */
  function iCanFulfill(r) {
    if (!S.me || normAr(r.fromAbbr) === normAr(S.me.abbr)) return false;
    const shiftDuty = { date: r.shiftDate, cat: r.shiftType };
    if (r.kind === 'شيل') {
      return !!coverFeasible(shiftDuty, dutiesOf(S.me), S.me);
    }
    return myCandidatesFor(r).length > 0;
  }

  /** كل مناوباتي التي تصلح عرضاً على إعلان «تبديل» معيّن — ضمن تفضيله وتُجيز swapFeasible. */
  function myCandidatesFor(r) {
    const fromDoc = docByAbbr(r.fromAbbr, r.fromName);
    const shiftDuty = { date: r.shiftDate, cat: r.shiftType };
    const wantDays = r.acceptedDays;
    const wantCats = r.acceptedCategories;
    return dutiesOf(S.me).filter(d => {
      if (wantDays !== 'ALL' && wantDays.indexOf(d.date) < 0) return false;
      if (wantCats !== 'ALL' && wantCats.indexOf(d.cat) < 0) return false;
      return !!swapFeasible(fromDoc, dutiesOf(fromDoc), shiftDuty, S.me, dutiesOf(S.me), d);
    });
  }

  /* ============================================================ أ/ب: تصفّح */
  function renderBrowse() {
    const host = $('browseList');
    const all = S.open.filter(r => normAr(r.fromAbbr) !== normAr((S.me || {}).abbr));
    const list = S.showAll ? all : all.filter(iCanFulfill);
    $('showAllBtn').innerHTML = S.showAll
      ? '<i class="fas fa-filter"></i> عرض ما يمكنني تلبيته فقط'
      : '<i class="fas fa-layer-group"></i> عرض كل الإعلانات';

    if (!list.length) {
      host.innerHTML = `<div class="verdict no" style="margin-top:0"><h3><i class="fas fa-inbox"></i> لا يوجد شيء الآن</h3>` +
        `<div>${S.showAll ? 'لا توجد إعلاناتٌ مفتوحة حالياً.' : 'لا يوجد إعلانٌ يناسب مناوباتك الحالية — جرّب «عرض كل الإعلانات».'}</div></div>`;
      return;
    }

    host.innerHTML = list.map(r => findCardHtml(r, 'browse')).join('');
    wireCardActions(host, list);
  }

  function prefSummary(r) {
    if (r.kind !== 'تبديل') return '';
    const days = r.acceptedDays === 'ALL' ? 'أيُّ يوم' : r.acceptedDays.map(fmt).join('، ');
    const cats = r.acceptedCategories === 'ALL' ? 'أيُّ نوع مناوبة' : r.acceptedCategories.join('، ');
    return `<div class="fc-pref"><i class="fas fa-calendar-check"></i> يقبل التبديل مقابل: <b>${escapeHtml(days)}</b> — <b>${escapeHtml(cats)}</b></div>`;
  }

  function findCardHtml(r, ctx) {
    const kindCls = r.kind === 'تبديل' ? 'kind-swap' : 'kind-shel';
    const canI = ctx === 'browse' ? iCanFulfill(r) : true;
    return `<div class="find-card${r.urgent ? ' urgent' : ''}" data-id="${escapeHtml(r.id)}">
      <div class="fc-head">
        <span class="req-badge ${kindCls}">${escapeHtml(r.kind)}</span>
        ${r.urgent ? '<span class="req-badge urgent"><i class="fas fa-triangle-exclamation"></i> عاجل</span>' : ''}
        <span class="fc-who"><i class="fas fa-user-doctor"></i> ${escapeHtml(r.fromName)} <span class="num">(${escapeHtml(r.fromAbbr)})</span></span>
      </div>
      <div class="fc-what">يعرض: <b>${escapeHtml(r.shiftType)}</b> — ${getDayName(r.shiftDate)} <span class="num">${fmt(r.shiftDate)}</span></div>
      ${prefSummary(r)}
      ${r.reason ? `<div class="fc-what">السبب: ${escapeHtml(r.reason)}</div>` : ''}
      ${ctx === 'browse' ? `<div class="fc-actions">
        <button type="button" class="ghost preview-btn" data-id="${escapeHtml(r.id)}"><i class="fas fa-eye"></i> رزنامتي في حال ${r.kind === 'تبديل' ? 'التبديل' : 'الشيل'}</button>
        <button type="button" class="primary offer-btn" data-id="${escapeHtml(r.id)}" ${canI ? '' : 'disabled title="لا توجد مناوبةٌ لديك تصلح لهذا الإعلان"'}><i class="fas fa-handshake"></i> أعرض المساعدة</button>
      </div>` : ''}
    </div>`;
  }

  function wireCardActions(host, list) {
    host.querySelectorAll('.preview-btn').forEach(b => b.addEventListener('click', () => {
      const r = list.find(x => x.id === b.dataset.id);
      if (r) openPick(r, 'preview');
    }));
    host.querySelectorAll('.offer-btn').forEach(b => b.addEventListener('click', () => {
      const r = list.find(x => x.id === b.dataset.id);
      if (r) openPick(r, 'offer');
    }));
  }

  /* ===================================================== معاينة/عرض مُشترَك */
  /**
   * شيلٌ: لا اختيار — مناوبةٌ واحدة تُضاف لرزنامتي، بلا شيءٍ يُحذف.
   * تبديل: يجب اختيار إحدى مناوباتي المرشَّحة أوّلاً (ضمن تفضيله، وتُجيز swapFeasible).
   */
  function openPick(r, mode) {
    S.pick = { requestId: r.id, mode, m: 0, r };
    if (r.kind === 'شيل') {
      if (mode === 'preview') openPreview(r, null);
      else openOfferConfirm(r, null);
      return;
    }
    const candidates = myCandidatesFor(r);
    if (!candidates.length) { toast('لا توجد مناوبةٌ لديك تصلح مقابل هذا الإعلان.', true); return; }
    renderPickModal(r, candidates, mode);
  }

  function renderPickModal(r, candidates, mode) {
    const host = $('pickList');
    host.innerHTML = candidates.map(d => `<div class="duty-pick-item" data-date="${d.date}" data-cat="${escapeHtml(d.cat)}">
        <span><i class="fas fa-calendar-day"></i> ${getDayName(d.date)} <span class="num">${fmt(d.date)}</span></span>
        <b>${escapeHtml(d.cat)}</b>
      </div>`).join('');
    $('pickModalTitle').textContent = mode === 'preview' ? 'اختر مناوبتك لمعاينة النتيجة' : 'اختر مناوبتك التي تعرضها بالمقابل';
    host.querySelectorAll('.duty-pick-item').forEach(el => el.addEventListener('click', () => {
      const duty = { date: el.dataset.date, cat: el.dataset.cat };
      $('pickModal').hidden = true;
      if (mode === 'preview') openPreview(r, duty);
      else openOfferConfirm(r, duty);
    }));
    $('pickModal').hidden = false;
  }

  /** «رزنامتي في حال التبديل/الشيل» — رزنامةٌ واحدة بعد التطبيق، مع إمكانية العرض مباشرةً منها. */
  function openPreview(r, myCandidateDuty) {
    const addDuty = { date: r.shiftDate, cat: r.shiftType };
    const removeDuty = myCandidateDuty || null;
    const after = dutiesAfter(dutiesOf(S.me), addDuty, removeDuty);
    const month = addDuty.date.slice(0, 7);
    const mi = S.months.indexOf(month);

    $('previewTitle').textContent = r.kind === 'تبديل'
      ? `رزنامتك إن بدّلت ${escapeHtml(removeDuty ? removeDuty.cat : '')} بـ ${escapeHtml(r.shiftType)}`
      : `رزنامتك إن أخذت ${escapeHtml(r.shiftType)}`;
    renderSingleMonth($('previewCal'), $('previewCalT'), mi >= 0 ? mi : S.months.length - 1, after, {
      added: addDuty.date, removed: removeDuty ? removeDuty.date : null
    });

    $('previewOfferBtn').onclick = () => {
      $('previewModal').hidden = true;
      openOfferConfirm(r, myCandidateDuty);
    };
    $('previewModal').hidden = false;
  }

  /** تأكيدٌ أخير وبسيط قبل إرسال العرض الفعليّ. */
  function openOfferConfirm(r, myCandidateDuty) {
    $('offerConfirmBody').innerHTML = `<div class="fc-what">تعرض المساعدة على إعلان <b>${escapeHtml(r.fromName)}</b>: ` +
      `<b>${escapeHtml(r.shiftType)}</b> — ${getDayName(r.shiftDate)} <span class="num">${fmt(r.shiftDate)}</span></div>` +
      (myCandidateDuty ? `<div class="fc-what">وتعرض بالمقابل: <b>${escapeHtml(myCandidateDuty.cat)}</b> — ${getDayName(myCandidateDuty.date)} <span class="num">${fmt(myCandidateDuty.date)}</span></div>` : '');
    $('offerNote').value = '';
    $('offerPhone').value = '';
    $('offerConfirmBtn').onclick = () => submitOffer(r, myCandidateDuty);
    $('offerConfirmModal').hidden = false;
  }

  function submitOffer(r, myCandidateDuty) {
    const token = AUH.storage.get('auh_swap_session');
    const btn = $('offerConfirmBtn');
    btn.disabled = true; btn.classList.add('is-busy');
    AUH.data.swapFind.submitFindOffer(token, r.id, {
      shiftDate: myCandidateDuty ? myCandidateDuty.date : '',
      shiftType: myCandidateDuty ? myCandidateDuty.cat : '',
      note: $('offerNote').value.trim(),
      phone: $('offerPhone').value.trim()
    }).then(res => {
      btn.disabled = false; btn.classList.remove('is-busy');
      if (!res || res.state !== 'ok') { toast((res && res.message) || 'تعذّر إرسال العرض.', true); return; }
      $('offerConfirmModal').hidden = true;
      toast('أُرسل عرضُك — بانتظار موافقة صاحب الإعلان.');
      loadAll();
    }).catch(err => { btn.disabled = false; btn.classList.remove('is-busy'); toast(err.message || 'تعذّر إرسال العرض.', true); });
  }

  /* ========================================================= ج: تقديم إعلان */
  function resetSubWizard() {
    S.sub = { kind: 'شيل', shift: null, days: 'ALL', cats: 'ALL', urgent: false, editId: null, m: defaultSubMonthIdx };
    $('subKind').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.kind === 'شيل'));
    $('subAllDays').checked = true;
    $('subAllCats').checked = true;
    $('subReason').value = '';
    $('subNotes').value = '';
    $('subPhone').value = '';
    $('subUrgent').checked = false;
    $('subSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> نشر الإعلان<span class="btn-spinner"></span>';
    renderSubWizard();
  }

  function renderSubWizard() {
    const mutual = S.sub.kind === 'تبديل';
    $('subPrefSection').hidden = !mutual;
    // الخانتان تعكسان حالة S.sub.days/cats الفعلية دائماً — تبقيان متزامنتين
    // سواءٌ بدّل المستخدم بالضغط عليهما مباشرةً أو باختيار يومٍ/فئةٍ بعينها.
    $('subAllDays').checked = S.sub.days === 'ALL';
    $('subAllCats').checked = S.sub.cats === 'ALL';

    renderSingleMonth($('subCal'), $('subCalT'), S.sub.m, dutiesOf(S.me), {
      pickMode: true, selected: S.sub.shift && S.sub.shift.date
    });

    if (mutual && S.sub.shift) renderDaysGrid(); else $('subDaysGrid').innerHTML = '';
    if (mutual) renderCatsGrid();

    $('subSubmitBtn').disabled = subInvalid();
  }

  /** يجب اختيار مناوبتي، وإن كان تبديلاً فلا يصحّ ترك الأيام أو الفئات المقبولة فارغةً تماماً. */
  function subInvalid() {
    const mutual = S.sub.kind === 'تبديل';
    if (!S.sub.shift) return true;
    if (!mutual) return false;
    if (S.sub.days !== 'ALL' && !S.sub.days.length) return true;
    if (S.sub.cats !== 'ALL' && !S.sub.cats.length) return true;
    return false;
  }

  function renderDaysGrid() {
    // كل أيام الشهور المحمَّلة، مستقبلاً من اليوم — اليوم مسموحٌ به إن لم يسبّب تعارضاً.
    const host = $('subDaysGrid');
    const ignoreDate = S.sub.shift.date;
    const myDuties = dutiesOf(S.me);
    const html = [];
    S.months.forEach(month => {
      if (month < today.slice(0, 7)) return;
      const [y, m] = month.split('-').map(Number);
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      let monthHtml = `<div class="cal-title" style="margin:10px 0 6px">${AR_MONTHS[m - 1]} ${y}</div><div class="cal">`;
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      for (let i = 0; i < 7; i++) monthHtml += `<div class="dow">${DOW[i]}</div>`;
      for (let i = 0; i < first; i++) monthHtml += '<div class="day pad"></div>';
      for (let d = 1; d <= days; d++) {
        const iso = isoOf(y, m, d);
        if (iso < minShiftDate) { monthHtml += `<div class="day pad"></div>`; continue; }
        const v = evaluate(myDuties, iso, ignoreDate, false);
        const cls = ['day'];
        let why = '';
        if (!v.ok) { cls.push('blocked'); why = v.blocks[0] ? v.blocks[0].replace(/\s*\(.*\)/, '') : 'لا يصلح'; }
        else { cls.push('pick'); if (S.sub.days !== 'ALL' && S.sub.days.indexOf(iso) >= 0) cls.push('sel'); }
        monthHtml += `<div class="${cls.join(' ')}" ${v.ok ? `data-date="${iso}"` : ''}><span class="dn">${d}</span>` +
          (why ? `<span class="why">${escapeHtml(why)}</span>` : '') + '</div>';
      }
      monthHtml += '</div>';
      html.push(monthHtml);
    });
    host.innerHTML = html.join('');
    host.querySelectorAll('.day.pick').forEach(el => el.addEventListener('click', () => {
      const iso = el.dataset.date;
      if (S.sub.days === 'ALL') S.sub.days = [];
      const i = S.sub.days.indexOf(iso);
      if (i >= 0) S.sub.days.splice(i, 1); else S.sub.days.push(iso);
      $('subAllDays').checked = S.sub.days === 'ALL'; // لن تعود 'ALL' هنا أبداً، لكن تبقى الخانة متزامنةً دوماً مع الحالة
      renderDaysGrid();
      $('subSubmitBtn').disabled = subInvalid();
    }));
  }

  function renderCatsGrid() {
    const host = $('subCatsGrid');
    host.innerHTML = S.allCategories
      .filter(cat => !genderBlocked(cat, S.me))
      .map(cat => `<label class="cat-chk${S.sub.cats !== 'ALL' && S.sub.cats.indexOf(cat) >= 0 ? ' on' : ''}" data-cat="${escapeHtml(cat)}">
        <input type="checkbox" ${S.sub.cats === 'ALL' || S.sub.cats.indexOf(cat) >= 0 ? 'checked' : ''}>
        ${escapeHtml(cat)}</label>`).join('');
    host.querySelectorAll('.cat-chk').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      const cat = el.dataset.cat;
      if (S.sub.cats === 'ALL') S.sub.cats = S.allCategories.filter(c => !genderBlocked(c, S.me));
      const i = S.sub.cats.indexOf(cat);
      if (i >= 0) S.sub.cats.splice(i, 1); else S.sub.cats.push(cat);
      $('subAllCats').checked = S.sub.cats === 'ALL';
      renderCatsGrid();
      $('subSubmitBtn').disabled = subInvalid();
    }));
  }

  function submitSub() {
    if (subInvalid()) return;
    const token = AUH.storage.get('auh_swap_session');
    const mutual = S.sub.kind === 'تبديل';
    const data = {
      kind: S.sub.kind, shiftDate: S.sub.shift.date, shiftType: S.sub.shift.cat,
      acceptedDays: mutual ? S.sub.days : 'ALL', acceptedCategories: mutual ? S.sub.cats : 'ALL',
      reason: $('subReason').value.trim(), notes: $('subNotes').value.trim(), phone: $('subPhone').value.trim(),
      urgent: $('subUrgent').checked
    };
    const btn = $('subSubmitBtn');
    btn.disabled = true; btn.classList.add('is-busy');
    const action = S.sub.editId
      ? AUH.data.swapFind.editFindRequest(token, S.sub.editId, data)
      : AUH.data.swapFind.submitFindRequest(token, data);
    action.then(res => {
      btn.disabled = false; btn.classList.remove('is-busy');
      if (!res || res.state !== 'ok') { toast((res && res.message) || 'تعذّر نشر الإعلان.', true); return; }
      toast(S.sub.editId ? 'عُدِّل إعلانك بنجاح.' : 'نُشر إعلانُك بنجاح.');
      resetSubWizard();
      switchTab('mine');
      loadAll();
    }).catch(err => { btn.disabled = false; btn.classList.remove('is-busy'); toast(err.message || 'تعذّر نشر الإعلان.', true); });
  }

  function startEdit(r) {
    const shiftMonthIdx = S.months.indexOf(r.shiftDate.slice(0, 7));
    S.sub = {
      kind: r.kind, shift: { date: r.shiftDate, cat: r.shiftType },
      days: r.acceptedDays, cats: r.acceptedCategories, urgent: r.urgent, editId: r.id,
      m: shiftMonthIdx >= 0 ? shiftMonthIdx : defaultSubMonthIdx
    };
    $('subKind').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.kind === r.kind));
    $('subReason').value = r.reason || '';
    $('subNotes').value = r.notes || '';
    $('subPhone').value = r.phone || '';
    $('subUrgent').checked = !!r.urgent;
    $('subSubmitBtn').innerHTML = '<i class="fas fa-check"></i> حفظ التعديل<span class="btn-spinner"></span>';
    switchTab('submit');
    renderSubWizard();
  }

  /* =============================================================== د: إعلاناتي */
  const STATUS_LABEL = { open: 'مفتوح', matched: 'تمّ الاتفاق', withdrawn: 'مسحوب' };
  const OFFER_STATUS_LABEL = { pending: 'بانتظار الردّ', accepted: 'مقبول', auto_rejected: 'لم يُقبل', withdrawn: 'مسحوب' };

  function renderMine() {
    const host = $('mineList');
    if (!S.mine.length) { host.innerHTML = '<p class="step-hint">لم تنشر أيّ إعلانٍ بعد.</p>'; return; }

    host.innerHTML = S.mine.map(r => {
      const offersHtml = (r.offers || []).map(o => `<div class="fc-offer-row" data-offer="${escapeHtml(o.id)}" data-req="${escapeHtml(r.id)}">
        <span><i class="fas fa-user"></i> ${escapeHtml(o.fromName)} <span class="num">(${escapeHtml(o.fromAbbr)})</span></span>
        ${o.shiftDate ? `<span class="num">${escapeHtml(o.shiftType)} — ${fmt(o.shiftDate)}</span>` : ''}
        ${o.phone ? `<span class="num">${escapeHtml(o.phone)}</span>` : ''}
        <span class="req-badge ${escapeHtml(o.status)}">${escapeHtml(OFFER_STATUS_LABEL[o.status] || o.status)}</span>
        ${(r.status === 'open' && o.status === 'pending') ? `<button type="button" class="accept-offer-btn" data-offer="${escapeHtml(o.id)}" data-req="${escapeHtml(r.id)}"><i class="fas fa-check"></i> قبول</button>` : ''}
      </div>`).join('') || '<div class="fc-offer-row"><span class="step-hint" style="padding:0">لم يصلك عرضٌ بعد.</span></div>';

      return `<div class="find-card${r.urgent ? ' urgent' : ''}" data-id="${escapeHtml(r.id)}">
        <div class="fc-head">
          <span class="req-badge ${r.kind === 'تبديل' ? 'kind-swap' : 'kind-shel'}">${escapeHtml(r.kind)}</span>
          <span class="req-badge ${escapeHtml(r.status)}">${escapeHtml(STATUS_LABEL[r.status] || r.status)}</span>
          ${r.urgent ? '<span class="req-badge urgent"><i class="fas fa-triangle-exclamation"></i> عاجل</span>' : ''}
        </div>
        <div class="fc-what"><b>${escapeHtml(r.shiftType)}</b> — ${getDayName(r.shiftDate)} <span class="num">${fmt(r.shiftDate)}</span></div>
        ${prefSummary(r)}
        ${r.status === 'open' ? `<div class="fc-actions">
          <button type="button" class="ghost edit-btn" data-id="${escapeHtml(r.id)}"><i class="fas fa-pen"></i> تعديل</button>
          <button type="button" class="ghost delete-btn" data-id="${escapeHtml(r.id)}"><i class="fas fa-trash"></i> حذف</button>
        </div>` : ''}
        <div class="fc-offer">${offersHtml}</div>
      </div>`;
    }).join('');

    host.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', () => {
      const r = S.mine.find(x => x.id === b.dataset.id); if (r) startEdit(r);
    }));
    host.querySelectorAll('.delete-btn').forEach(b => b.addEventListener('click', () => armDelete(b)));
    host.querySelectorAll('.accept-offer-btn').forEach(b => b.addEventListener('click', () => armAccept(b)));
  }

  /** نفس نمط «تسليح ثم تأكيد» المستخدَم في «طلباتي» بـ`swap.js` — لا نقرة خاطئة تحذف أو تقبل. */
  function armDelete(btn) {
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.innerHTML = '<i class="fas fa-trash"></i> تأكيد الحذف؟';
      setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = '<i class="fas fa-trash"></i> حذف'; }, 4000);
      return;
    }
    const token = AUH.storage.get('auh_swap_session');
    AUH.data.swapFind.cancelFindRequest(token, btn.dataset.id).then(res => {
      if (!res || res.state !== 'ok') { toast((res && res.message) || 'تعذّر الحذف.', true); return; }
      toast('حُذف الإعلان.');
      loadAll();
    }).catch(err => toast(err.message || 'تعذّر الحذف.', true));
  }

  function armAccept(btn) {
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.innerHTML = '<i class="fas fa-check"></i> تأكيد القبول؟';
      setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = '<i class="fas fa-check"></i> قبول'; }, 4000);
      return;
    }
    const token = AUH.storage.get('auh_swap_session');
    btn.disabled = true;
    AUH.data.swapFind.acceptFindOffer(token, btn.dataset.req, btn.dataset.offer).then(res => {
      if (!res || res.state !== 'ok') { btn.disabled = false; toast((res && res.message) || 'تعذّر قبول العرض.', true); return; }
      AUH.storage.set(AUTOFILL_KEY, JSON.stringify({
        fromAbbr: res.fromAbbr, kind: res.kind, shiftDate: res.shiftDate, shiftType: res.shiftType,
        toAbbr: res.toAbbr, toName: res.toName, backDate: res.backDate, backType: res.backType, urgent: res.urgent
      }));
      toast('تمّ! جارٍ تحويلك لإتمام الطلب الرسمي…');
      setTimeout(() => { global.location.href = 'swap.html'; }, 900);
    }).catch(err => { btn.disabled = false; toast(err.message || 'تعذّر قبول العرض.', true); });
  }

  /* =============================================================== هـ: عروضي */
  function renderOffers() {
    const host = $('offersList');
    if (!S.myOffers.length) { host.innerHTML = '<p class="step-hint">لم تُرسل أيّ عرضٍ بعد.</p>'; return; }

    host.innerHTML = S.myOffers.map(o => `<div class="find-card" data-id="${escapeHtml(o.id)}">
      <div class="fc-head"><span class="req-badge ${escapeHtml(o.status)}">${escapeHtml(OFFER_STATUS_LABEL[o.status] || o.status)}</span></div>
      <div class="fc-what">عرضٌ على إعلان <b>${escapeHtml(o.request ? o.request.fromName : '')}</b></div>
      ${o.shiftDate ? `<div class="fc-what">عرضتَ: <b>${escapeHtml(o.shiftType)}</b> — ${getDayName(o.shiftDate)} <span class="num">${fmt(o.shiftDate)}</span></div>` : ''}
      ${o.status === 'pending' ? `<div class="fc-actions"><button type="button" class="ghost withdraw-offer-btn" data-id="${escapeHtml(o.id)}"><i class="fas fa-rotate-left"></i> سحب العرض</button></div>` : ''}
    </div>`).join('');

    host.querySelectorAll('.withdraw-offer-btn').forEach(b => b.addEventListener('click', () => armWithdraw(b)));
  }

  function armWithdraw(btn) {
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.innerHTML = '<i class="fas fa-rotate-left"></i> تأكيد السحب؟';
      setTimeout(() => { btn.classList.remove('armed'); btn.innerHTML = '<i class="fas fa-rotate-left"></i> سحب العرض'; }, 4000);
      return;
    }
    const token = AUH.storage.get('auh_swap_session');
    AUH.data.swapFind.withdrawFindOffer(token, btn.dataset.id).then(res => {
      if (!res || res.state !== 'ok') { toast((res && res.message) || 'تعذّر سحب العرض.', true); return; }
      toast('سُحب العرض.');
      loadAll();
    }).catch(err => toast(err.message || 'تعذّر سحب العرض.', true));
  }

  /* ========================================================= رسمُ رزنامةٍ عامّة */
  /**
   * رزنامةُ شهرٍ واحد عامّة — تُستعمَل لاختيار مناوبتي (pickMode) ولعرض
   * «بعد» في المعاينة (added/removed). مُستقلّةٌ تماماً عن DOM/حالة `swap.js`
   * — كودٌ خاصٌّ بهذه الصفحة فقط، لا فائدة من مشاركته.
   */
  function renderSingleMonth(host, titleEl, monthIdx, duties, opts) {
    opts = opts || {};
    const month = S.months[monthIdx];
    if (!month) { host.innerHTML = '<div class="empty-cal">لا توجد بيانات لهذا الشهر</div>'; titleEl.textContent = '—'; return; }
    const [y, m] = month.split('-').map(Number);
    titleEl.textContent = `${AR_MONTHS[m - 1]} ${y}`;

    const byDate = {};
    duties.filter(d => d.date.startsWith(month)).forEach(d => (byDate[d.date] = byDate[d.date] || []).push(d));

    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < 7; i++) cells.push(`<div class="dow">${DOW[i]}</div>`);
    for (let i = 0; i < first; i++) cells.push('<div class="day pad"></div>');

    for (let d = 1; d <= days; d++) {
      const iso = isoOf(y, m, d);
      const mine = byDate[iso] || [];
      const cls = ['day'];
      let click = '', why = '';

      if (iso < today) cls.push('past'); // غير مستبعدٍ من الاختيار — فقط لونٌ رماديّ مميِّز

      if (opts.pickMode) {
        if (mine.length && iso >= minShiftDate) { cls.push('pick'); click = ` data-date="${iso}"`; }
        // مناوبةٌ أقدم من يومين: تبقى رماديةً هادئة (.past) بلا تعليق
        // «قديمةٌ جداً» — غير قابلةٍ للاختيار فحسب، لا مُعلَّمةً بالأحمر.
        if (iso === opts.selected) cls.push('sel');
      } else {
        if (iso === opts.added) cls.push('added');
        if (iso === opts.removed) cls.push('removed');
      }

      const tags = mine.map(x => `<span class="tag">${escapeHtml(x.cat)}</span>`).join('');
      cells.push(`<div class="${cls.join(' ')}"${click}><span class="dn">${d}</span>${tags}` +
        (why ? `<span class="why">${escapeHtml(why)}</span>` : '') + '</div>');
    }
    host.className = 'cal';
    host.innerHTML = cells.join('');

    if (opts.pickMode) {
      host.querySelectorAll('.day.pick').forEach(el => el.addEventListener('click', () => {
        const iso = el.dataset.date;
        const duty = (byDate[iso] || [])[0];
        S.sub.shift = duty;
        renderSubWizard();
      }));
    }
  }

  /* ================================================================== الربط */
  function wire() {
    $('sfTabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-tab]');
      if (b) switchTab(b.dataset.tab);
    });
    $('showAllBtn').addEventListener('click', () => { S.showAll = !S.showAll; renderBrowse(); });

    $('subKind').addEventListener('click', e => {
      const b = e.target.closest('button[data-kind]');
      if (!b) return;
      $('subKind').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      S.sub.kind = b.dataset.kind;
      if (S.sub.kind !== 'تبديل') { S.sub.days = 'ALL'; S.sub.cats = 'ALL'; }
      renderSubWizard();
    });
    $('p1sub').addEventListener('click', () => { if (S.sub.m > 0) { S.sub.m--; renderSubWizard(); } });
    $('n1sub').addEventListener('click', () => { if (S.sub.m < S.months.length - 1) { S.sub.m++; renderSubWizard(); } });

    $('subAllDays').addEventListener('change', () => { S.sub.days = $('subAllDays').checked ? 'ALL' : []; renderSubWizard(); });
    $('subAllCats').addEventListener('change', () => { S.sub.cats = $('subAllCats').checked ? 'ALL' : S.allCategories.filter(c => !genderBlocked(c, S.me)); renderSubWizard(); });
    $('subSubmitBtn').addEventListener('click', submitSub);
    $('subCancelEditBtn').addEventListener('click', () => resetSubWizard());

    $('pickModalClose').addEventListener('click', () => { $('pickModal').hidden = true; });
    $('previewClose').addEventListener('click', () => { $('previewModal').hidden = true; });
    $('offerConfirmClose').addEventListener('click', () => { $('offerConfirmModal').hidden = true; });
  }

  global.AUH.swapFind = global.AUH.swapFind || {};
  global.AUH.swapFind.setAuthIdentity = function (identity) { authIdentity = identity; applyAuthIdentity(); };

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * بوّابة الدخول لصفحة التبديل الجديدة — المرحلة ١ من ٤: حسابٌ، دخول،
 * تذكّرني، وشرحٌ خطوة بخطوة لمن يفتح الصفحة أوّل مرّة. لا تلمس تدفّق
 * التبديل القائم في `swap.js` إطلاقاً — تعمل فوقه كطبقة تغطية (overlay) تختفي
 * بعد نجاح الدخول، فـ`swap.js` يُحمَّل بياناته بالتوازي بلا أيّ تعديلٍ فيه.
 *
 * مستقلّةٌ عن حالة `swap.js` الداخلية: تجلب لائحة المقيمين لنفسها (لاختيار
 * الاسم عند التسجيل) من نفس طبقة البيانات (`AUH.data.gviz` + `AUH.parse.residents`).
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, smartSearch, escapeHtml } = AUH.text;
  const TOKEN_KEY = 'auh_swap_session';
  const GUIDE_SEEN_KEY = 'auh_swap_guide_seen';
  const BANNER_DISMISSED_KEY = 'auh_banner_find_dismissed';

  let residentsList = []; // [{abbr, name}]
  let registerPicked = null; // {abbr, name} أثناء التسجيل

  function el(id) { return document.getElementById(id); }

  function showGate() {
    const g = el('authGate');
    if (g) g.hidden = false;
  }

  function hideGate(identity) {
    const g = el('authGate');
    if (g) g.hidden = true;
    const badge = el('authWhoBadge');
    if (badge && identity) {
      badge.hidden = false;
      badge.innerHTML = `<i class="fas fa-user-check"></i> ${escapeHtml(identity.name)} ` +
        `<button type="button" id="authChangePassBtn" title="تغيير كلمة السرّ"><i class="fas fa-key"></i></button>` +
        `<button type="button" id="authLogoutBtn" title="تسجيل خروج"><i class="fas fa-right-from-bracket"></i></button>`;
      const out = el('authLogoutBtn');
      if (out) out.onclick = doLogout;
      const cp = el('authChangePassBtn');
      if (cp) cp.onclick = openChangePassword;
    }
    // زرّ «البحث عن بديل» في الرأس — موجودٌ في swap.html فقط (لا داعي له في
    // swap-find.html نفسها)، فيُفحَص وجوده أولاً. يظهر بعد الدخول مباشرةً.
    const findCta = el('heroFindCta');
    if (findCta && identity) findCta.hidden = false;
    // صاحبُ طلب التبديل = صاحبُ الحساب دائماً — راجع swap.js لِمَ هذا مقفل.
    // نفس البوّابة والمنطق يُعاد استخدامهما حرفياً في swap-find.html (واجهة
    // «البحث عن بديل») — فقط أحد الكائنين الآتيين موجودٌ فعلياً بحسب الصفحة.
    if (identity && AUH.swap && AUH.swap.setAuthIdentity) AUH.swap.setAuthIdentity(identity);
    if (identity && AUH.swapFind && AUH.swapFind.setAuthIdentity) AUH.swapFind.setAuthIdentity(identity);
  }

  function setGateError(scope, msg) {
    const box = el(scope === 'login' ? 'loginError' : 'registerError');
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function setBusy(scope, busy) {
    const btn = el(scope === 'login' ? 'loginBtn' : (scope === 'otp' ? 'registerOtpBtn' : 'registerFinishBtn'));
    if (!btn) return;
    btn.disabled = !!busy;
    btn.classList.toggle('is-busy', !!busy);
  }

  /* ───────────────────────── لائحة المقيمين (للتسجيل) ───────────────────────── */

  function loadResidentsForPicker() {
    return AUH.data.gviz.fetchSource(AUH.data.schema.residents)
      .then(raw => {
        const model = AUH.parse.residents(raw);
        residentsList = (model.residents || [])
          .filter(r => r.abbr && r.name)
          .map(r => ({ abbr: r.abbr, name: r.name }));
        syncNameDatalist();
      })
      .catch(() => { /* لا تمنع بقية البوّابة من العمل لو تعذّرت اللائحة */ });
  }

  function syncNameDatalist() {
    const regList = el('regNameOptions');
    if (regList) {
      regList.innerHTML = residentsList
        .map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.abbr)}</option>`)
        .join('');
    }
    // تسجيل الدخول يقبل الاسم الكامل أو الاختصار كليهما — فكلاهما خيارٌ هنا.
    const loginList = el('loginNameOptions');
    if (loginList) {
      loginList.innerHTML = residentsList
        .map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.abbr)}</option><option value="${escapeHtml(r.abbr)}">${escapeHtml(r.name)}</option>`)
        .join('');
    }
  }

  function pickResidentByName(typed) {
    const n = normAr((typed || '').trim());
    if (!n) return null;
    return residentsList.find(r => normAr(r.name) === n) || null;
  }

  /**
   * تسجيل الدخول يرسل الاختصارَ دائماً، بصرف النظر عمّا كتبه المستخدم أو
   * اختاره من القائمة المنسدلة (اسمٌ كاملٌ أو اختصار) — فلا حاجة لدعم
   * مطابقة الاسم في الخادم (`نظام-التبديل.gs`)، ويعمل الحلّ فوراً دون أي
   * إعادة نشرٍ هناك. مطابقةٌ تامّة فقط (بعد `normAr`)؛ إن لم تتطابق، يُرسَل
   * ما كُتب كما هو فيحاول الخادم مطابقته بنفسه (اختصار أو إيميل).
   */
  function resolveLoginIdentifier(typed) {
    const n = normAr((typed || '').trim());
    if (!n) return typed;
    const byAbbr = residentsList.find(r => normAr(r.abbr) === n);
    if (byAbbr) return byAbbr.abbr;
    const byName = residentsList.find(r => normAr(r.name) === n);
    if (byName) return byName.abbr;
    return typed;
  }

  /* ─────────────────────────────── تبويبا الدخول/التسجيل ─────────────────────────────── */

  function switchAuthTab(which) {
    el('authTabLogin').classList.toggle('on', which === 'login');
    el('authTabRegister').classList.toggle('on', which === 'register');
    el('loginPane').hidden = which !== 'login';
    el('registerPane').hidden = which !== 'register';
  }

  /* ────────────────────────────────── تسجيل الدخول ────────────────────────────────── */

  function doLogin() {
    const typed = el('loginAbbr').value.trim();
    const abbr = resolveLoginIdentifier(typed);
    const password = el('loginPassword').value;
    setGateError('login', '');
    if (!abbr || !password) { setGateError('login', 'أدخل اسمك/اختصارك وكلمة السرّ.'); return; }

    setBusy('login', true);
    AUH.data.accounts.login(abbr, password)
      .then(res => {
        setBusy('login', false);
        if (!res || res.state !== 'ok') { setGateError('login', (res && res.message) || 'تعذّر الدخول.'); return; }
        AUH.storage.set(TOKEN_KEY, res.token);
        hideGate({ abbr: res.abbr, name: res.name });
      })
      .catch(err => { setBusy('login', false); setGateError('login', err.message || 'تعذّر الدخول.'); });
  }

  function doLogout() {
    const token = AUH.storage.get(TOKEN_KEY);
    AUH.storage.remove(TOKEN_KEY);
    if (token) AUH.data.accounts.logout(token).catch(() => {});
    global.location.reload();
  }

  /* ──────────────────────────────── تغيير كلمة السرّ ──────────────────────────────── */

  function setChangePassError(msg) {
    const box = el('changePassError');
    if (!box) return;
    box.textContent = msg || '';
    box.hidden = !msg;
  }

  function openChangePassword() {
    setChangePassError('');
    el('cpOld').value = '';
    el('cpNew').value = '';
    el('cpConfirm').value = '';
    el('cpSubmitBtn').innerHTML = '<i class="fas fa-check"></i> حفظ<span class="btn-spinner"></span>';
    el('changePassModal').hidden = false;
    el('cpOld').focus();
  }

  function closeChangePassword() {
    el('changePassModal').hidden = true;
  }

  function submitChangePassword() {
    const oldPassword = el('cpOld').value;
    const newPassword = el('cpNew').value;
    const confirm = el('cpConfirm').value;

    if (!oldPassword) { setChangePassError('اكتب كلمة السرّ الحالية.'); return; }
    if (newPassword.length < 6) { setChangePassError('كلمةُ السرّ الجديدة قصيرةٌ جداً — ستّة أحرفٍ على الأقل.'); return; }
    if (newPassword !== confirm) { setChangePassError('كلمتا السرّ الجديدتان غيرُ متطابقتين.'); return; }

    const token = AUH.storage.get(TOKEN_KEY);
    if (!token) { setChangePassError('انتهت جلستك — سجّل الدخول من جديد.'); return; }

    const btn = el('cpSubmitBtn');
    btn.disabled = true; btn.classList.add('is-busy');
    AUH.data.accounts.changePassword(token, oldPassword, newPassword)
      .then(res => {
        btn.disabled = false; btn.classList.remove('is-busy');
        if (!res || res.state !== 'ok') { setChangePassError((res && res.message) || 'تعذّر تغيير كلمة السرّ.'); return; }
        btn.innerHTML = '<i class="fas fa-circle-check"></i> تم!';
        setTimeout(closeChangePassword, 900);
      })
      .catch(err => {
        btn.disabled = false; btn.classList.remove('is-busy');
        setChangePassError(err.message || 'تعذّر تغيير كلمة السرّ.');
      });
  }

  /* ──────────────────────────────── إنشاء حساب جديد ──────────────────────────────── */

  function registerStep1() {
    setGateError('register', '');
    const typed = el('regName').value;
    const email = el('regEmail').value.trim();
    registerPicked = pickResidentByName(typed);

    if (!registerPicked) { setGateError('register', 'اختر اسمك من اللائحة المقترحة أثناء الكتابة.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setGateError('register', 'اكتب بريداً إلكترونياً صحيحاً.'); return; }

    setBusy('otp', true);
    AUH.data.accounts.startRegister(registerPicked.abbr, email)
      .then(res => {
        setBusy('otp', false);
        if (!res || res.state !== 'ok') { setGateError('register', (res && res.message) || 'تعذّر إرسال رمز التحقّق.'); return; }
        el('registerStep1').hidden = true;
        el('registerStep2').hidden = false;
        el('regOtpEmailLabel').textContent = email;
      })
      .catch(err => { setBusy('otp', false); setGateError('register', err.message || 'تعذّر إرسال رمز التحقّق.'); });
  }

  function registerStep2() {
    setGateError('register', '');
    const code = el('regCode').value.trim();
    const password = el('regPassword').value;
    const email = el('regEmail').value.trim();

    if (!registerPicked) { setGateError('register', 'ابدأ من جديد — لم يُحفَظ اختيار الاسم.'); return; }
    if (!code) { setGateError('register', 'اكتب رمز التحقّق الذي وصلك بالبريد.'); return; }
    if (password.length < 6) { setGateError('register', 'كلمةُ السرّ قصيرةٌ جداً — ستّة أحرفٍ على الأقل.'); return; }

    setBusy('register', true);
    AUH.data.accounts.completeRegister(registerPicked.abbr, email, code, password)
      .then(res => {
        setBusy('register', false);
        if (!res || res.state !== 'ok') { setGateError('register', (res && res.message) || 'تعذّر إنشاء الحساب.'); return; }
        AUH.storage.set(TOKEN_KEY, res.token);
        // رسالةُ نجاحٍ واضحة قبل الدخول التلقائي — يراها المستخدم فعلاً لأنها
        // داخل بطاقة البوّابة (فوق التغطية)، لا توستاً أسفل الصفحة المخفيّة خلفها.
        el('registerStep2').hidden = true;
        el('registerSuccess').hidden = false;
        global.setTimeout(() => hideGate({ abbr: res.abbr, name: res.name }), 1400);
      })
      .catch(err => { setBusy('register', false); setGateError('register', err.message || 'تعذّر إنشاء الحساب.'); });
  }

  /* ───────────────────────────────── الشرح خطوة بخطوة ───────────────────────────────── */

  /** يُعرض أوّل زيارةٍ تلقائياً (بلا جلسة محفوظة)، ويمكن إعادة فتحه لاحقاً من زرّ «كيف يعمل». */
  function showGuide(onClose) {
    const box = el('firstGuide');
    if (!box) { if (onClose) onClose(); return; }
    box.hidden = false;
    const dismiss = () => {
      AUH.storage.set(GUIDE_SEEN_KEY, '1');
      box.hidden = true;
      if (onClose) onClose();
    };
    el('guideSkip').onclick = dismiss;
    el('guideDone').onclick = dismiss;
  }

  /* ──────────────────────────────────── الإقلاع ──────────────────────────────────── */

  function wireEvents() {
    el('authTabLogin').onclick = () => switchAuthTab('login');
    el('authTabRegister').onclick = () => switchAuthTab('register');
    el('loginBtn').onclick = doLogin;
    el('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    el('registerOtpBtn').onclick = registerStep1;
    el('registerFinishBtn').onclick = registerStep2;
    el('registerBackBtn').onclick = () => { el('registerStep1').hidden = false; el('registerStep2').hidden = true; };
    el('authTutorialToggle').onclick = () => showGuide();

    el('changePassClose').onclick = closeChangePassword;
    el('changePassModal').addEventListener('click', e => { if (e.target.id === 'changePassModal') closeChangePassword(); });
    el('cpSubmitBtn').onclick = submitChangePassword;
    el('cpConfirm').addEventListener('keydown', e => { if (e.key === 'Enter') submitChangePassword(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !el('changePassModal').hidden) closeChangePassword(); });
  }

  /** وضعُ الأدمن (`swap.html?admin=1`) — راجع التعليق في js/swap.js. لا دخول
   * ولا دليلَ هنا إطلاقاً: الأدمن مصادَقٌ عليه بكلمة سرّه هو عند الإرسال. */
  const ADMIN_MODE = new URLSearchParams(location.search).get('admin') === '1';

  /**
   * إشعارُ إطلاق «البحث عن بديل» أعلى الصفحة — نافذةٌ زمنيةٌ ثابتة واحدة
   * لكل الزوّار (`FEATURE_FIND_BANNER_UNTIL` في `core/config.js`)، لا لكل
   * مستخدمٍ على حِدة؛ تنتهي تلقائياً بعد ذلك التاريخ بصرف النظر عن أي شيء.
   * زرّ الإغلاق يُسكِته لمن أغلقه فقط، ولا يُمدِّد النافذة العامّة.
   */
  function initFeatureBanner() {
    const banner = el('featureBanner');
    if (!banner) return;
    const until = (AUH.config && AUH.config.FEATURE_FIND_BANNER_UNTIL) || '';
    const deadline = until ? Date.parse(until) : NaN;
    if (!deadline || Date.now() >= deadline) return;
    if (AUH.storage.get(BANNER_DISMISSED_KEY)) return;

    banner.hidden = false;
    const close = el('featureBannerClose');
    if (close) {
      close.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        AUH.storage.set(BANNER_DISMISSED_KEY, '1');
        banner.hidden = true;
      };
    }
  }

  function boot() {
    wireEvents();
    loadResidentsForPicker();

    if (ADMIN_MODE) { el('authGate').hidden = true; return; }
    initFeatureBanner(); // لا إشعار ميزاتٍ جديدة أثناء إدخال الأدمن طلباً يدوياً نيابةً عن أحد

    const afterGuide = () => {
      const token = AUH.storage.get(TOKEN_KEY);
      if (!token) { showGate(); return; }

      // جلسةٌ محفوظة («تذكّرني») — تحقّقٌ صامت قبل إظهار أي شيء.
      showGate();
      el('authGateChecking').hidden = false;
      el('authGateForms').hidden = true;
      AUH.data.accounts.validateSession(token)
        .then(res => {
          el('authGateChecking').hidden = true;
          if (res && res.state === 'ok') { hideGate({ abbr: res.abbr, name: res.name }); return; }
          AUH.storage.remove(TOKEN_KEY);
          el('authGateForms').hidden = false;
        })
        .catch(() => {
          el('authGateChecking').hidden = true;
          el('authGateForms').hidden = false;
        });
    };

    // الدليل المصوَّر يُعرض أوّل زيارةٍ فقط (بزرّ تخطٍّ)، قبل أي شيءٍ آخر.
    if (!AUH.storage.get(GUIDE_SEEN_KEY)) showGuide(afterGuide);
    else afterGuide();
  }

  document.addEventListener('DOMContentLoaded', boot);
})(typeof window !== 'undefined' ? window : globalThis);

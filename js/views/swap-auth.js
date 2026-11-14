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
      badge.innerHTML = `<i class="fas fa-user-check"></i> ${escapeHtml(identity.name)} <button type="button" id="authLogoutBtn" title="تسجيل خروج"><i class="fas fa-right-from-bracket"></i></button>`;
      const out = el('authLogoutBtn');
      if (out) out.onclick = doLogout;
    }
    // صاحبُ طلب التبديل = صاحبُ الحساب دائماً — راجع swap.js لِمَ هذا مقفل.
    if (identity && AUH.swap && AUH.swap.setAuthIdentity) AUH.swap.setAuthIdentity(identity);
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
    const list = el('regNameOptions');
    if (!list) return;
    list.innerHTML = residentsList
      .map(r => `<option value="${escapeHtml(r.name)}">${escapeHtml(r.abbr)}</option>`)
      .join('');
  }

  function pickResidentByName(typed) {
    const n = normAr((typed || '').trim());
    if (!n) return null;
    return residentsList.find(r => normAr(r.name) === n) || null;
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
    const abbr = el('loginAbbr').value.trim();
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
  }

  function boot() {
    wireEvents();
    loadResidentsForPicker();

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

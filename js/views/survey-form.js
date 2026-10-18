/**
 * «استبيان شهر ١١» — الاستبيانُ الشهريُّ داخلَ الموقع لا في استمارةِ Google.
 *
 * ولماذا نُقل من الاستمارة أصلاً؟ سؤالٌ واحدٌ هو السبب: «الأيامُ التي لا
 * تستطيع المناوبةَ فيها». كان نصّاً حرّاً، فجاء في شيتِ الشهر الماضي **٨٩
 * جواباً بـ٨٨ صيغةً مختلفة**: «من ١٥ حتى ٣٠»، و«١/١٠»، و«أيام الجمعة»،
 * و«آخر ١٢ يوم». وبانٍ للجدولِ يقرأ هذه لا يستطيع أن يَبنيَ شيئاً آلياً،
 * ولا أن يَأمن أنه فهم. واستمارةُ Google لا تَملك رزنامةً متعدّدةَ الاختيار:
 * نوعُ «تاريخ» فيها يومٌ واحدٌ لا غير. فكانت الرزنامةُ هي علّةَ النقل.
 *
 * وما دام السؤالُ نُقل، نُقل معه ما كان يُكتب بالخطأ أيضاً: **الاسمُ يُختار
 * من اللائحة** لا يُكتب (فلا «محمد كامل شنطه» مقابل «محمد سعيد محمد كامل
 * شنطه»)، والاختصارُ والهاتفُ والفرزُ تُعبَّأ من الشيت نفسِه. فلم يَبقَ
 * نصّاً حرّاً إلا ما هو رأيٌ فعلاً.
 *
 * والبريدُ: مَن أرسل الجوابَ يُعرف. فإن ضُبط معرّفُ OAuth كان الدخولُ بحساب
 * Google وبريدُه موثَّقٌ من Google نفسِها؛ وإلا سُئل عن بريدِه وطُوبِق ببُرُدِ
 * من أجاب الشهرَ الماضي. والخادمُ هو الذي يَحكم في الحالتين، لا هذه الصفحة.
 *
 * والحفظُ: صفٌّ واحدٌ لكلِّ بريد، والإرسالُ الثاني يَستبدل الأوّلَ ويُؤرشفه.
 * فمسؤولُ الجدول لا يَقرأ جوابَين متعارضَين لشخصٍ واحدٍ فيَحتار.
 *
 * التفصيلُ الكامل وخطواتُ النشر: 4-التوثيق/استبيان-الشهر-على-الموقع.md
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const esc = s => AUH.text.escapeHtml(String(s == null ? '' : s));
  const { normAr } = AUH.text;
  const { MONTH_NAMES, DAY_NAMES, CALENDAR_DAY_HEADERS } = AUH.constants;
  const log = AUH.log;

  /* ═══════════════════════════ الحالة ═══════════════════════════ */

  /** مسوّدةُ ما يُكتب الآن (قبل الدخول وبعده)، لمقيمٍ واحدٍ على هذا المتصفّح. */
  const DRAFT_KEY = 'survey_form_draft_v1';

  /** آخرُ جوابٍ **أُرسل فعلاً**، مفهرَساً بالبريد. يَبقى بعد الإرسال لا يُمحى. */
  const LAST_KEY = 'survey_form_last_v1';

  const state = {
    step: 'gate',        // gate · form · sent
    session: null,       // { nonce, email, verified, answered, prev, idToken, reqId }
    busy: '',            // نصُّ العمليةِ الجارية ('' = لا شيء)
    gateError: '',
    formError: '',
    fieldErrors: {},
    saved: null,         // { replaced }
    answers: blankAnswers(),
    emailTyped: '',
    prefilledFrom: '',   // server · local · draft · '' — لإخبارِ المقيمِ من أين جاء ما يراه
    serverAnswer: null,  // نسخةُ الخادم كما وصلت، ليُستعاد إليها بزرّ
    toppedUpFor: '',     // لمن أُكملت الحقولُ من اللائحة — فلا تُكرَّر عليه
    signature: ''        // بصمةُ ما بُني، لمنعِ إعادةِ بناءٍ تَمسح ما كُتب
  };

  function blankAnswers() {
    return {
      name: '', abbr: '', phone: '', rotation: '',
      reliefCount: '', difficulty: '',
      days: [], reason: '', leave: '',
      notes: '', scheduleRating: '', scheduleProblems: ''
    };
  }

  function cfg() {
    return (AUH.config && AUH.config.surveyForm) || {};
  }

  function monthInfo() {
    const c = cfg();
    const month = Number(c.month) || 11;
    const year = Number(c.year) || new Date().getFullYear();
    const days = new Date(year, month, 0).getDate();
    return { month, year, days, label: MONTH_NAMES[month - 1] + ' ' + year };
  }

  function prevMonthInfo() {
    const c = cfg();
    const month = Number(c.ratedMonth) || 10;
    return { month, label: MONTH_NAMES[month - 1] };
  }

  function isoOf(day) {
    const { month, year } = monthInfo();
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /* ═════════════════════════ المسوّدة ═════════════════════════ */

  /**
   * تُحفظ المسوّدةُ عند كلِّ تغيير. والسببُ واقعيّ: الاستبيانُ يُعبَّأ من
   * الهاتف وبين مناوبتَين، وإغلاقُ التبويبِ بالخطأ كان سيَعني إعادةَ كلِّ
   * شيءٍ — فيَترك المقيمُ الاستبيانَ ولا يُعبّئه.
   */
  /**
   * المسوّدةُ مربوطةٌ **ببريد صاحبها**.
   *
   * هاتفٌ واحدٌ قد يُعبّئ منه زميلان في الإسعاف؛ ومسوّدةٌ بلا صاحبٍ كانت
   * ستَظهر للثاني جوابَ الأوّل — وهو خطأٌ أسوأُ من ضياع المسوّدة نفسِها.
   */
  function saveDraft() {
    const email = state.session ? state.session.email : '';
    if (!email) return;
    try {
      AUH.storage.set(DRAFT_KEY, JSON.stringify({ email, ts: Date.now(), answers: state.answers }));
    } catch (err) { /* لا يُعطّل التعبئة */ }
  }

  function readDraft(email) {
    if (!email) return null;
    try {
      const raw = AUH.storage.get(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.email !== email) return null;
      return sanitizeAnswers(d.answers);
    } catch (err) { return null; }   // مسوّدةٌ تالفة تُهمَل بلا ضجّة
  }

  function clearDraft() {
    try { AUH.storage.remove(DRAFT_KEY); } catch (err) {}
  }

  /**
   * آخرُ جوابٍ أُرسل، لكلِّ بريدٍ على حدة.
   *
   * ولماذا بالبريد لا بإطلاق؟ لأن هاتفاً واحداً قد يُعبّئ منه زميلان، فلو
   * حُفظ جوابٌ واحدٌ لظهر جوابُ الأوّل للثاني — وهو أسوأُ من ألّا يُحفظ شيء.
   */
  function readLast(email) {
    if (!email) return null;
    try {
      const all = JSON.parse(AUH.storage.get(LAST_KEY) || '{}');
      return all && all[email] ? sanitizeAnswers(all[email]) : null;
    } catch (err) { return null; }
  }

  function writeLast(email, answers) {
    if (!email) return;
    try {
      let all = {};
      try { all = JSON.parse(AUH.storage.get(LAST_KEY) || '{}') || {}; } catch (err) { all = {}; }
      all[email] = answers;
      AUH.storage.set(LAST_KEY, JSON.stringify(all));
    } catch (err) { /* امتلأت الذاكرة أو مُنعت — لا يُعطّل الإرسال */ }
  }

  /** يَقبل شكلَ الجواب من أيِّ مصدر (الخادم أو الذاكرة) ويُنقّيه إلى شكلٍ واحد. */
  function sanitizeAnswers(d) {
    if (!d || typeof d !== 'object') return null;
    const maxDay = monthInfo().days;
    const a = blankAnswers();
    Object.keys(a).forEach(k => {
      if (k === 'days') {
        a.days = Array.isArray(d.days)
          ? d.days.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= maxDay)
          : [];
      } else if (typeof d[k] === 'string' || typeof d[k] === 'number') {
        a[k] = String(d[k]);
      }
    });
    return a;
  }

  function hasContent(a) {
    if (!a) return false;
    return !!(a.name || a.days.length || a.reason || a.notes || a.scheduleProblems ||
              a.difficulty || a.scheduleRating || a.rotation);
  }

  /* ═════════════════════════ اللائحة ═════════════════════════ */

  function roster() {
    const app = global.app;
    const model = app && app.rosterModelFor ? app.rosterModelFor(1) : (app && app.residentsModel);
    return (model && model.residents) || [];
  }

  function rosterModel() {
    const app = global.app;
    return app && app.rosterModelFor ? app.rosterModelFor(1) : (app && app.residentsModel);
  }

  /** يُعبّئ الاختصارَ والهاتفَ وفرزَ الشهر المُقيَّم من الشيت نفسِه. */
  /**
   * يُعيد `true` إن وَجد المقيمَ في اللائحة فعلاً.
   *
   * و**لا يَطمس ما فيه قيمة** إلا بطلبٍ صريح (`force`): المقيمُ قد يُصحّح
   * هاتفَه أو فرزَه، فلا يُعاد عليه القديمُ من الشيت كلّما أُعيد الرسم.
   */
  function fillFromRoster(name, opts) {
    const model = rosterModel();
    if (!model) return false;
    const r = (model.residents || []).find(x => x.name === name);
    if (!r) return false;

    const force = !!(opts && opts.force);
    const a = state.answers;
    const m = prevMonthInfo().month;
    const rot = (model.getShift ? model.getShift(r, m) : (r.shifts || {})[m]) || '';

    if (force || !a.abbr) a.abbr = r.abbr || '';
    if (force || !a.phone) a.phone = r.phone || '';
    if (force || !a.rotation) a.rotation = rot;
    return true;
  }

  /**
   * يُكمل ما نَقص من اللائحة **متى وصلت**.
   *
   * وهذا ليس احتياطاً نظريّاً: على الهاتف تَصل لائحةُ المقيمين بعد أن يَفرغ
   * المقيمُ من كتابة بريده، فيُبنى النموذجُ ولائحتُه فارغة، فيَبقى الاختصارُ
   * والهاتفُ والفرزُ فارغةً أبداً — لأن الملءَ كان يَحدث مرّةً واحدةً عند
   * التحقّق ولا يُعاد. وعلى اللابتوب تَصل اللائحةُ قبلَه فيَعمل، فيَظهر
   * العطلُ «على الموبايل فقط» وهو في الحقيقة عطلُ توقيتٍ لا عطلُ جهاز.
   */
  function topUpFromRoster() {
    const a = state.answers;
    if (state.step !== 'form' || !a.name) return false;
    if (a.abbr && a.phone && a.rotation) return false;

    /*
     * مرّةً واحدةً لكلِّ اسم. فلو تكرّر مع كلِّ رسمٍ لَعاد الهاتفُ الذي
     * محاه المقيمُ عمداً بعد دقائقَ من تحديثِ البيانات الدوريّ — يُصحّح
     * الموقعُ للمقيمِ ما قصَده، وهو أسوأُ من ألّا يُكمل أصلاً.
     */
    if (state.toppedUpFor === a.name) return false;

    if (!fillFromRoster(a.name)) return false;
    state.toppedUpFor = a.name;
    saveDraft();
    return true;
  }

  /* ═══════════ الربطُ بين البريد والاسم — من شيت الشهر الماضي ═══════════ */

  /*
   * تَقرأ الصفحةُ هذا الربطَ **بنفسها** لا تَنتظره من الخادم.
   *
   * والسبب عمليّ: نسخةُ السكربت المنشورة قد تَسبق هذا الربطَ أو تَتأخّر عنه،
   * فلو عُلّق الملءُ التلقائيُّ على ما يُرسله الخادمُ لَبقي معطَّلاً حتى تُنشَر
   * نسخةٌ جديدة. وشيتُ الشهر الماضي عامٌّ يُقرأ كما تُقرأ بقيّةُ شيتات الموقع.
   *
   * ويُقرأ **باستعلامٍ مُوجَّه** لا بتنزيل الورقة: الورقةُ فيها بريدُ كلِّ
   * مقيمٍ وهاتفُه ونصوصُ طلباته، وتنزيلُها إلى متصفّح كلِّ زائرٍ تسريبٌ لا
   * مبرّر له. فلا يَصل إلا الصفُّ المسؤولُ عنه السؤال.
   *
   * وما هنا **تسهيلٌ ومنعُ خطأ**، لا حراسة: الحراسةُ في Apps Script، لأن مَن
   * أراد العبثَ تجاوز الصفحةَ وأرسل إلى الرابط مباشرةً.
   */

  const identityCache = { byEmail: {}, byName: {} };

  function prevSheetId() {
    return (AUH.config.spreadsheets && AUH.config.spreadsheets.survey) || '';
  }

  /** يُنقّي قيمةً قبل وضعها في استعلام gviz. */
  function q(v) {
    return String(v == null ? '' : v).replace(/['\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** الاسمُ المقترنُ بهذا البريد في استبيان الشهر الماضي، أو `''`. */
  async function lookupNameByEmail(email) {
    const key = String(email || '').toLowerCase();
    if (!key) return '';
    if (identityCache.byEmail[key] !== undefined) return identityCache.byEmail[key];

    let name = '';
    try {
      const rows = await AUH.data.gviz.fetchQuery(
        prevSheetId(), '0',
        `select B, C where lower(B) = '${q(key).toLowerCase()}'`,
        'ربط البريد بالاسم'
      );
      if (rows && rows.length > 1) {
        for (let i = rows.length - 1; i >= 1; i--) {
          const v = String(rows[i][1] == null ? '' : rows[i][1]).trim();
          if (v) { name = v; break; }               // آخرُ صفٍّ هو الأحدث
        }
      }
    } catch (err) {
      // يُسجَّل ولا يُبتلع: `catch` الصامتُ هو ما أخفى خطأً حقيقيّاً هنا
      // (دالّةٌ غيرُ مستورَدة) فبدا الفحصُ كأنه عمل ولم يَعمل.
      log.warn('surveyForm', 'تعذّر ربطُ البريد بالاسم: ' + (err && err.message));
    }

    identityCache.byEmail[key] = name;
    return name;
  }

  /**
   * هل هذا الاسمُ مقترنٌ ببريدٍ في الشهر الماضي؟ يُعيد البريدَ أو `''`.
   *
   * ويُستعلم بكلمتَين من الاسم (الأولى والأخيرة) لا بالاسم كاملاً، لأن
   * المطابقةَ الحرفيّةَ تَسقط على فراغٍ زائدٍ أو همزةٍ مختلفة. ثم تُقارَن
   * النتائجُ القليلةُ بالتطبيع العربي هنا.
   */
  async function lookupEmailByName(name) {
    const full = String(name || '').trim();
    if (!full) return '';
    const key = normAr(full);
    if (identityCache.byName[key] !== undefined) return identityCache.byName[key];

    const parts = full.split(/\s+/).filter(Boolean);
    const probes = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
    const where = probes.map(w => `C contains '${q(w)}'`).join(' and ');

    let owner = '';
    try {
      const rows = await AUH.data.gviz.fetchQuery(
        prevSheetId(), '0', `select B, C where ${where}`, 'صاحبُ الاسم'
      );
      if (rows && rows.length > 1) {
        for (let i = 1; i < rows.length; i++) {
          const nm = String(rows[i][1] == null ? '' : rows[i][1]).trim();
          const em = String(rows[i][0] == null ? '' : rows[i][0]).trim().toLowerCase();
          if (nm && em && normAr(nm) === key) { owner = em; break; }
        }
      }
    } catch (err) {
      log.warn('surveyForm', 'تعذّرت قراءةُ صاحبِ الاسم: ' + (err && err.message));
      identityCache.byName[key] = undefined;       // لا نُثبّت نتيجةً خاطئة
      throw err;                                   // ليَظهر أثرُه في الإرسال
    }

    identityCache.byName[key] = owner;
    return owner;
  }

  /* ═══════════════════════ الدخولُ بـ Google ═══════════════════════ */

  let gisLoading = null;

  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.id) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise((resolve, reject) => {
      const s = global.document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => { gisLoading = null; reject(new Error('تعذّر تحميل خدمة الدخول من Google.')); };
      global.document.head.appendChild(s);
    });
    return gisLoading;
  }

  function mountGoogleButton(host) {
    const clientId = String(cfg().googleClientId || '').trim();
    if (!clientId || !host) return;

    loadGis().then(() => {
      try {
        global.google.accounts.id.initialize({
          client_id: clientId,
          callback: resp => onGoogleCredential(resp && resp.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true
        });
        host.innerHTML = '';
        global.google.accounts.id.renderButton(host, {
          theme: 'filled_blue', size: 'large', text: 'signin_with',
          shape: 'pill', locale: 'ar', width: 260
        });
      } catch (err) {
        host.innerHTML = '<div class="sf-note sf-bad">تعذّر تجهيز زرِّ الدخول: ' + esc(err.message || err) + '</div>';
      }
    }, err => {
      host.innerHTML = '<div class="sf-note sf-bad">' + esc(err.message || err) +
        ' قد يكون السببُ حجبَ خدمات Google — جرّب VPN أو متصفّحاً آخر.</div>';
    });
  }

  function onGoogleCredential(credential) {
    if (!credential) { state.gateError = 'لم يَرجع تسجيلُ الدخول برمزٍ. أعد المحاولة.'; render({ rebuild: true }); return; }
    authenticate({ idToken: credential });
  }

  /* ═══════════════════════════ التحقّق ═══════════════════════════ */

  function authenticate(credentials) {
    const api = AUH.data.surveySubmit;
    state.busy = ' ';
    state.gateError = '';
    render({ rebuild: true });

    api.authenticate(credentials).then(async d => {
      state.session = {
        nonce: d.nonce, email: d.email, verified: d.verified,
        answered: !!d.answered, prev: d.prev || null,
        boundName: d.boundName || '',
        idToken: credentials.idToken || ''
      };

      /*
       * الخادمُ قد لا يُرسل الاسمَ المقترن (نسخةٌ منشورةٌ أقدم). فنَقرأه من
       * شيت الشهر الماضي مباشرةً — فلا يَتعطّل الملءُ التلقائيُّ أبداً
       * بسبب نسخةٍ لم تُنشَر بعد.
       */
      if (!state.session.boundName) {
        try { state.session.boundName = await lookupNameByEmail(d.email); } catch (err) {}
      }

      state.busy = '';
      state.step = 'form';
      prefill();
      render({ rebuild: true });
      focusFirstField();
    }, err => {
      state.busy = '';
      state.gateError = err && err.message ? err.message : 'تعذّر التحقّق.';
      render({ rebuild: true });
    });
  }

  /**
   * يَملأ النموذجَ بأفضلِ ما هو موجود — وهذا أهمُّ من ترتيبِه الظاهر.
   *
   * ١) جوابُ الخادم: النسخةُ التي لا تضيع، وتَصل من أيِّ جهاز.
   * ٢) نسخةُ هذا المتصفّح لهذا البريد: تُنقذ حين يتعذّر على الخادم إعادتُها.
   * ٣) مسوّدةٌ لم تُرسل بعد: أهمُّ من الاثنتين إن كانت أحدثَ عملٍ للمقيم —
   *    فمن كتب نصف جوابه ثم أغلق التبويب يَنتظر أن يَجده كما تركه، لا أن
   *    يُمحى بجوابٍ أرسله قبل أسبوع.
   *
   * ولذلك الترتيبُ: الخادمُ ثم الذاكرةُ أساساً، والمسوّدةُ تَعلو عليهما إن
   * كان فيها شيءٌ مكتوب.
   */
  function prefill() {
    const email = state.session ? state.session.email : '';
    const fromServer = sanitizeAnswers(state.session && state.session.prev);
    const fromLocal = readLast(email);
    const draft = readDraft(email);

    state.serverAnswer = hasContent(fromServer) ? fromServer : null;

    let base, from;
    if (hasContent(draft))           { base = draft;      from = 'draft'; }
    else if (hasContent(fromServer)) { base = fromServer; from = 'server'; }
    else if (hasContent(fromLocal))  { base = fromLocal;  from = 'local'; }
    else                             { base = blankAnswers(); from = ''; }

    state.answers = base;
    state.prefilledFrom = from;
    state.toppedUpFor = '';

    /*
     * الاسمُ المقترنُ بالبريد في استبيان الشهر الماضي يَعلو على المسوّدة
     * وعلى كلِّ مصدر: هو المرجعُ، والخادمُ لا يَقبل سواه على كلِّ حال. فلو
     * تُرك ما في المسوّدةِ ظاهراً لَملأ المقيمُ النموذجَ كلَّه ثم رُفض عند
     * الإرسال — وهو أسوأُ من أن يَجد اسمَه مُثبَّتاً من البداية.
     */
    const bound = state.session && state.session.boundName;
    if (bound) state.answers.name = bound;

    if (state.answers.name && !state.answers.abbr) fillFromRoster(state.answers.name);

    /*
     * **لا تُكتب مسوّدةٌ هنا.** المسوّدةُ أثرُ يدِ المقيم لا أثرُ فتحِه
     * الصفحة؛ ولو كُتبت عند كلِّ فتحٍ لصارت المسوّدةُ نسخةً من الجوابِ
     * المسجَّل تَعلو عليه أبداً — فمَن عدّل جوابَه من هاتفٍ ثم فتح الصفحةَ
     * من حاسوبٍ فتح فيه الصفحةَ قبلاً، رأى القديمَ وأرسله فوق الجديد.
     * ولذلك أيضاً يُعرض زرُّ «استعادة جوابي المسجَّل» حين تَسبق المسوّدةُ
     * جواباً مسجَّلاً: الاختيارُ للمقيم، لا تخمينٌ منّا.
     */
  }

  /** يُلغي المسوّدةَ ويَعود إلى الجوابِ المحفوظ على الخادم. */
  function restoreServerAnswer() {
    if (!state.serverAnswer) return;
    state.answers = JSON.parse(JSON.stringify(state.serverAnswer));
    state.prefilledFrom = 'server';
    state.fieldErrors = {};
    state.formError = '';
    clearDraft();
    render({ rebuild: true });
  }

  function signOut() {
    try {
      if (global.google && global.google.accounts && global.google.accounts.id) {
        global.google.accounts.id.disableAutoSelect();
      }
    } catch (err) {}
    state.session = null;
    state.step = 'gate';
    state.saved = null;
    state.gateError = '';
    render({ rebuild: true });
  }

  /* ═════════════════════ التحقّقُ في الصفحة ═════════════════════ */

  /**
   * تحقّقٌ **تسهيليٌّ لا حاكم**: الحكمُ في Apps Script، لأن مَن أراد العبثَ
   * تجاوز الصفحةَ وأرسل إلى الرابط مباشرةً. وفائدتُه أن يُصحّح المقيمُ خطأه
   * قبل أن يَنتظر جوابَ الخادم.
   */
  function validateLocal() {
    const a = state.answers;
    const e = {};
    const names = roster().map(r => r.name);

    if (!a.name) e.name = 'اختر اسمَك من القائمة.';
    else if (names.indexOf(a.name) < 0) e.name = 'هذا الاسمُ ليس في لائحة المقيمين.';

    if (a.phone && !/^\+?\d{7,15}$/.test(a.phone.replace(/[^\d+]/g, ''))) e.phone = 'رقمٌ غيرُ صالح.';
    if (!a.rotation.trim()) e.rotation = 'اكتب فرزَك في شهر ' + prevMonthInfo().label + '.';

    const relief = Number(a.reliefCount);
    if (a.reliefCount === '' || !Number.isInteger(relief) || relief < 0 || relief > 31) {
      e.reliefCount = 'رقمٌ بين 0 و31.';
    }
    if (!a.difficulty) e.difficulty = 'اختر درجةً من 1 إلى 10.';
    if (!a.scheduleRating) e.scheduleRating = 'اختر درجةً من 1 إلى 10.';

    if (a.days.length) {
      if (!a.reason.trim()) e.reason = 'ذكرُ السبب إلزاميٌّ عند اختيار أيام — لن يُقبل الطلبُ دونه.';
      if (a.leave !== 'نعم' && a.leave !== 'لا') e.leave = 'أجِب بنعم أو لا.';
    }

    state.fieldErrors = e;
    return Object.keys(e).length === 0;
  }

  const FIELD_ORDER = ['name', 'phone', 'rotation', 'reliefCount', 'difficulty', 'reason', 'leave', 'scheduleRating'];

  function focusFirstError() {
    const first = FIELD_ORDER.find(k => state.fieldErrors[k]);
    if (!first) return;
    const el = global.document.querySelector('[data-field="' + first + '"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = el.querySelector('input,select,textarea,button');
    if (focusable) { try { focusable.focus({ preventScroll: true }); } catch (err) { focusable.focus(); } }
  }

  function focusFirstField() {
    const el = global.document.getElementById('sfNameSearch');
    if (el) { try { el.focus({ preventScroll: true }); } catch (err) {} }
  }

  /* ═══════════════════════════ الإرسال ═══════════════════════════ */

  async function doSubmit() {
    if (state.busy) return;
    state.formError = '';

    if (!validateLocal()) {
      state.formError = 'راجِع الحقولَ المُعلَّمة بالأحمر.';
      render({ rebuild: true });
      focusFirstError();
      return;
    }

    /*
     * اسمٌ مقترنٌ ببريدٍ آخر: يُوقَف هنا قبل الإرسال.
     *
     * والفحصُ عند الضغط لا عند الاختيار، لأنه يَحتاج طلبَ شبكة — فلا يُثقَّل
     * كلُّ نقرةٍ في القائمة. والخادمُ يُعيد الفحصَ على كلِّ حال.
     */
    if (!state.session.boundName) {
      state.busy = ' ';
      render({ rebuild: true });
      let owner = '', lookupFailed = false;
      try {
        owner = await lookupEmailByName(state.answers.name);
      } catch (err) {
        lookupFailed = true;
        log.warn('surveyForm', 'فحصُ الاسم تعذّر: ' + (err && err.message));
      }
      state.busy = '';

      if (lookupFailed) {
        // لا نَمرّ على فحصٍ لم يَجرِ: الخادمُ هو الحَكَم، لكنّ المقيمَ يُخبَر.
        state.formError = 'تعذّر التحقّق من الاسم الآن. أعد المحاولة بعد لحظات.';
        render({ rebuild: true });
        return;
      }

      if (owner && owner !== String(state.session.email || '').toLowerCase()) {
        state.fieldErrors.name = 'هذا الاسم مسجَّل ببريد آخر في استبيان الشهر الماضي.';
        state.formError = 'هذا الاسم مسجَّل ببريد آخر في استبيان الشهر الماضي. ' +
          'اكتب البريد الذي عبّأت به الشهر الماضي، أو راجع المسؤول إن تغيّر بريدك.';
        render({ rebuild: true });
        focusFirstError();
        return;
      }
    }

    const a = state.answers;
    const payload = {
      name: a.name,
      abbr: a.abbr,
      phone: a.phone,
      rotation: a.rotation.trim(),
      reliefCount: Number(a.reliefCount),
      difficulty: Number(a.difficulty),
      days: a.days.slice().sort((x, y) => x - y),
      reason: a.days.length ? a.reason.trim() : '',
      leave: a.days.length ? a.leave : '',
      notes: a.notes.trim(),
      scheduleRating: Number(a.scheduleRating),
      scheduleProblems: a.scheduleProblems.trim()
    };

    state.busy = 'جارٍ الإرسال…';
    render({ rebuild: true });

    AUH.data.surveySubmit.submit(state.session, payload).then(d => {
      state.busy = '';
      state.saved = { replaced: !!d.replaced };
      state.step = 'sent';
      // النسخةُ الأخيرة تُحفظ ولا تُمحى: مَن أراد تعديلَ حرفٍ لا يُعيد كتابةَ
      // كلِّ شيء. والمسوّدةُ تُمحى لأنها صارت هي نفسَها الجوابَ المُرسل.
      writeLast(state.session.email, JSON.parse(JSON.stringify(state.answers)));
      clearDraft();
      render({ rebuild: true });
      const host = global.document.getElementById('survey11Host');
      if (host) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, err => {
      state.busy = '';

      if (err && err.code === 'session') {
        /*
         * الجلسةُ انتهت على الخادم: إعادةُ المحاولةِ لن تَنجح مهما تكرّرت،
         * فالصحيحُ إعادتُه إلى تسجيل الدخول لا نصحُه بالمحاولة. وإجاباتُه
         * محفوظةٌ في المسوّدة (تُكتب عند كلِّ تعديل)، فيَجدها كما تركها
         * بمجرّد أن يَدخل.
         */
        saveDraft();
        state.step = 'gate';
        state.gateError = err.message || 'انتهت جلسةُ الدخول. سجّل الدخول مرّةً أخرى — إجاباتُك محفوظة.';
        state.session = null;
        render({ rebuild: true });
        return;
      }

      state.formError = (err && err.message ? err.message : 'تعذّر الإرسال.') +
        ' — جوابُك محفوظٌ في هذا المتصفّح، فأعد المحاولةَ بلا إعادةِ تعبئة.';
      render({ rebuild: true });
    });
  }

  function editAgain() {
    state.step = 'form';
    state.saved = null;
    state.formError = '';
    // معرّفٌ جديد: هذا طلبٌ جديدٌ يَستبدل، لا إعادةُ إرسالِ الطلبِ نفسِه.
    if (state.session) state.session.reqId = AUH.data.surveySubmit.newId();
    if (state.session) state.session.answered = true;
    render({ rebuild: true });
  }

  /* ═══════════════════════════ الرسم ═══════════════════════════ */

  function render(opts) {
    const host = global.document.getElementById('survey11Host');
    if (!host) return;

    // اللائحةُ قد تكون وصلت الآن: نُكمل ما نَقص قبل أن نُقرّر هل نُعيد البناء.
    const toppedUp = topUpFromRoster();

    /*
     * بصمةٌ تَمنع إعادةَ البناء العابثة. فالموقعُ يُحدّث بياناتَه كلَّ ثلاث
     * دقائقَ ويُعيد رسمَ التبويبِ النشط — ولو أُعيد بناءُ النموذجِ حينها
     * لفَقَد المقيمُ موضعَ المؤشّرِ وهو يكتب سببَه. فلا يُبنى إلا إن تغيّر
     * شيءٌ يَستحقُّ البناء.
     */
    const sig = [
      state.step, state.busy, state.gateError, state.formError,
      state.session ? state.session.email + '|' + state.session.verified + '|' +
                      state.session.answered + '|' + (state.session.boundName || '') : '-',
      Object.keys(state.fieldErrors).join(','),
      state.prefilledFrom,
      roster().length,
      [state.answers.abbr, state.answers.phone, state.answers.rotation].map(v => v ? '1' : '0').join(''),
      state.saved ? 'saved' : '-'
    ].join('¦');

    if (!(opts && opts.rebuild) && sig === state.signature && host.childElementCount) return;

    /*
     * امتلأت الحقولُ الآن والنموذجُ مبنيٌّ أصلاً: تُكتب القيمُ في مواضعها
     * مباشرةً بلا إعادةِ بناء — فمن كان يكتب سببَه لا يَفقد موضعَ مؤشّره.
     */
    if (toppedUp && !(opts && opts.rebuild) && host.childElementCount && host.querySelector('#sfAbbr')) {
      syncIdentityInputs(host);
      state.signature = sig;
      return;
    }

    state.signature = sig;

    host.innerHTML = build();
    wire(host);
  }

  function build() {
    const api = AUH.data.surveySubmit;
    if (!api.configured()) return notReadyCard();
    if (global.location && global.location.protocol === 'file:') return offlineFileCard();

    if (state.step === 'sent') return headCard() + sentCard();
    if (state.step === 'gate') return headCard() + gateCard();
    return headCard() + whoBar() + formCard();
  }

  function notReadyCard() {
    const m = monthInfo();
    return `
<div class="sf-wrap">
  <div class="sf-card sf-center">
    <div class="sf-big"><i class="fas fa-screwdriver-wrench"></i></div>
    <h3>استبيان ${esc(m.label)} — لم يُفتح بعد</h3>
    <p class="sf-note">لم يُضبط رابطُ الاستبيان في إعدادات الموقع بعد. راجِع
      <strong>د. علي شايب</strong>.</p>
    <p class="sf-note sf-dim">للمسؤول: اضبط <code>surveyForm.endpoint</code> في
      <code>js/core/config.js</code> برابطِ تطبيقِ Apps Script، كما في
      <code>4-التوثيق/استبيان-الشهر-على-الموقع.md</code>.</p>
  </div>
</div>`;
  }

  /**
   * الموقعُ يَعمل من القرص (`file://`) — وهذا مقصودٌ ومُصانٌ في بقيّة
   * التبويبات. لكنّ الإرسالَ يَحتاج طلبَ شبكةٍ من أصلٍ حقيقي، فلا يُترك
   * المقيمُ يُعبّئ عشر دقائقَ ثم يُفاجأ بأن الإرسال لا يَصل.
   */
  function offlineFileCard() {
    return `
<div class="sf-wrap">
  <div class="sf-card sf-center">
    <div class="sf-big"><i class="fas fa-wifi"></i></div>
    <h3>افتح الموقعَ من الإنترنت لتُعبّئ الاستبيان</h3>
    <p class="sf-note">أنت تَفتح الموقعَ من ملفٍّ على جهازك، والإرسالُ يَحتاج
      اتصالاً. بقيّةُ التبويبات تعمل كما هي — أمّا الاستبيان فافتحه من رابط
      الموقع.</p>
  </div>
</div>`;
  }

  function headCard() {
    const m = monthInfo();
    return `
<div class="sf-head">
  <h2>استبيان شهر ${esc(String(m.month))}</h2>
</div>`;
  }

  /* ──────────────────────────── بوّابةُ الهويّة ──────────────────────────── */

  function gateCard() {
    const useGoogle = !!String(cfg().googleClientId || '').trim();
    const busy = state.busy
      ? `<div class="sf-busy"><i class="fas fa-spinner fa-spin"></i> ${esc(state.busy)}</div>` : '';
    const err = state.gateError
      ? `<div class="sf-note sf-bad"><i class="fas fa-circle-exclamation"></i> ${esc(state.gateError)}</div>` : '';

    const body = useGoogle ? `
    <div class="sf-gate-why">
      <i class="fas fa-shield-halved"></i>
      <div>
        <strong>سجّل الدخولَ بحساب Google أوّلاً.</strong>
        <span>ليُعرَف أن الجوابَ منك — فلا يُرسل أحدٌ جواباً باسمِك، ولتَستطيع
        تعديلَ جوابِك لاحقاً. ولا نرى من حسابِك إلا بريدَك.</span>
      </div>
    </div>
    <div class="sf-gbtn" id="sfGoogleBtn"><i class="fas fa-spinner fa-spin"></i> جارٍ تجهيز زرِّ الدخول…</div>
    <p class="sf-note sf-dim">إن كانت خدماتُ Google محجوبةً عندك فشغّل VPN، أو عبّئ من هاتفِك.</p>
    ` : `
    <div class="sf-gate-why">
      <i class="fas fa-envelope-circle-check"></i>
      <div>
        <strong>اكتب بريدَك الإلكتروني.</strong>
        <span>به يُعرَف أن الجوابَ منك، وبه تُعدّل جوابَك لاحقاً.</span>
      </div>
    </div>
    <div class="sf-row sf-row-tight">
      <input class="sf-input" id="sfEmail" type="email" inputmode="email" dir="ltr"
             autocomplete="email" placeholder="name@gmail.com" value="${esc(state.emailTyped)}">
      <button class="sf-btn sf-btn-main" id="sfEmailGo" type="button">
        <i class="fas fa-arrow-left"></i> متابعة
      </button>
    </div>
    `;

    return `
<div class="sf-wrap">
  <div class="sf-card sf-gate">
    ${body}
    ${busy}
    ${err}
  </div>
</div>`;
  }

  function whoBar() {
    const s = state.session || {};
    const badge = s.verified === 'Google' ? 'موثَّق من Google'
      : s.verified === 'Google (جديد)' ? 'موثَّق من Google — بريدٌ جديد'
      : s.verified === 'جديد' ? 'بريدٌ جديد'
      : 'مُطابَقٌ ببُرُدِ الشهر الماضي';

    const from = state.prefilledFrom;
    const filled = from === 'server'
        ? 'عُبّئت الحقولُ بجوابِك المسجَّل — عدّل ما تشاء وأرسل.'
      : from === 'local'
        ? 'عُبّئت الحقولُ بآخرِ جوابٍ أرسلتَه من هذا المتصفّح — عدّل ما تشاء وأرسل.'
      : from === 'draft'
        ? 'عُبّئت الحقولُ بما كنتَ تكتبه ولم تُرسله بعد.'
        : '';

    // مسوّدةٌ غيرُ مُرسلةٍ فوق جوابٍ مسجَّل: يُعرض الطريقان، ويَختار هو.
    const restore = (from === 'draft' && state.serverAnswer) ? `
      <button class="sf-btn sf-btn-ghost sf-btn-sm" id="sfRestore" type="button">
        <i class="fas fa-rotate-left"></i> استعادةُ جوابي المسجَّل
      </button>` : '';

    const answered = s.answered ? `
    <div class="sf-note sf-warn">
      <i class="fas fa-circle-info"></i>
      <span>لك جوابٌ مسجَّلٌ سابقاً${s.prev && s.prev.when ? ' (' + esc(s.prev.when) + ')' : ''}.
      الإرسالُ الآن <strong>يَستبدله</strong> — ويُحفظ القديمُ في الأرشيف.
      ${filled ? '<br>' + esc(filled) : ''}</span>
      ${restore}
    </div>` : (filled ? `
    <div class="sf-note sf-warn">
      <i class="fas fa-rotate-left"></i> <span>${esc(filled)}</span>
    </div>` : '');

    return `
<div class="sf-who">
  <div class="sf-who-id">
    <i class="fas fa-circle-user"></i>
    <span dir="ltr">${esc(s.email || '')}</span>
    <span class="sf-badge">${esc(badge)}</span>
  </div>
  <button class="sf-btn sf-btn-ghost" id="sfSignOut" type="button">
    <i class="fas fa-right-from-bracket"></i> لستُ أنا
  </button>
</div>
${answered}`;
  }

  /* ──────────────────────────── النموذج ──────────────────────────── */

  function errOf(k) {
    return state.fieldErrors[k]
      ? `<div class="sf-err"><i class="fas fa-circle-exclamation"></i> ${esc(state.fieldErrors[k])}</div>` : '';
  }

  function cls(k, base) {
    return base + (state.fieldErrors[k] ? ' sf-invalid' : '');
  }

  function formCard() {
    const a = state.answers;
    const m = monthInfo();
    const p = prevMonthInfo();
    const people = roster();
    const bound = !!(state.session && state.session.boundName);

    if (!people.length) {
      return `
<div class="sf-wrap"><div class="sf-card sf-center">
  <div class="sf-big"><i class="fas fa-spinner fa-spin"></i></div>
  <h3>جارٍ تحميل لائحة المقيمين…</h3>
  <p class="sf-note">الأسماءُ تُقرأ من شيت القسم نفسِه، ولا يُقبل اسمٌ ليس فيه.</p>
</div></div>`;
    }

    const options = people.map(r =>
      `<option value="${esc(r.name)}"${r.name === a.name ? ' selected' : ''}>${esc(r.name)}${r.abbr ? ' — ' + esc(r.abbr) : ''}</option>`
    ).join('');

    const busy = state.busy
      ? `<div class="sf-busy"><i class="fas fa-spinner fa-spin"></i> ${esc(state.busy)}</div>` : '';
    const err = state.formError
      ? `<div class="sf-note sf-bad"><i class="fas fa-circle-exclamation"></i> ${esc(state.formError)}</div>` : '';

    return `
<div class="sf-wrap">

  <!-- ١ · مَن أنت -->
  <section class="sf-card">
    <div class="sf-sec"><span class="sf-num">١</span><h3>مَن أنت</h3></div>

    ${bound ? `
    <div class="sf-field" data-field="name">
      <label>الاسم الثلاثي</label>
      <div class="sf-locked">
        <i class="fas fa-lock"></i>
        <span>${esc(a.name)}</span>
      </div>
      <div class="sf-hint">هذا الاسم مقترن ببريدك في استبيان الشهر الماضي.</div>
    </div>` : `
    <div class="sf-field" data-field="name">
      <label for="sfName">الاسم الثلاثي <span class="sf-req">*</span></label>
      <input class="sf-input sf-search" id="sfNameSearch" type="search" autocomplete="off"
             placeholder="ابحث باسمِك أو اختصارِك لتَضيق القائمة…">
      <select class="${cls('name', 'sf-input')}" id="sfName" size="1">
        <option value="">— اختر اسمَك —</option>
        ${options}
      </select>
      <div class="sf-hint" id="sfNameHint">${people.length} اسماً في اللائحة. الاختصارُ والهاتفُ والفرزُ تُعبَّأ تلقائياً.</div>
      ${errOf('name')}
    </div>`}

    <div class="sf-grid2">
      <div class="sf-field">
        <label for="sfAbbr">الاختصار</label>
        <input class="sf-input" id="sfAbbr" type="text" value="${esc(a.abbr)}" placeholder="—">
      </div>
      <div class="sf-field" data-field="phone">
        <label for="sfPhone">رقم الهاتف</label>
        <input class="${cls('phone', 'sf-input')}" id="sfPhone" type="tel" inputmode="tel" dir="ltr"
               value="${esc(a.phone)}" placeholder="09xxxxxxxx">
        ${errOf('phone')}
      </div>
    </div>
  </section>

  <!-- ٢ · فرزُ الشهر المُقيَّم -->
  <section class="sf-card">
    <div class="sf-sec"><span class="sf-num">٢</span><h3>فرزُك في شهر ${esc(String(p.month))} — ${esc(p.label)}</h3></div>

    <div class="sf-grid2">
      <div class="sf-field" data-field="rotation">
        <label for="sfRotation">الفرز <span class="sf-req">*</span></label>
        <input class="${cls('rotation', 'sf-input')}" id="sfRotation" type="text"
               value="${esc(a.rotation)}" placeholder="مثلاً: دموية">
        <div class="sf-hint">مُعبَّأٌ من شيت القسم — صحّحه إن كان خطأً.</div>
        ${errOf('rotation')}
      </div>
      <div class="sf-field" data-field="reliefCount">
        <label for="sfRelief">عدد التفريغات <span class="sf-req">*</span></label>
        <input class="${cls('reliefCount', 'sf-input')}" id="sfRelief" type="number"
               inputmode="numeric" min="0" max="31" step="1" value="${esc(a.reliefCount)}" placeholder="0">
        <div class="sf-hint">اكتب 0 إن لم يكن هناك تفريغ.</div>
        ${errOf('reliefCount')}
      </div>
    </div>

    <div class="sf-field" data-field="difficulty">
      <label>صعوبةُ الفرز من 10 <span class="sf-req">*</span></label>
      ${scale('difficulty', a.difficulty, 'سهلٌ جداً', 'صعبٌ جداً')}
      ${errOf('difficulty')}
    </div>
  </section>

  <!-- ٣ · الأيام -->
  <section class="sf-card sf-card-key">
    <div class="sf-sec"><span class="sf-num">٣</span><h3>الأيامُ التي لا تستطيع المناوبةَ فيها — ${esc(m.label)}</h3></div>
    <p class="sf-note">اضغط على الأيام في الرزنامة. اضغط مرّةً ثانيةً لإلغاء اليوم.
       <strong>لا تَكتب التواريخَ نصّاً</strong> — الرزنامةُ تُسجّلها بصيغةٍ واحدةٍ للجميع.</p>
    ${calendar(a.days)}
    <div class="sf-days-bar">
      <div id="sfDaysSummary" class="sf-days-summary">${daysSummaryHtml(a.days)}</div>
      <button class="sf-btn sf-btn-ghost" id="sfClearDays" type="button"${a.days.length ? '' : ' disabled'}>
        <i class="fas fa-eraser"></i> إلغاءُ كلِّ الأيام
      </button>
    </div>

    <div class="sf-cond" id="sfCond"${a.days.length ? '' : ' hidden'}>
      <div class="sf-field" data-field="reason">
        <label for="sfReason">سببُ عدم القدرة على المناوبة في هذه الأيام <span class="sf-req">*</span></label>
        <textarea class="${cls('reason', 'sf-input sf-area')}" id="sfReason" rows="3"
                  placeholder="مثلاً: سفرٌ إلى دمشق، امتحانُ اختصاص، مرضٌ في العائلة…">${esc(a.reason)}</textarea>
        <div class="sf-hint">ذكرُ السبب إلزاميٌّ — لن يُقبل الطلبُ دونه.</div>
        ${errOf('reason')}
      </div>

      <div class="sf-field" data-field="leave">
        <label>هل ستأخذ إجازةً في الأيام التي لن تُناوب فيها؟ <span class="sf-req">*</span></label>
        ${yesNo('leave', a.leave)}
        ${errOf('leave')}
      </div>
    </div>
  </section>

  <!-- ٤ · رزنامةُ الشهر الماضي -->
  <section class="sf-card">
    <div class="sf-sec"><span class="sf-num">٤</span><h3>رزنامةُ مناوباتك في شهر ${esc(String(p.month))}</h3></div>

    <div class="sf-field" data-field="scheduleRating">
      <label>تقييمُك لرزنامةِ مناوباتك من 10 <span class="sf-req">*</span></label>
      ${scale('scheduleRating', a.scheduleRating, 'سيّئةٌ جداً', 'ممتازة')}
      ${errOf('scheduleRating')}
    </div>

    <div class="sf-field">
      <label for="sfProblems">الأخطاءُ أو المشاكلُ التي تُودّ الإبلاغَ عنها</label>
      <textarea class="sf-input sf-area" id="sfProblems" rows="4"
                placeholder="مثلاً: مناوبتان في يومَين متتاليَين، مناوبةُ عطلةٍ مكرّرة، تعارضٌ مع فرزي…">${esc(a.scheduleProblems)}</textarea>
    </div>

    <div class="sf-field">
      <label for="sfNotes">ملاحظاتٌ إضافية</label>
      <textarea class="sf-input sf-area" id="sfNotes" rows="3"
                placeholder="أيُّ شيءٍ آخر تُريد أن يَعرفه بانو الجدول.">${esc(a.notes)}</textarea>
    </div>
  </section>

  <div class="sf-submit">
    ${err}
    ${busy}
    <button class="sf-btn sf-btn-main sf-btn-big" id="sfSubmit" type="button"${state.busy ? ' disabled' : ''}>
      <i class="fas fa-paper-plane"></i> ${state.session && state.session.answered ? 'تحديثُ جوابي' : 'إرسالُ جوابي'}
    </button>
  </div>
</div>`;
  }

  /** مقياسٌ من 1 إلى 10 — أزرارٌ لا قائمة، فالضغطةُ أسرعُ من فتحِ قائمةٍ واختيار. */
  function scale(key, value, lowLabel, highLabel) {
    const cells = [];
    for (let i = 1; i <= 10; i++) {
      cells.push(`<button type="button" class="sf-scale-btn${String(value) === String(i) ? ' on' : ''}"
        data-scale="${key}" data-value="${i}" aria-pressed="${String(value) === String(i)}">${i}</button>`);
    }
    return `
<div class="sf-scale">
  <span class="sf-scale-end">${esc(lowLabel)}</span>
  <div class="sf-scale-row">${cells.join('')}</div>
  <span class="sf-scale-end">${esc(highLabel)}</span>
</div>`;
  }

  function yesNo(key, value) {
    return `
<div class="sf-choice">
  <button type="button" class="sf-chip${value === 'نعم' ? ' on' : ''}" data-choice="${key}" data-value="نعم">
    <i class="fas fa-check"></i> نعم
  </button>
  <button type="button" class="sf-chip${value === 'لا' ? ' on' : ''}" data-choice="${key}" data-value="لا">
    <i class="fas fa-xmark"></i> لا
  </button>
</div>`;
  }

  /**
   * رزنامةُ الشهر — وهي جوهرُ هذه الصفحة.
   *
   * الأسبوعُ يبدأ بالاثنين كما في رزنامةِ المناوبات في هذا الموقع، فلا
   * يَقرأ المقيمُ شكلَين مختلفَين لرزنامةٍ واحدة. والعطلُ الرسميةُ تُعلَّم
   * من شيت العطل نفسِه — لأن مَن يَختار يومَ عطلةٍ يَنبغي أن يَعلم أنها عطلة.
   */
  function calendar(selected) {
    const { month, year, days } = monthInfo();
    const app = global.app;
    const picked = {};
    (selected || []).forEach(d => { picked[d] = true; });

    const first = new Date(year, month - 1, 1);
    const lead = (first.getDay() + 6) % 7;          // 0 = الاثنين

    const head = CALENDAR_DAY_HEADERS.map(h => `<div class="sf-cal-h">${esc(h)}</div>`).join('');

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="sf-cal-pad"></div>');

    for (let d = 1; d <= days; d++) {
      const iso = isoOf(d);
      const date = new Date(year, month - 1, d);
      const dow = date.getDay();
      const weekend = dow === 5 || dow === 6;       // الجمعة والسبت
      let holiday = '';
      try {
        if (app && app.getHolidayName) holiday = app.getHolidayName(iso) || '';
      } catch (err) { holiday = ''; }

      const title = DAY_NAMES[dow] + ' ' + d + ' ' + MONTH_NAMES[month - 1] + (holiday ? ' — ' + holiday : '');
      cells.push(`<button type="button"
        class="sf-cal-d${picked[d] ? ' on' : ''}${weekend ? ' we' : ''}${holiday ? ' hol' : ''}"
        data-day="${d}" aria-pressed="${!!picked[d]}" title="${esc(title)}">
        <span class="sf-cal-n">${d}</span>
        <span class="sf-cal-w">${esc(DAY_NAMES[dow])}</span>
        ${holiday ? '<span class="sf-cal-dot" aria-hidden="true"></span>' : ''}
      </button>`);
    }

    return `
<div class="sf-cal" id="sfCal" role="group" aria-label="أيامُ ${esc(MONTH_NAMES[month - 1])}">
  <div class="sf-cal-head">${head}</div>
  <div class="sf-cal-grid">${cells.join('')}</div>
  <div class="sf-cal-legend">
    <span><i class="sf-sw on"></i> مختار</span>
    <span><i class="sf-sw we"></i> جمعة/سبت</span>
    <span><i class="sf-sw hol"></i> عطلةٌ رسمية</span>
  </div>
</div>`;
  }

  function daysSummaryHtml(days) {
    if (!days.length) {
      return '<span class="sf-dim">لم تَختر أيّ يوم — أي أنك تستطيع المناوبةَ في كلِّ أيام الشهر.</span>';
    }
    const sorted = days.slice().sort((a, b) => a - b);
    const { month, year } = monthInfo();
    const chips = sorted.map(d => {
      const dow = new Date(year, month - 1, d).getDay();
      return `<span class="sf-day-chip">${d} <small>${esc(DAY_NAMES[dow])}</small></span>`;
    }).join('');
    return `<strong>${sorted.length} يوماً:</strong> <span class="sf-day-chips">${chips}</span>`;
  }

  /* ──────────────────────────── بعد الإرسال ──────────────────────────── */

  function sentCard() {
    const a = state.answers;
    const m = monthInfo();
    const p = prevMonthInfo();
    const replaced = state.saved && state.saved.replaced;

    const sorted = a.days.slice().sort((x, y) => x - y);
    const dayChips = sorted.length
      ? sorted.map(d => {
          const dow = new Date(m.year, m.month - 1, d).getDay();
          return `<span class="sf-day-chip">${d} <small>${esc(DAY_NAMES[dow])}</small></span>`;
        }).join('')
      : '<span class="sf-sum-none">لا شيء — تستطيع المناوبة في كلّ أيام الشهر</span>';

    /*
     * بنيةٌ مستقلّةٌ لا <table>.
     *
     * جداولُ هذا الموقع لها `min-width:850px` وتظليلُ صفوفٍ وتوسيطُ خلايا —
     * وهي قواعدُ عامّةٌ تَسري على أيِّ جدولٍ في الصفحة. فجدولُ التأكيد كان
     * يَرثها فيتمدّد داخل بطاقةٍ أضيقَ منه ويتبعثر. والقائمةُ هنا تَملك
     * تنسيقَها كاملاً، فلا تَرث ولا تُفاجئ.
     */
    const row = (label, value, extra) =>
      `<div class="sf-sum-row${extra ? ' ' + extra : ''}">
        <dt>${esc(label)}</dt>
        <dd>${value}</dd>
      </div>`;

    const rows = [
      row('الاسم', esc(a.name)),
      a.abbr ? row('الاختصار', esc(a.abbr)) : '',
      row('فرز شهر ' + p.month, esc(a.rotation)),
      row('عدد التفريغات', esc(a.reliefCount)),
      row('صعوبة الفرز', `<b>${esc(a.difficulty)}</b> <span class="sf-sum-of">/ 10</span>`),
      row('الأيام التي لا تستطيع المناوبة فيها',
          `<div class="sf-sum-days">${dayChips}</div>`, 'key'),
      a.days.length ? row('السبب', esc(a.reason)) : '',
      a.days.length ? row('إجازة في تلك الأيام', esc(a.leave)) : '',
      row('تقييم رزنامة شهر ' + p.month,
          `<b>${esc(a.scheduleRating)}</b> <span class="sf-sum-of">/ 10</span>`),
      a.scheduleProblems ? row('مشاكل الرزنامة', esc(a.scheduleProblems)) : '',
      a.notes ? row('ملاحظات', esc(a.notes)) : ''
    ].join('');

    return `
<div class="sf-wrap">
  <div class="sf-card sf-done">
    <div class="sf-done-top">
      <div class="sf-done-mark"><i class="fas fa-check"></i></div>
      <h3>${replaced ? 'حُدِّث جوابك' : 'وصل جوابك'}</h3>
      <p>${replaced
        ? 'استُبدل جوابك السابق. يُقرأ الأخير وحده.'
        : 'سُجِّل جوابك. شكراً لك.'}</p>
    </div>

    <dl class="sf-sum">${rows}</dl>

    <button class="sf-btn sf-btn-main sf-btn-big" id="sfEdit" type="button">
      <i class="fas fa-pen"></i> تعديل جوابي
    </button>
  </div>
</div>`;
  }

  /* ═══════════════════════════ الربط ═══════════════════════════ */

  function wire(host) {
    /* البوّابة */
    const gbtn = host.querySelector('#sfGoogleBtn');
    if (gbtn) mountGoogleButton(gbtn);

    const emailGo = host.querySelector('#sfEmailGo');
    if (emailGo) {
      const input = host.querySelector('#sfEmail');
      const go = () => {
        state.emailTyped = input ? input.value.trim() : '';
        if (!state.emailTyped) { state.gateError = 'اكتب بريدَك الإلكتروني.'; render({ rebuild: true }); return; }
        authenticate({ email: state.emailTyped });
      };
      emailGo.addEventListener('click', go);
      if (input) {
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        input.addEventListener('input', () => { state.emailTyped = input.value; });
      }
    }

    const out = host.querySelector('#sfSignOut');
    if (out) out.addEventListener('click', signOut);

    const restore = host.querySelector('#sfRestore');
    if (restore) restore.addEventListener('click', restoreServerAnswer);

    const edit = host.querySelector('#sfEdit');
    if (edit) edit.addEventListener('click', editAgain);

    const submit = host.querySelector('#sfSubmit');
    if (submit) submit.addEventListener('click', doSubmit);

    /* الاسم */
    const sel = host.querySelector('#sfName');
    if (sel) {
      sel.addEventListener('change', () => {
        state.answers.name = sel.value;
        state.toppedUpFor = sel.value;
        if (sel.value) fillFromRoster(sel.value, { force: true });
        delete state.fieldErrors.name;
        saveDraft();
        syncIdentityInputs(host);
      });
    }

    const search = host.querySelector('#sfNameSearch');
    if (search && sel) {
      const all = roster();
      search.addEventListener('input', () => {
        const q = search.value.trim();
        const matches = q
          ? all.filter(r => AUH.text.smartSearch(r.name + ' ' + (r.abbr || ''), q))
          : all;
        const keep = state.answers.name;
        sel.innerHTML = '<option value="">— اختر اسمَك —</option>' + matches.map(r =>
          `<option value="${esc(r.name)}"${r.name === keep ? ' selected' : ''}>${esc(r.name)}${r.abbr ? ' — ' + esc(r.abbr) : ''}</option>`
        ).join('');
        const hint = host.querySelector('#sfNameHint');
        if (hint) {
          hint.textContent = q
            ? (matches.length ? matches.length + ' اسماً مطابقاً.' : 'لا اسمَ مطابقاً — جرّب الاختصار.')
            : all.length + ' اسماً في اللائحة. الاختصارُ والهاتفُ والفرزُ تُعبَّأ تلقائياً.';
        }
        // اسمٌ واحدٌ مطابق: يُختار فوراً — أسرعُ خطوةٍ في النموذج كلِّه.
        if (q && matches.length === 1) {
          sel.value = matches[0].name;
          state.answers.name = matches[0].name;
          state.toppedUpFor = matches[0].name;
          fillFromRoster(matches[0].name, { force: true });
          delete state.fieldErrors.name;
          saveDraft();
          syncIdentityInputs(host);
        }
      });
    }

    /* الحقولُ النصّية */
    bindText(host, '#sfAbbr', 'abbr');
    bindText(host, '#sfPhone', 'phone');
    bindText(host, '#sfRotation', 'rotation');
    bindText(host, '#sfRelief', 'reliefCount');
    bindText(host, '#sfReason', 'reason');
    bindText(host, '#sfProblems', 'scheduleProblems');
    bindText(host, '#sfNotes', 'notes');

    /* المقاييسُ ونعم/لا */
    host.querySelectorAll('[data-scale]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-scale');
        state.answers[key] = btn.getAttribute('data-value');
        delete state.fieldErrors[key];
        saveDraft();
        const row = btn.parentNode;
        row.querySelectorAll('.sf-scale-btn').forEach(b => {
          const on = b === btn;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        clearFieldError(host, key);
      });
    });

    host.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-choice');
        state.answers[key] = btn.getAttribute('data-value');
        delete state.fieldErrors[key];
        saveDraft();
        btn.parentNode.querySelectorAll('.sf-chip').forEach(b => b.classList.toggle('on', b === btn));
        clearFieldError(host, key);
      });
    });

    /* الرزنامة */
    const cal = host.querySelector('#sfCal');
    if (cal) {
      cal.addEventListener('click', e => {
        const btn = e.target.closest('[data-day]');
        if (!btn) return;
        const d = Number(btn.getAttribute('data-day'));
        const i = state.answers.days.indexOf(d);
        if (i >= 0) state.answers.days.splice(i, 1);
        else state.answers.days.push(d);
        btn.classList.toggle('on', i < 0);
        btn.setAttribute('aria-pressed', String(i < 0));
        saveDraft();
        afterDaysChange(host);
      });
    }

    const clearDays = host.querySelector('#sfClearDays');
    if (clearDays) {
      clearDays.addEventListener('click', () => {
        state.answers.days = [];
        saveDraft();
        host.querySelectorAll('[data-day]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
        afterDaysChange(host);
      });
    }
  }

  function bindText(host, selector, key) {
    const el = host.querySelector(selector);
    if (!el) return;
    el.addEventListener('input', () => {
      state.answers[key] = el.value;
      if (state.fieldErrors[key]) { delete state.fieldErrors[key]; clearFieldError(host, key); }
      saveDraft();
    });
  }

  /** يُزيل علامةَ الخطأ فوراً عند التصحيح، بلا إعادةِ بناءٍ تَفقد المؤشّر. */
  function clearFieldError(host, key) {
    const wrap = host.querySelector('[data-field="' + key + '"]');
    if (!wrap) return;
    const e = wrap.querySelector('.sf-err');
    if (e) e.remove();
    wrap.querySelectorAll('.sf-invalid').forEach(el => el.classList.remove('sf-invalid'));
  }

  function syncIdentityInputs(host) {
    const set = (sel, v) => { const el = host.querySelector(sel); if (el) el.value = v == null ? '' : v; };
    set('#sfAbbr', state.answers.abbr);
    set('#sfPhone', state.answers.phone);
    set('#sfRotation', state.answers.rotation);
    clearFieldError(host, 'name');
    clearFieldError(host, 'rotation');
  }

  /** الأيامُ تغيّرت: يُحدَّث الملخّصُ ويُظهَر/يُخفى حقلُ السبب بلا إعادةِ بناء. */
  function afterDaysChange(host) {
    const sum = host.querySelector('#sfDaysSummary');
    if (sum) sum.innerHTML = daysSummaryHtml(state.answers.days);

    const cond = host.querySelector('#sfCond');
    if (cond) cond.hidden = state.answers.days.length === 0;

    const clearBtn = host.querySelector('#sfClearDays');
    if (clearBtn) clearBtn.disabled = state.answers.days.length === 0;

    if (!state.answers.days.length) {
      delete state.fieldErrors.reason;
      delete state.fieldErrors.leave;
    }
  }

  /* ═══════════════════════════ التصدير ═══════════════════════════ */

  AUH.views = AUH.views || {};
  AUH.views.surveyForm = {
    render,
    /** للاختبار والتشخيص من الكونسول. */
    _state: state,
    _validate: validateLocal
  };
})(typeof window !== 'undefined' ? window : globalThis);

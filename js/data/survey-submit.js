/**
 * نقلُ استبيانِ الشهر إلى Apps Script — ونصفُ هذا الملفِّ احتياطٌ من انقطاعِ شبكة.
 *
 * القاعدةُ التي بُني عليها كلُّ شيءٍ هنا: **لا نَقرأ جوابَ POST، ولا نُرسل
 * بياناتٍ في رابطِ GET.** لأن جوابَ POST عبر النطاقات غيرُ مضمونٍ على Apps
 * Script — يَعمل اليومَ وقد لا يَعمل من متصفّحٍ أو إعدادِ خصوصيةٍ آخر، ولو
 * اعتمدنا عليه لرأى بعضُ المقيمين «تعذّر الإرسال» وجوابُهم محفوظٌ فعلاً.
 *
 * فالتبادلُ:
 *   POST يَكتب (بلا قراءةِ جواب)  →  GET عبر JSONP يَسأل «ماذا صار؟»
 *
 * وJSONP يَعمل من أيِّ أصلٍ ومن `file://` أيضاً — وهو نفسُ ما يُشغّل قراءةَ
 * الشيتات في هذا الموقع حين يُفتح من القرص.
 *
 * و`reqId` معرّفٌ عشوائيٌّ يُولَّد مرّةً للإرسال ويُكتب في الجدول، فالخادمُ
 * يَعرف الطلبَ المُعاد ولا يُنشئ له صفّاً ثانياً. ولهذا تَستطيع هذه الطبقةُ
 * أن تُعيد المحاولةَ بلا خوفٍ من جوابَين لشخصٍ واحد.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const log = AUH.log;

  /** معرّفٌ عشوائيٌّ آمنٌ للروابط (A–Z a–z 0–9 _ -) بطول 22. */
  function newId() {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let out = '';
    const n = 22;
    const c = global.crypto;
    if (c && c.getRandomValues) {
      const buf = new Uint8Array(n);
      c.getRandomValues(buf);
      for (let i = 0; i < n; i++) out += abc[buf[i] % abc.length];
    } else {
      for (let i = 0; i < n; i++) out += abc[Math.floor(Math.random() * abc.length)];
    }
    return out;
  }

  function endpoint() {
    const cfg = (AUH.config && AUH.config.surveyForm) || {};
    return String(cfg.endpoint || '').trim();
  }

  /**
   * هل الرابطُ رابطُ Apps Script حقيقيّ؟
   *
   * الفحصُ بالشكل لا بالوجود، فيُكشف الخطأُ المطبعيُّ في الإعداد قبل أن
   * يَضغط مقيمٌ «إرسال» فيَرى عطلاً. و`localhost` مسموحٌ للتجربة المحلّية
   * وحدَها — خادمُ محاكاةٍ في `5-أدوات/` يُشغّل النموذجَ كاملاً بلا نشر.
   */
  function configured() {
    const url = endpoint();
    if (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) return true;
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  }

  /* ──────────────────────────── GET عبر JSONP ──────────────────────────── */

  let jsonpSeq = 0;

  /**
   * طلبُ قراءةٍ عبر وسمِ `<script>` — فلا CORS ولا preflight، ويعمل من القرص.
   * يُنظَّف الوسمُ والدالّةُ في كلِّ الحالات، فلا يَتراكم شيءٌ على النافذة.
   */
  function jsonp(params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const url = endpoint();
      if (!url) { reject(new Error('لم يُضبط رابطُ الاستبيان.')); return; }

      const name = '__auhSurveyCb' + (++jsonpSeq) + '_' + Date.now().toString(36);
      const qs = Object.keys(params)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&');

      let done = false;
      const el = global.document.createElement('script');

      const cleanup = () => {
        if (timer) global.clearTimeout(timer);
        try { delete global[name]; } catch (err) { global[name] = undefined; }
        if (el.parentNode) el.parentNode.removeChild(el);
      };

      const timer = global.setTimeout(() => {
        if (done) return;
        done = true; cleanup();
        reject(new Error('تعذّر الوصول إلى الخادم (انتهت المدّة).'));
      }, timeoutMs || 20000);

      global[name] = data => {
        if (done) return;
        done = true; cleanup();
        resolve(data || {});
      };

      el.src = url + '?' + qs + '&callback=' + encodeURIComponent(name) + '&_=' + Date.now();
      el.onerror = () => {
        if (done) return;
        done = true; cleanup();
        reject(new Error('تعذّر الوصول إلى الخادم.'));
      };
      global.document.head.appendChild(el);
    });
  }

  /* ──────────────────────────── POST يَكتب ──────────────────────────── */

  /**
   * إرسالٌ بلا قراءةِ جواب.
   *
   * `text/plain` مقصودٌ لا سهو: به يُصبح الطلبُ «بسيطاً» فلا يُسبق بـ
   * preflight — وApps Script لا يُجيب preflight. والجوابُ يُحاول قراءتَه
   * ويُهمَل إن تعذّر، لأن الحقيقةَ تُؤخذ من `poll` لا منه.
   */
  function post(body) {
    const url = endpoint();
    if (!url) return Promise.reject(new Error('لم يُضبط رابطُ الاستبيان.'));

    return global.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(res => {
      return res.text().then(t => { try { return JSON.parse(t); } catch (err) { return null; } },
                             () => null);
    }, err => {
      throw new Error('تعذّر الإرسال — تحقّق من الاتصال. (' + (err && err.message ? err.message : err) + ')');
    });
  }

  /** يَسأل الخادمَ عن نتيجةِ `nonce` حتى يَخرج من حالة «قيد التنفيذ». */
  function poll(nonce, opts) {
    const o = opts || {};
    const tries = o.tries || 10;
    const gap = o.gapMs || 1200;

    let i = 0;
    const once = () => jsonp({ action: 'poll', nonce: nonce }, o.timeoutMs || 15000)
      .then(d => {
        if (d && d.state && d.state !== 'pending') return d;
        if (++i >= tries) throw new Error('لم يُجب الخادمُ في الوقت المتوقَّع. أعد المحاولة.');
        return new Promise(r => global.setTimeout(r, gap)).then(once);
      }, err => {
        if (++i >= tries) throw err;
        return new Promise(r => global.setTimeout(r, gap)).then(once);
      });

    return once();
  }

  /* ─────────────────────────── العملياتُ الثلاث ─────────────────────────── */

  /** حالةُ الخادم: مفتوحٌ؟ أيُّ شهر؟ الدخولُ بـGoogle مُفعَّل؟ */
  function ping() {
    return jsonp({ action: 'ping' }, 15000);
  }

  /**
   * إثباتُ الهويّة. يُعيد `{ nonce, email, verified, answered, prev }`.
   * و`nonce` هو ما يَحمله الإرسالُ بعدَها — فالبريدُ لا يُرسل مع النموذج أصلاً.
   */
  function authenticate(credentials) {
    const nonce = newId();
    const body = { action: 'auth', nonce: nonce };
    if (credentials.idToken) body.idToken = credentials.idToken;
    if (credentials.email) body.email = credentials.email;

    return post(body)
      .then(() => poll(nonce, { tries: 8, gapMs: 1000 }))
      .then(d => {
        if (!d || d.state !== 'ok') throw new Error((d && d.message) || 'تعذّر التحقّق من هويّتك.');
        d.nonce = nonce;
        return d;
      });
  }

  /**
   * إرسالُ الجواب. يُعيد `{ state:'saved', replaced }` أو يَرمي رسالةً عربية.
   *
   * ويُمرَّر `idToken` معه أيضاً: لو انتهت جلسةُ `nonce` على الخادم أثناء
   * التعبئةِ الطويلة، نَجا الإرسالُ بالرمز بدل أن يُطلب من المقيمِ أن يُعيد
   * كلَّ شيءٍ من أوّله.
   */
  function submit(session, payload) {
    const reqId = session.reqId || (session.reqId = newId());
    const body = { action: 'submit', reqId: reqId, nonce: session.nonce, payload: payload };
    if (session.idToken) body.idToken = session.idToken;

    return post(body)
      .then(() => poll(reqId, { tries: 12, gapMs: 1500 }))
      .then(d => {
        if (!d || d.state !== 'saved') {
          const e = new Error((d && d.message) || 'تعذّر الحفظ. أعد المحاولة.');
          // الرمزُ يَصل إلى الواجهة كما هو، فتَعرف أهو خطأٌ يُعاد معه أم
          // خطأٌ يَحتاج تسجيلَ دخولٍ جديداً.
          e.code = (d && d.code) || '';
          throw e;
        }
        return d;
      });
  }

  /**
   * إعادةُ المحاولةِ بنفس `reqId` — آمنةٌ تماماً: الخادمُ يَرى المعرّفَ
   * مكتوباً فيُجيب «محفوظ» بلا صفٍّ ثانٍ.
   */
  function retry(session, payload) {
    return submit(session, payload);
  }

  AUH.data = AUH.data || {};
  AUH.data.surveySubmit = { newId, configured, endpoint, ping, authenticate, submit, retry, poll, jsonp };

  log.debug('surveySubmit', configured() ? 'رابطُ الاستبيان مضبوط.' : 'رابطُ الاستبيان غيرُ مضبوط.');
})(typeof window !== 'undefined' ? window : globalThis);

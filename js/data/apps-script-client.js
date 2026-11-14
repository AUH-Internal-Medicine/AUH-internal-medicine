/**
 * آليّةُ الاتصال العامّة بأيّ Apps Script في هذا الموقع — مُستخلَصةٌ من
 * `survey-submit.js` (أوّل من أثبتها في الإنتاج). راجع التعليق أعلى ذلك
 * الملفّ للشرح الكامل؛ الخلاصة هنا فقط:
 *
 *   POST يَكتب (بلا قراءةِ جواب)  →  GET عبر JSONP يَسأل «ماذا صار؟»
 *
 * لأن جوابَ POST عبر النطاقات غيرُ مضمونٍ على Apps Script، ولأن JSONP يعمل
 * من أيّ أصلٍ ومن `file://` أيضاً. **لا بيانات حسّاسة في رابط GET أبداً** —
 * فقط `nonce` عشوائيّ لا معنى له وحده.
 *
 * كلّ مستهلكٍ (مثل `accounts-client.js`) يُنشئ عميلاً بـ `createClient(getEndpoint)`
 * ويستعمل `post`/`jsonp`/`poll`/`newId` الناتجة، كلٌّ مرتبطٌ برابطه الخاصّ.
 *
 * `survey-submit.js` نفسُه لم يُعدَّل ليستعمل هذا الملفّ — يبقى كما هو،
 * ميزةٌ حيّةٌ لا داعي لمخاطرتها الآن.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

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

  let jsonpSeq = 0;

  /**
   * @param {function(): string} getEndpoint يُعيد رابط الـ `/exec` الحالي.
   * @returns {{newId, jsonp, post, poll}} عميلٌ مرتبطٌ بهذا الرابط وحدَه.
   */
  function createClient(getEndpoint) {
    /** طلبُ قراءةٍ عبر وسمِ `<script>` — فلا CORS ولا preflight، ويعمل من القرص. */
    function jsonp(params, timeoutMs) {
      return new Promise((resolve, reject) => {
        const url = String(getEndpoint() || '').trim();
        if (!url) { reject(new Error('لم يُضبط رابطُ الخدمة.')); return; }

        const name = '__auhAsc' + (++jsonpSeq) + '_' + Date.now().toString(36);
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

    /** إرسالٌ بلا قراءةِ جواب. `text/plain` مقصودٌ — يَمنع الـpreflight الذي لا يُجيبه Apps Script. */
    function post(body) {
      const url = String(getEndpoint() || '').trim();
      if (!url) return Promise.reject(new Error('لم يُضبط رابطُ الخدمة.'));

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

    /**
     * نفسُ استعلام `poll` عبر `fetch` عاديّة بدل وسم `<script>` — طريقٌ بديل.
     * الخادم يُعيد JSON صِرفاً حين لا يُطلب `callback` (مُتحقَّقٌ عبر curl مباشرةً
     * ضدّ النشرة الحيّة)، والترويسة `Access-Control-Allow-Origin: *` قائمةٌ على
     * رابط التحويل (302) النهائيّ أيضاً لا على أوّل ردٍّ فقط.
     */
    function pollFetch(nonce, timeoutMs) {
      const url = String(getEndpoint() || '').trim();
      if (!url) return Promise.reject(new Error('لم يُضبط رابطُ الخدمة.'));

      const qs = 'action=poll&nonce=' + encodeURIComponent(nonce) + '&_=' + Date.now();
      const controller = (typeof global.AbortController === 'function') ? new global.AbortController() : null;
      const timer = controller ? global.setTimeout(() => controller.abort(), timeoutMs || 15000) : null;

      return global.fetch(url + '?' + qs, { method: 'GET', redirect: 'follow', signal: controller && controller.signal })
        .then(res => res.text())
        .then(t => { if (timer) global.clearTimeout(timer); try { return JSON.parse(t); } catch (err) { return {}; } })
        .catch(err => { if (timer) global.clearTimeout(timer); throw new Error('تعذّر الوصول إلى الخادم. (' + (err && err.message ? err.message : err) + ')'); });
    }

    /**
     * يَسأل الخادمَ عن نتيجةِ `nonce` حتى يَخرج من حالة «قيد التنفيذ».
     *
     * يُناوب بين وسم `<script>` (JSONP — يعمل من القرص `file://`) و`fetch`
     * عاديّة في كلّ محاولة: بعض أدوات حجب الإعلانات/التتبّع تحجب وسوم
     * `<script src>` المُولَّدة ديناميكياً نحو `script.google.com` فتظهر
     * «تعذّر الوصول إلى الخادم» رغم أنّ الخادم نفّذ الطلبَ فعلاً (رسالةُ
     * البريد تصل، لكن الصفحةَ لا ترى الجواب) — المناوبة تتجاوز هذا الحجب
     * بقناةٍ بديلة بدل الاعتماد على وسيلةٍ واحدة فقط.
     */
    function poll(nonce, opts) {
      const o = opts || {};
      const tries = o.tries || 10;
      const gap = o.gapMs || 1200;
      const timeoutMs = o.timeoutMs || 15000;

      let i = 0;
      const attempt = () => (i % 2 === 0)
        ? jsonp({ action: 'poll', nonce: nonce }, timeoutMs)
        : pollFetch(nonce, timeoutMs);

      const once = () => attempt()
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

    /** إرسالٌ ثم استطلاعٌ بـ`nonce` واحد — النمط المتكرّر في كل إجراءات الحسابات. */
    function postAndPoll(action, payload, pollOpts) {
      const nonce = newId();
      const body = Object.assign({ action: action, nonce: nonce }, payload || {});
      return post(body).then(() => poll(nonce, pollOpts));
    }

    return { newId, jsonp, post, poll, postAndPoll };
  }

  AUH.data = AUH.data || {};
  AUH.data.appsScriptClient = { createClient };
})(typeof window !== 'undefined' ? window : globalThis);

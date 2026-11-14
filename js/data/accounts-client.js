/**
 * حسابات نظام تبديل المناوبات — الاتصال بـ `نظام-التبديل.gs` عبر
 * `apps-script-client.js`. راجع ذلك الملفّ للبروتوكول العامّ.
 *
 * لا شيءَ حسّاسٌ (بريد، كلمة سرّ، رمز تحقّق، توكن) يُرسل إلا داخل جسم POST؛
 * الاستطلاع (`poll`) لا يَحمل إلا `nonce` عشوائياً لا معنى له وحده.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  function endpoint() {
    const cfg = (AUH.config && AUH.config.swapAccounts) || {};
    return String(cfg.endpoint || '').trim();
  }

  /** هل رابطُ الخدمة مضبوطٌ فعلاً؟ (نفس فحص الشكل الذي يستعمله الاستبيان). */
  function configured() {
    const url = endpoint();
    if (/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) return true;
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  }

  const client = AUH.data.appsScriptClient.createClient(endpoint);

  // فجوةٌ أقصر بين كل استطلاع = شعورٌ أسرع، ومحاولاتٌ أكثر = صمودٌ أمام
  // بطء Apps Script العابر (أول تشغيلٍ بعد نشرٍ جديد تحديداً أبطأ من المعتاد)
  // بدل الفشل المبكر بـ«تعذّر الوصول إلى الخادم» بينما الخادم لا يزال يعمل.
  // و`timeoutMs` قصيرةٌ عمداً (مهلة محاولةٍ واحدة، لا المهلة الكلية): القناتان
  // (fetch وJSONP) تتناوبان في `apps-script-client.js`، فمحاولةٌ محجوبة (حجب
  // إعلانات يمنع fetch أو <script src>) تُكتشَف خلال ثوانٍ قليلة بدل عشر —
  // وهذا هو سبب شعور «تسجيل الدخول التلقائي» بالبطء أو التكرار سابقاً.
  const QUICK = { tries: 14, gapMs: 700, timeoutMs: 5000 };
  // completeRegister هو الأثقل: تحقّق الرمز + قراءة اللائحة + قفلٌ + كتابتا صفّ.
  const HEAVY = { tries: 24, gapMs: 700, timeoutMs: 5000 };

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function startRegister(abbr, email) {
    return client.postAndPoll('startRegister', { abbr: abbr, email: email }, QUICK);
  }

  /** @returns {Promise<{state:'ok', token, name, abbr}|{state:'error', message}>} */
  function completeRegister(abbr, email, code, password) {
    return client.postAndPoll('completeRegister',
      { abbr: abbr, email: email, code: code, password: password },
      HEAVY);
  }

  /** @returns {Promise<{state:'ok', token, name, abbr}|{state:'error', message}>} */
  function login(abbr, password) {
    return client.postAndPoll('login', { abbr: abbr, password: password }, QUICK);
  }

  /** @returns {Promise<{state:'ok', name, abbr}|{state:'error', message}>} */
  function validateSession(token) {
    return client.postAndPoll('validateSession', { token: token }, QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function logout(token) {
    return client.postAndPoll('logout', { token: token }, { tries: 6, gapMs: 600, timeoutMs: 10000 });
  }

  /** @returns {Promise<{state:'ok', accounts:Array}|{state:'error', message}>} */
  function adminListAccounts(passcode) {
    return client.postAndPoll('adminListAccounts', { passcode: passcode }, QUICK);
  }

  AUH.data.accounts = { configured, endpoint, startRegister, completeRegister, login, validateSession, logout, adminListAccounts };
})(typeof window !== 'undefined' ? window : globalThis);

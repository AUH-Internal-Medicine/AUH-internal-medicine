/**
 * طلبات التبديل (المرحلة ٢) — الاتصال بـ `نظام-التبديل.gs` عبر
 * `apps-script-client.js`، على نفس نمط `accounts-client.js`.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  function endpoint() {
    const cfg = (AUH.config && AUH.config.swapAccounts) || {};
    return String(cfg.endpoint || '').trim();
  }

  const client = AUH.data.appsScriptClient.createClient(endpoint);
  // timeoutMs قصيرةٌ عمداً (مهلة كل محاولة وحدها، لا مهلة الانتظار الكلية):
  // إن حُجبت إحدى القناتين (fetch أو JSONP بالتناوب) تُكتشف المحاولة
  // الميّتة بسرعة فتتحوّل للقناة الأخرى، بدل عشر ثوانٍ صامتة على كل محاولة.
  const QUICK = { tries: 14, gapMs: 700, timeoutMs: 5000 };
  // adminDecideRequest قد يكتب على جدول المناوبات أيضاً (موافقة) — أثقل من
  // باقي الإجراءات، فميزانية صبرٍ أكبر تمنع رسالة "لم يُجب الخادم" المُضلِّلة
  // بينما القرار نفَّذ فعلاً على الخادم.
  const HEAVY = { tries: 24, gapMs: 700, timeoutMs: 5000 };

  /** @returns {Promise<{state:'ok', id}|{state:'error', message}>} */
  function submitRequest(token, data) {
    return client.postAndPoll('submitRequest', Object.assign({ token: token }, data), QUICK);
  }

  /** @returns {Promise<{state:'ok', requests:Array}|{state:'error', message}>} */
  function myRequests(token) {
    return client.postAndPoll('myRequests', { token: token }, QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function cancelRequest(token, id) {
    return client.postAndPoll('cancelRequest', { token: token, id: id }, QUICK);
  }

  /** @returns {Promise<{state:'ok', requests:Array}|{state:'error', message}>} */
  function adminListRequests(passcode) {
    return client.postAndPoll('adminListRequests', { passcode: passcode }, QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function adminDecideRequest(passcode, id, decision, note) {
    return client.postAndPoll('adminDecideRequest', { passcode: passcode, id: id, decision: decision, note: note }, HEAVY);
  }

  /** @returns {Promise<{state:'ok', scheduleResult}|{state:'error', message}>} */
  function retryScheduleExecution(passcode, id) {
    return client.postAndPoll('retryScheduleExecution', { passcode: passcode, id: id }, HEAVY);
  }

  /**
   * طلبٌ يدويٌّ يقدّمه الأدمن نيابةً عن الطرفين — `swap.html?admin=1`. لا
   * جلسة مقيمٍ هنا، كلمة سرّ الأدمن بدلاً منها؛ و`data` تحمل `fromAbbr`/
   * `fromName` أيضاً (الجلسة العادية تستنتجهما من التوكن، وهنا لا توكن).
   * @returns {Promise<{state:'ok', id}|{state:'error', message}>}
   */
  function adminSubmitRequest(passcode, data) {
    return client.postAndPoll('adminSubmitRequest', Object.assign({ passcode: passcode }, data), QUICK);
  }

  AUH.data.swapRequests = {
    submitRequest, myRequests, cancelRequest, adminListRequests, adminDecideRequest,
    retryScheduleExecution, adminSubmitRequest
  };
})(typeof window !== 'undefined' ? window : globalThis);

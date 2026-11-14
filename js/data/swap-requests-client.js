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
  const QUICK = { tries: 12, gapMs: 800, timeoutMs: 10000 };
  // adminDecideRequest قد يكتب على جدول المناوبات أيضاً (موافقة) — أثقل من
  // باقي الإجراءات، فميزانية صبرٍ أكبر تمنع رسالة "لم يُجب الخادم" المُضلِّلة
  // بينما القرار نفَّذ فعلاً على الخادم.
  const HEAVY = { tries: 20, gapMs: 800, timeoutMs: 10000 };

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

  AUH.data.swapRequests = { submitRequest, myRequests, cancelRequest, adminListRequests, adminDecideRequest };
})(typeof window !== 'undefined' ? window : globalThis);

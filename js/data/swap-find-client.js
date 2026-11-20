/**
 * واجهة «البحث عن بديل» — الاتصال بـ`نظام-التبديل.gs` عبر `apps-script-client.js`،
 * على نفس نمط `swap-requests-client.js` حرفياً. كل إجراءٍ هنا بجلسة مقيمٍ
 * عادية (`token`) — لا كلمة سرّ أدمن إطلاقاً، فهذه الواجهة لا تلمس مسار الأدمن.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;

  function endpoint() {
    const cfg = (AUH.config && AUH.config.swapAccounts) || {};
    return String(cfg.endpoint || '').trim();
  }

  const client = AUH.data.appsScriptClient.createClient(endpoint);
  const QUICK = { tries: 14, gapMs: 700, timeoutMs: 5000 };
  // acceptFindOffer يكتب أيضاً (قفلٌ + رفض باقي العروض تلقائياً) — نفس
  // منطق HEAVY في swap-requests-client.js لـadminDecideRequest.
  const HEAVY = { tries: 24, gapMs: 700, timeoutMs: 5000 };

  /** @returns {Promise<{state:'ok', id}|{state:'error', message}>} */
  function submitFindRequest(token, data) {
    return client.postAndPoll('submitFindRequest', Object.assign({ token: token }, data), QUICK);
  }

  /** @returns {Promise<{state:'ok', requests:Array}|{state:'error', message}>} */
  function listFindRequests(token) {
    return client.postAndPoll('listFindRequests', { token: token }, QUICK);
  }

  /** @returns {Promise<{state:'ok', mine:Array, myOffers:Array}|{state:'error', message}>} */
  function myFindRequests(token) {
    return client.postAndPoll('myFindRequests', { token: token }, QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function editFindRequest(token, id, data) {
    return client.postAndPoll('editFindRequest', Object.assign({ token: token, id: id }, data), QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function cancelFindRequest(token, id) {
    return client.postAndPoll('cancelFindRequest', { token: token, id: id }, QUICK);
  }

  /** @returns {Promise<{state:'ok', id}|{state:'error', message}>} */
  function submitFindOffer(token, requestId, data) {
    return client.postAndPoll('submitFindOffer', Object.assign({ token: token, requestId: requestId }, data), QUICK);
  }

  /** @returns {Promise<{state:'ok'}|{state:'error', message}>} */
  function withdrawFindOffer(token, id) {
    return client.postAndPoll('withdrawFindOffer', { token: token, id: id }, QUICK);
  }

  /**
   * @returns {Promise<{state:'ok', fromAbbr, kind, shiftDate, shiftType,
   *   toAbbr, toName, backDate, backType, urgent}|{state:'error', message}>}
   */
  function acceptFindOffer(token, requestId, offerId) {
    return client.postAndPoll('acceptFindOffer', { token: token, requestId: requestId, offerId: offerId }, HEAVY);
  }

  AUH.data.swapFind = {
    submitFindRequest, listFindRequests, myFindRequests, editFindRequest, cancelFindRequest,
    submitFindOffer, withdrawFindOffer, acceptFindOffer
  };
})(typeof window !== 'undefined' ? window : globalThis);

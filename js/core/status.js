/**
 * Resident "الحالة" (status) vocabulary.
 *
 * The status cell is free text maintained by hand in the sheet, so it is matched
 * by keyword rather than by exact value. Known values today:
 *   تم الالتحاق · تم الانفكاك · لم يلتحق بعد · لم ينضم للغروب
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr } = AUH.text;

  /** True when the status text says the resident has actually joined. */
  function isJoined(s) {
    const st = normAr(s || '');
    if (!st) return false;
    // "تم الانفكاك" also contains "انفكاك" but must never read as joined.
    if (isDetachedStatus(s)) return false;
    // The two rosters word the same fact differently: the first year writes
    // "تم الالتحاق", the second "قائم على رأس عمله". Both mean the resident is
    // working, and both must show as joined.
    return ['التحق', 'ملتحق', 'التحاق', 'على راس عمله', 'راس عمله', 'مباشر', 'يعمل']
      .some(w => st.includes(normAr(w)));
  }

  /** True for residents who left ("تم الانفكاك") — hidden from the roster by default. */
  function isDetachedStatus(s) {
    return normAr(s || '').includes(normAr('تم الانفكاك'));
  }

  /** CSS class for the status badge. */
  function getStatusBadgeClass(s) {
    const st = normAr(s || '');
    if (isDetachedStatus(s)) return 'status-detached';
    if (st.includes(normAr('لم ينضم للغروب'))) return 'status-not-joined';
    if (st.includes(normAr('لم يلتحق بعد'))) return 'status-not-yet';
    return isJoined(s) ? 'status-joined' : 'status-pending';
  }

  AUH.status = { isJoined, isDetachedStatus, getStatusBadgeClass };
})(typeof window !== 'undefined' ? window : globalThis);

/**
 * Small shared UI pieces: dark mode, toasts, the phone tooltip, copy buttons,
 * collapsible sections and the image-download progress overlay.
 *
 * The functions at the bottom are deliberately exposed as bare globals: the
 * rendered HTML calls them from inline `onclick=""` attributes, which can only
 * see globals. Everything else in the codebase lives under `AUH.*`.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml, escapeJsString } = AUH.text;
  const doc = global.document;

  /* ---------------------------------------------------------------- dark mode */

  function toggleDarkMode() {
    doc.body.classList.toggle('dark-mode');
    const icon = doc.getElementById('darkModeIcon');
    const isDark = doc.body.classList.contains('dark-mode');
    if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    AUH.storage.set('darkMode', isDark ? 'true' : 'false');
  }

  function restoreDarkMode() {
    if (AUH.storage.get('darkMode') !== 'true') return;
    doc.body.classList.add('dark-mode');
    const icon = doc.getElementById('darkModeIcon');
    if (icon) icon.className = 'fas fa-sun';
  }

  /* ------------------------------------------------------------ phone tooltip */

  let tooltipPhone = '';

  function showTooltip(e, name, phone) {
    e.stopPropagation();
    const tt = doc.getElementById('nameTooltip');
    doc.getElementById('ttName').textContent = name;
    doc.getElementById('ttPhone').textContent = 'هاتف: ' + phone;
    tooltipPhone = phone;
    tt.classList.add('show');

    const x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const y = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    tt.style.left = Math.min(x - 100, global.innerWidth - 220) + 'px';
    tt.style.top = y - 110 + 'px';
  }

  function hideTooltip() {
    const tt = doc.getElementById('nameTooltip');
    if (tt) tt.classList.remove('show');
  }

  function copyTooltipPhone() {
    if (!tooltipPhone) return;
    navigator.clipboard.writeText(tooltipPhone);
    const btn = doc.getElementById('ttCopyBtn');
    btn.innerHTML = '<i class="fas fa-check"></i> تم النسخ';
    showToast('تم نسخ الرقم!');
    setTimeout(() => (btn.innerHTML = '<i class="fas fa-copy"></i> نسخ الرقم'), 1500);
  }

  function copyPhone(phone, btn) {
    navigator.clipboard
      .writeText(phone)
      .then(() => {
        const icon = btn.querySelector('i');
        const original = icon.className;
        icon.className = 'fas fa-check';
        btn.classList.add('copied');
        showToast('تم نسخ الرقم!');
        setTimeout(() => {
          icon.className = original;
          btn.classList.remove('copied');
        }, 1500);
      })
      .catch(() => {});
  }

  /**
   * Renders a resident name that opens the phone tooltip when clicked.
   * `abbr` is appended in parentheses when given.
   */
  function mcn(name, phone, abbr) {
    let display = escapeHtml(name);
    if (abbr) display += ' (' + escapeHtml(abbr) + ')';
    if (!phone) return display;
    return `<span class="name-clickable" onclick="event.stopPropagation();showTooltip(event,'${escapeJsString(name)}','${escapeJsString(phone)}')">${display}</span>`;
  }

  /* ------------------------------------------------------ collapsibles + Q&A */

  function toggleCollapsible(btn) {
    btn.classList.toggle('open');
    const content = btn.nextElementSibling;
    if (content) content.classList.toggle('show');
  }

  function toggleQACard(card) {
    card.classList.toggle('open');
  }

  function toggleQACategory(header) {
    header.classList.toggle('open');
    const content = header.nextElementSibling;
    if (content) content.classList.toggle('show');
  }

  /* ------------------------------------------------------------------ toasts */

  function showToast(message) {
    const el = doc.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    doc.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  /* ------------------------------------------------- image download progress */

  function showDownloadProgress(title) {
    const overlay = doc.getElementById('downloadProgressOverlay');
    doc.getElementById('dpTitle').textContent = title || 'جاري توليد الصورة...';
    doc.getElementById('dpBar').style.width = '0%';
    doc.getElementById('dpPercent').textContent = '0%';
    doc.getElementById('dpSub').textContent = '';
    overlay.classList.remove('hidden');
  }

  function updateDownloadProgress(percent, sub) {
    doc.getElementById('dpBar').style.width = percent + '%';
    doc.getElementById('dpPercent').textContent = Math.round(percent) + '%';
    if (sub) doc.getElementById('dpSub').textContent = sub;
  }

  function hideDownloadProgress() {
    doc.getElementById('downloadProgressOverlay').classList.add('hidden');
  }

  /* ------------------------------------------------------------------- misc */

  /** Trailing-edge debounce, used by every search box. */
  function debounce(fn, wait = 120) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  /* --------------------------------------------------- document-level wiring */

  function wireGlobalListeners() {
    // Clicking anywhere outside a name/tooltip closes the phone tooltip.
    doc.addEventListener('click', e => {
      if (!e.target.closest('.name-clickable') && !e.target.closest('.name-tooltip')) hideTooltip();
    });

    // Name dropdowns (shift member lists) open one at a time.
    doc.addEventListener('click', e => {
      const btn = e.target.closest('.names-dropdown-btn');
      if (btn) {
        e.stopPropagation();
        btn.classList.toggle('open');
        const content = btn.nextElementSibling;
        if (content) content.classList.toggle('show');
        return;
      }
      if (e.target.closest('.names-dropdown')) return;
      doc.querySelectorAll('.names-dropdown-btn.open').forEach(b => {
        b.classList.remove('open');
        const content = b.nextElementSibling;
        if (content) content.classList.remove('show');
      });
    });
  }

  AUH.ui = {
    toggleDarkMode,
    restoreDarkMode,
    showTooltip,
    hideTooltip,
    copyTooltipPhone,
    copyPhone,
    mcn,
    toggleCollapsible,
    toggleQACard,
    toggleQACategory,
    showToast,
    showDownloadProgress,
    updateDownloadProgress,
    hideDownloadProgress,
    debounce,
    wireGlobalListeners
  };

  /* Globals required by inline `onclick=""` handlers in the rendered HTML. */
  global.toggleDarkMode = toggleDarkMode;
  global.showTooltip = showTooltip;
  global.hideTooltip = hideTooltip;
  global.copyTooltipPhone = copyTooltipPhone;
  global.copyPhone = copyPhone;
  global.toggleCollapsible = toggleCollapsible;
  global.toggleQACard = toggleQACard;
  global.toggleQACategory = toggleQACategory;

  if (doc) {
    restoreDarkMode();
    wireGlobalListeners();
  }
})(typeof window !== 'undefined' ? window : globalThis);

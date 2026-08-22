/**
 * روابط هامة + Q&A — two simple list tabs rendered from their parsed models.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml } = AUH.text;

  AUH.views.linksQa = {
    /** A cell that is a URL becomes a button; anything else is shown as text. */
    formatLink(value) {
      const text = (value || '').trim();
      if (!text) return '<span style="color:var(--text-secondary);">-</span>';
      if (/^https?:\/\//i.test(text)) {
        return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener" class="link-url"><i class="fas fa-external-link-alt"></i> فتح الرابط</a>`;
      }
      return `<span style="color:var(--text);font-weight:600;">${escapeHtml(text)}</span>`;
    },

    renderLinks() {
      const grid = document.getElementById('linksGrid');
      if (!grid) return;

      const list = (this.linksModel && this.linksModel.list) || [];
      if (!list.length) {
        grid.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد بيانات</p>';
        return;
      }

      const rows = list
        .map(item => {
          const seq = escapeHtml(item.seq);
          return `<tr><td style="font-weight:700;color:#0f6ecf;">${seq}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.purpose)}</td><td>${escapeHtml(item.members)}</td><td>${this.formatLink(item.url)}</td></tr>`;
        })
        .join('');

      const cards = list
        .map(item => {
          const type = item.type ? `<div><span class="link-label">النوع:</span> <span class="link-type">${escapeHtml(item.type)}</span></div>` : '';
          const purpose = item.purpose ? `<div class="link-desc"><span class="link-label">الغاية والهدف:</span> ${escapeHtml(item.purpose)}</div>` : '';
          const members = item.members ? `<div class="link-members"><span class="link-label">الاعضاء:</span> ${escapeHtml(item.members)}</div>` : '';
          return `<div class="link-card"><span style="font-size:11px;color:var(--text-secondary);">#${escapeHtml(item.seq)}</span><div class="link-title"><span class="link-label">الاسم:</span> ${escapeHtml(item.name)}</div>${type}${purpose}${members}<div style="margin-top:8px;"><span class="link-label">رابط الانضمام:</span> ${this.formatLink(item.url)}</div></div>`;
        })
        .join('');

      grid.innerHTML =
        '<div class="table-wrapper desktop-table"><table><thead><tr><th>ت</th><th>الاسم</th><th>النوع</th><th>الغاية والهدف</th><th>الاعضاء</th><th>رابط الانضمام</th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div><div class="mobile-cards">' +
        cards +
        '</div>';
    },

    renderQA() {
      const container = document.getElementById('qaContainer');
      if (!container) return;

      const list = (this.qaModel && this.qaModel.list) || [];
      if (!list.length) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">لا توجد أسئلة وأجوبة بعد.</p>';
        return;
      }

      const byCategory = {};
      list.forEach(item => {
        (byCategory[item.category] = byCategory[item.category] || []).push(item);
      });

      container.innerHTML = Object.keys(byCategory)
        .sort()
        .map(category => {
          const cards = byCategory[category]
            .map(
              item =>
                `<div class="qa-card"><div class="qa-card-header" onclick="toggleQACard(this.parentElement)"><span class="qa-category-tag">${escapeHtml(item.category)}</span><span class="qa-question-text">${escapeHtml(item.question)}</span><i class="fas fa-chevron-down qa-toggle-icon"></i></div><div class="qa-answer">${escapeHtml(item.answer)}</div></div>`
            )
            .join('');
          return `<div class="qa-category-section"><button class="qa-category-header open" onclick="toggleQACategory(this)"><span><i class="fas fa-folder"></i> ${escapeHtml(category)} (${byCategory[category].length})</span><i class="fas fa-chevron-down"></i></button><div class="qa-category-content show">${cards}</div></div>`;
        })
        .join('');

      this.filterQA(document.getElementById('qaSearch')?.value || '');
    },

    filterQA(term) {
      const t = (term || '').toLowerCase().trim();
      document.querySelectorAll('.qa-card').forEach(card => {
        card.style.display = !t || card.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
      document.querySelectorAll('.qa-category-section').forEach(section => {
        const hasVisible = Array.from(section.querySelectorAll('.qa-card')).some(c => c.style.display !== 'none');
        section.style.display = !t || hasVisible ? '' : 'none';
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

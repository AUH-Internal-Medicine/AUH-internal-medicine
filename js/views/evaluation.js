/**
 * التقييم السنوي — evaluation table + mobile cards.
 *
 * Rendered from the parsed evaluation records (data/parsers/evaluation.js), so
 * the first resident is never skipped and the sheet's trailing totals row never
 * shows up as a nameless card. Column order follows the schema, not positions.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { escapeHtml } = AUH.text;

  /** Header label for a field, falling back to the schema's own wording. */
  function labelFor(model, field, fallback) {
    const idx = model.columns[field];
    const header = Number.isInteger(idx) ? model.headers[idx] : '';
    return (header || fallback || '').trim();
  }

  /** The columns shown in the table/cards, in order. */
  function displayColumns(model) {
    const cols = [
      { key: 'name', label: labelFor(model, 'name', 'الاسم الثلاثي'), value: r => r.name, inCard: false },
      { key: 'abbr', label: labelFor(model, 'abbr', 'الاختصار'), value: r => r.abbr, inCard: false },
      { key: 'spec', label: labelFor(model, 'spec', 'الاختصاص'), value: r => r.spec, inCard: false }
    ];

    model.skills.forEach((skill, i) => {
      cols.push({ key: `skill:${skill.key}`, label: skill.label, value: r => (r.skills[i] ? r.skills[i].value : ''), inCard: true });
    });

    cols.push({ key: 'total', label: labelFor(model, 'total', 'المحصلة الإجمالية'), value: r => r.total, inCard: true });
    cols.push({ key: 'praise', label: 'الثناءات', value: r => r.praise, inCard: true, badge: 'praise-badge', cellClass: 'eval-praise-cell', cardStyle: 'color:var(--primary);font-weight:600;' });
    cols.push({ key: 'penalty', label: 'العقوبات', value: r => r.penalty, inCard: true, badge: 'penalty-badge', cellClass: 'eval-penalty-cell', cardStyle: 'color:var(--signal);font-weight:600;' });

    return cols;
  }

  function cellHtml(col, record) {
    const raw = (col.value(record) || '').toString().trim();
    if (!raw || raw === '-') return '-';
    const safe = escapeHtml(raw);
    return col.badge ? `<span class="${col.badge}">${safe}</span>` : safe;
  }

  AUH.views.evaluation = {
    renderEval() {
      const head = document.getElementById('evalHead');
      const body = document.getElementById('evalBody');
      const cards = document.getElementById('evalCards');
      if (!head || !body || !cards) return;

      const model = this.evaluationModel;
      const records = model && model.records ? model.records : [];

      if (!records.length) {
        head.innerHTML = '';
        body.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:40px;">لا توجد بيانات</td></tr>';
        cards.innerHTML = '';
        return;
      }

      const cols = displayColumns(model);

      head.innerHTML = `<tr>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>`;

      body.innerHTML = records
        .map(record => {
          const cells = cols
            .map(col => `<td${col.cellClass ? ` class="${col.cellClass}"` : ''}>${cellHtml(col, record)}</td>`)
            .join('');
          return `<tr${record.isExample ? ' class="example-row"' : ''}>${cells}</tr>`;
        })
        .join('');

      cards.innerHTML = records
        .filter(record => !record.isExample)
        .map(record => {
          const rows = cols
            .filter(col => col.inCard)
            .map(col => {
              const style = col.cardStyle ? ` style="${col.cardStyle}"` : '';
              return `<div class="card-row"><span class="card-label">${escapeHtml(col.label)}</span><span class="card-value"${style}>${cellHtml(col, record)}</span></div>`;
            })
            .join('');
          return `<div class="resident-card"><div class="card-header"><span class="card-name">${escapeHtml(record.name)} (${escapeHtml(record.abbr)})</span><span class="card-abbr">${escapeHtml(record.spec)}</span></div>${rows}</div>`;
        })
        .join('');

      this.filterEval(document.getElementById('evalSearch')?.value || '');
    },

    filterEval(term) {
      const t = (term || '').toLowerCase().trim();
      document.querySelectorAll('#evalBody tr').forEach(row => {
        row.style.display = !t || row.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
      document.querySelectorAll('#evalCards .resident-card').forEach(card => {
        card.style.display = !t || card.textContent.toLowerCase().includes(t) ? '' : 'none';
      });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

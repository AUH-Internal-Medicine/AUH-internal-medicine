/**
 * Exports: PNG image capture and the Excel export of the doctor-statistics table.
 *
 * Two capture paths:
 *   • `captureNode()`   — rasterizes an off-screen layout built by
 *                         views/capture-layouts.js (the "معلوماتي" exports).
 *   • `captureElement()` — clones a live card (the on-call day card), which is
 *                         still the right thing there: what you see is what you send.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { safeNum } = AUH.text;
  const { getDayName } = AUH.dates;
  const { showToast, showDownloadProgress, updateDownloadProgress, hideDownloadProgress } = AUH.ui;

  /**
   * Waits for the browser to lay the stage out — but never forever.
   * requestAnimationFrame stops firing while a tab is in the background, and an
   * export started just before switching tabs used to hang with the progress
   * overlay stuck on screen.
   */
  function nextFrame(timeout = 350) {
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(finish));
      setTimeout(finish, timeout);
    });
  }

  AUH.views.exports = {
  setDownloadBtnState(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = !!loading;
  },

  /** Shared rasterizer: DOM node → PNG download, at a size that survives WhatsApp. */
  async _rasterize(node, filename, options) {
    const opts = options || {};
    const background = opts.background || '#ffffff';
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const scale = Math.min(3.2, Math.max(2.4, dpr * 1.3));

    updateDownloadProgress(18, 'جاري الرسم...');
    const canvas = await html2canvas(node, {
      backgroundColor: background,
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: node.offsetWidth,
      windowHeight: node.offsetHeight
    });

    updateDownloadProgress(64, 'جاري تحسين الجودة...');

    // Padding around the card so it does not touch the image edge.
    const pad = Math.round(16 * scale);
    const padded = document.createElement('canvas');
    padded.width = canvas.width + pad * 2;
    padded.height = canvas.height + pad * 2;
    const ctx = padded.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, padded.width, padded.height);
    ctx.drawImage(canvas, pad, pad);

    // Cap the WIDTH (not the longest side): a tall report must stay readable,
    // and messengers recompress oversized images much harder.
    let out = padded;
    const maxWidth = opts.maxWidth || 1700;
    const maxArea = 12e6;
    let ratio = 1;
    if (padded.width > maxWidth) ratio = maxWidth / padded.width;
    if (padded.width * padded.height * ratio * ratio > maxArea) {
      ratio = Math.sqrt(maxArea / (padded.width * padded.height));
    }
    if (ratio < 1) {
      out = document.createElement('canvas');
      out.width = Math.round(padded.width * ratio);
      out.height = Math.round(padded.height * ratio);
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(padded, 0, 0, out.width, out.height);
    }

    updateDownloadProgress(88, 'جاري حفظ الصورة...');
    const blob = await new Promise(res => out.toBlob(res, 'image/png'));
    if (!blob) throw new Error('PNG export failed');

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  },

  /** Renders an HTML string off-screen at a fixed width, then rasterizes it. */
  async captureNode(html, filename, options) {
    const opts = options || {};
    if (this._id) return;
    this._id = true;
    this.setDownloadBtnState(opts.btn, true);
    showDownloadProgress(opts.title || 'جاري توليد الصورة...');
    updateDownloadProgress(6, 'جاري تجهيز التنسيق...');

    let stage = null;
    try {
      stage = document.createElement('div');
      stage.style.cssText =
        'position:fixed;left:-20000px;top:0;z-index:-1;pointer-events:none;' +
        `width:${opts.width || 900}px;background:#ffffff;`;
      stage.innerHTML = html;
      document.body.appendChild(stage);

      // One frame for layout, then let webfonts settle (both time-boxed).
      await nextFrame();
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]);
      }

      await this._rasterize(stage.firstElementChild || stage, filename, opts);

      updateDownloadProgress(100, 'تم!');
      setTimeout(() => {
        hideDownloadProgress();
        this._id = false;
        this.setDownloadBtnState(opts.btn, false);
        showToast('تم تحميل الصورة ✅');
      }, 420);
    } catch (e) {
      console.error(e);
      hideDownloadProgress();
      this._id = false;
      this.setDownloadBtnState(opts.btn, false);
      showToast('تعذر توليد الصورة. حاول مرة أخرى.');
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    }
  },

  /** Clones a live card and rasterizes it (used by the on-call day export). */
  async captureElement(el, filename, background, btn) {
    if (this._id) return;
    this._id = true;
    this.setDownloadBtnState(btn, true);
    showDownloadProgress('جاري توليد الصورة...');
    updateDownloadProgress(6, 'جاري تجهيز البطاقة...');

    let stage = null;
    try {
      await nextFrame(120);
      stage = document.createElement('div');
      stage.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1;pointer-events:none;';

      const clone = el.cloneNode(true);
      clone.classList.add('capture-mode');
      clone.style.width = '840px';
      clone.style.maxWidth = '840px';
      clone.style.margin = '0';
      stage.appendChild(clone);
      document.body.appendChild(stage);

      await nextFrame();
      await this._rasterize(clone, filename, { background });

      updateDownloadProgress(100, 'تم!');
      setTimeout(() => {
        hideDownloadProgress();
        this._id = false;
        this.setDownloadBtnState(btn, false);
        showToast('تم تحميل الصورة ✅');
      }, 420);
    } catch (e) {
      console.error(e);
      hideDownloadProgress();
      this._id = false;
      this.setDownloadBtnState(btn, false);
      showToast('تعذر توليد الصورة. حاول مرة أخرى.');
    } finally {
      if (stage && stage.parentNode) stage.parentNode.removeChild(stage);
    }
  },

  downloadOncallImage(triggerBtn = null) {
    const el = document.getElementById('oncallCardContent');
    if (!el) return;
    const btn = triggerBtn || el.querySelector('.download-btn');
    const bg = document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff';
    this.captureElement(el, `مناوبات_${document.getElementById('oncallDatePicker').value || this.today}.png`, bg, btn);
  },

  /** The data the "معلوماتي" exports need, stashed by showMe(). */
  _myInfoExportData() {
    const data = this._myInfoExport;
    if (!data || !data.resident) {
      showToast('ابحث عن اسمك أولاً.');
      return null;
    }
    return data;
  },

  /** Calendar only — days with duty are green and name the duty underneath. */
  downloadMyInfoCalendarImage(triggerBtn = null) {
    const data = this._myInfoExportData();
    if (!data) return;

    const cap = AUH.capture;
    const title = data.resident.name + (data.resident.abbr ? ` (${data.resident.abbr})` : '');
    const body =
      cap.buildSummary(data.monthOncalls, this.today) +
      cap.buildCalendar({
        monthKey: data.monthKey,
        oncalls: data.monthOncalls,
        today: this.today,
        isHoliday: date => this.isHolidayDate(date),
        holidayName: date => this.getHolidayName(date)
      });

    const html = cap.buildShell({
      title,
      subtitle: `رزنامة المناوبات — ${cap.monthTitle(data.monthKey)}`,
      body,
      width: 900
    });

    this.captureNode(html, `رزنامة_${data.resident.name}_${data.monthKey}.png`, {
      btn: triggerBtn,
      width: 900,
      title: 'جاري توليد صورة الرزنامة...'
    });
  },

  /** Calendar + the month's on-call details underneath. */
  downloadMyInfoImage(triggerBtn = null) {
    const data = this._myInfoExportData();
    if (!data) return;

    const cap = AUH.capture;
    const title = data.resident.name + (data.resident.abbr ? ` (${data.resident.abbr})` : '');
    const body =
      cap.buildSummary(data.monthOncalls, this.today) +
      cap.buildCalendar({
        monthKey: data.monthKey,
        oncalls: data.monthOncalls,
        today: this.today,
        isHoliday: date => this.isHolidayDate(date),
        holidayName: date => this.getHolidayName(date)
      }) +
      cap.sectionTitle(`تفاصيل المناوبات (${data.monthOncalls.length})`) +
      cap.buildOncallList(data.monthOncalls, {
        today: this.today,
        withColleagues: true,
        holidayName: date => this.getHolidayName(date)
      });

    const html = cap.buildShell({
      title,
      subtitle: `مناوبات ${cap.monthTitle(data.monthKey)}`,
      body,
      width: 900
    });

    this.captureNode(html, `معلوماتي_${data.resident.name}_${data.monthKey}.png`, {
      btn: triggerBtn,
      width: 900,
      title: 'جاري توليد صورة معلوماتي...'
    });
  },

  /**
   * The doctor-statistics workbook — three sheets:
   *   1. احصائيات الأطباء   one row per doctor, one column per shift type
   *   2. تفصيل حسب نوع المناوبة  one row per doctor × shift type, with dates
   *   3. سجل المناوبات       one row per single duty
   * Sheet 1 answers "how many", sheets 2 and 3 answer "which ones exactly" —
   * every number on the site is traceable to its dates inside the file.
   */
  downloadDoctorStatsExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('تعذر تحميل مكتبة إكسل، حدّث الصفحة وحاول مرة أخرى.');
      return;
    }
    if (!this.doctorStats.length) {
      showToast('لا توجد بيانات احصائيات لتصديرها.');
      return;
    }

    const round1 = v => Math.round((safeNum(v) || 0) * 10) / 10;
    const schedule = AUH.domain.oncallSchedule;
    const GROUPS = schedule.GROUPS;
    const GROUP_ORDER = ['wards', 'icu', 'emergency', 'misc', 'other'];

    const rosterOrder = new Map();
    (this.res || []).forEach((r, i) => rosterOrder.set(r.abbr || r.name, i));
    const list = this.doctorStats.slice().sort((a, b) => {
      const ai = rosterOrder.has(a.abbr || a.name) ? rosterOrder.get(a.abbr || a.name) : Infinity;
      const bi = rosterOrder.has(b.abbr || b.name) ? rosterOrder.get(b.abbr || b.name) : Infinity;
      return ai - bi;
    });

    // Every shift type in the sheet, kept in group order so the columns read
    // wards → ICU → emergency → misc rather than in header order.
    const catalogue = this.shiftFilterCatalogue();
    const categories = [];
    catalogue.forEach(g => g.categories.forEach(c => categories.push({ name: c, group: g.key, groupLabel: g.label })));

    /** "سابع 2 · رابع 1 · ثالث خاص 1" — the readable form of one group. */
    const groupDetailText = (entry, groupKey) => Object.entries(entry.groupDetails[groupKey] || {})
      .sort((a, b) => b[1] - a[1])
      .map(([cat, n]) => `${cat} ${n}`)
      .join(' · ');

    const countOf = (entry, category) => (entry.catDates && entry.catDates[category] ? entry.catDates[category].length : 0);

    // One column per discovered "فرز شهر N" so the rotations a doctor already
    // did are filterable in Excel, not buried in a single cell.
    const shiftMonths = this.residentsModel.getShiftMonths();

    // ---- sheet 1: one row per doctor ---------------------------------------
    const rows = list.map(r => {
      const resident = this.residentsModel.findByNameOrAbbr(r.abbr) || this.residentsModel.findByNameOrAbbr(r.name);
      const row = {
        'الاسم': r.name || '',
        'الاختصار': r.abbr || '',
        'الاختصاص': r.spec || '',
        'الحالة': r.status || '',
        'أيام منذ الالتحاق': r.joinDaysSince ?? '',
        'مناوبات تراكمية': r.total || 0,
        'مناوبات تمت': r.completed || 0,
        'مناوبات متبقية': r.remaining || 0,
        'ساعات تمت': round1(r.hoursCompleted),
        'ترتيب الساعات (تمت)': r.rankCompleted || '',
        'ساعات تراكمية': round1(r.hoursTotal),
        'ترتيب الساعات (تراكمية)': r.rankTotal || '',
        'ساعات المناوبات فقط': round1(r.hoursShiftsTotal),
        'ساعات Bonus': round1(r.bonusHours),
        'ساعات Bonus محتسبة': round1(r.bonusCompleted)
      };

      // Group totals, each followed by the breakdown that makes it up.
      GROUP_ORDER.forEach(key => {
        const label = GROUPS[key] ? GROUPS[key].label : key;
        const total = Object.values(r.groupDetails[key] || {}).reduce((a, n) => a + n, 0);
        if (key === 'other' && !total) return;
        row[`مناوبات ${label}`] = total;
        row[`تفصيل ${label}`] = groupDetailText(r, key);
      });

      // One column per individual shift type — this is what makes the file
      // sortable and filterable by "who has how many عناية قلبية".
      categories.forEach(c => (row[c.name] = countOf(r, c.name)));

      row['مناوبات عطل'] = r.holiday || 0;
      row['مناوبات ليلية'] = r.night || 0;
      row['ثناءات'] = r.praiseCount || 0;
      row['عقوبات'] = r.penaltyCount || 0;
      row['عدد الفروز حتى الآن'] = r.rotationsCount || 0;
      row['أول مناوبة'] = r.firstOncall || '';
      row['آخر مناوبة'] = r.lastOncall || '';

      shiftMonths.forEach(month => {
        row[month.label || `فرز شهر ${month.month}`] = resident ? this.residentsModel.getShift(resident, month.month) : '';
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const headerCount = rows.length ? Object.keys(rows[0]).length : 0;
    ws['!cols'] = Array.from({ length: headerCount }, (_, i) => ({ wch: i === 0 ? 26 : i < 4 ? 14 : 13 }));
    ws['!autofilter'] = { ref: ws['!ref'] };
    ws['!freeze'] = { xSplit: 2, ySplit: 1 };

    // ---- sheet 2: doctor × shift type, with the dates behind each count ----
    const detailRows = [];
    list.forEach(r => {
      const byCategory = {};
      (r.assignments || []).forEach(a => (byCategory[a.category] = byCategory[a.category] || []).push(a));
      Object.entries(byCategory)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([category, items]) => {
          const sorted = items.slice().sort((x, y) => x.date.localeCompare(y.date));
          const group = schedule.classifyGroup(category);
          detailRows.push({
            'الاسم': r.name || '',
            'الاختصار': r.abbr || '',
            'المجموعة': GROUPS[group] ? GROUPS[group].label : group,
            'نوع المناوبة': category,
            'العدد': sorted.length,
            'تمّت': sorted.filter(a => a.isCompleted).length,
            'متبقية': sorted.filter(a => !a.isCompleted).length,
            'ساعات': round1(sorted.reduce((sum, a) => sum + (a.hours || 0), 0)),
            'منها عطل': sorted.filter(a => a.isHoliday).length,
            'منها ليلية': sorted.filter(a => a.isNight).length,
            'التواريخ': sorted.map(a => a.date).join(' · ')
          });
        });
    });

    const wsDetail = XLSX.utils.json_to_sheet(
      detailRows.length ? detailRows : [{ 'الاسم': '', 'الاختصار': '', 'المجموعة': '', 'نوع المناوبة': '', 'العدد': '', 'تمّت': '', 'متبقية': '', 'ساعات': '', 'منها عطل': '', 'منها ليلية': '', 'التواريخ': '' }]
    );
    wsDetail['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 70 }];
    wsDetail['!autofilter'] = { ref: wsDetail['!ref'] };

    // ---- sheet 3: one row per single duty ----------------------------------
    const logRows = [];
    list.forEach(r => {
      (r.assignments || [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach(a => {
          logRows.push({
            'الاسم': r.name || '',
            'الاختصار': r.abbr || '',
            'التاريخ': a.date,
            'اليوم': getDayName(a.date) || '',
            'الشهر': a.date ? a.date.slice(0, 7) : '',
            'نوع المناوبة': a.category,
            'المجموعة': GROUPS[a.group] ? GROUPS[a.group].label : a.group,
            'الساعات': round1(a.hours),
            'عطلة': a.isHoliday ? 'نعم' : 'لا',
            'ليلية': a.isNight ? 'نعم' : 'لا',
            'الحالة': a.isCompleted ? 'تمّت' : 'قادمة'
          });
        });
    });

    const wsLog = XLSX.utils.json_to_sheet(
      logRows.length ? logRows : [{ 'الاسم': '', 'الاختصار': '', 'التاريخ': '', 'اليوم': '', 'الشهر': '', 'نوع المناوبة': '', 'المجموعة': '', 'الساعات': '', 'عطلة': '', 'ليلية': '', 'الحالة': '' }]
    );
    wsLog['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 13 }, { wch: 11 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
    wsLog['!autofilter'] = { ref: wsLog['!ref'] };

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'احصائيات الأطباء');
    XLSX.utils.book_append_sheet(wb, wsDetail, 'تفصيل حسب نوع المناوبة');
    XLSX.utils.book_append_sheet(wb, wsLog, 'سجل المناوبات');
    XLSX.writeFile(wb, `احصائيات_الاطباء_${this.today}.xlsx`);
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

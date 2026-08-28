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

    const rosterOrder = new Map();
    (this.res || []).forEach((r, i) => rosterOrder.set(r.abbr || r.name, i));
    const list = this.doctorStats.slice().sort((a, b) => {
      const ai = rosterOrder.has(a.abbr || a.name) ? rosterOrder.get(a.abbr || a.name) : Infinity;
      const bi = rosterOrder.has(b.abbr || b.name) ? rosterOrder.get(b.abbr || b.name) : Infinity;
      return ai - bi;
    });
    // One column per discovered "فرز شهر N" so the rotations a doctor already
    // did are filterable in Excel, not buried in a single cell.
    const shiftMonths = this.residentsModel.getShiftMonths();

    const rows = list.map(r => {
      const resident = this.residentsModel.findByNameOrAbbr(r.abbr) || this.residentsModel.findByNameOrAbbr(r.name);
      const row = {
        'الاسم': r.name || '',
        'الاختصار': r.abbr || '',
        'أيام منذ الالتحاق': r.joinDaysSince ?? '',
        'مناوبات تراكمية': r.total || 0,
        'مناوبات تمت': r.completed || 0,
        'ساعات تمت': round1(r.hoursCompleted),
        'ترتيب الساعات (تمت)': r.rankCompleted || '',
        'ساعات تراكمية': round1(r.hoursTotal),
        'ترتيب الساعات (تراكمية)': r.rankTotal || '',
        'ساعات المناوبات فقط': round1(r.hoursShiftsTotal),
        'ساعات Bonus': round1(r.bonusHours),
        'ساعات Bonus محتسبة': round1(r.bonusCompleted),
        'أجنحة': r.wards || 0,
        'عنايات': r.icu || 0,
        'اسعاف': r.emergency || 0,
        'منوع': r.misc || 0,
        'مناوبات عطل': r.holiday || 0,
        'مناوبات ليلية': r.night || 0,
        'ثناءات': r.praiseCount || 0,
        'عدد الفروز حتى الآن': r.rotationsCount || 0,
        'أول مناوبة': r.firstOncall || '',
        'آخر مناوبة': r.lastOncall || ''
      };

      shiftMonths.forEach(month => {
        row[month.label || `فرز شهر ${month.month}`] = resident ? this.residentsModel.getShift(resident, month.month) : '';
      });

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const baseWidths = [24, 10, 16, 15, 13, 11, 18, 14, 20, 18, 12, 16, 9, 9, 9, 9, 13, 13, 10, 16, 13, 13];
    ws['!cols'] = baseWidths.concat(shiftMonths.map(() => ({ wch: 18 }))).map(w => (typeof w === 'number' ? { wch: w } : w));

    ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'احصائيات الأطباء');
    XLSX.writeFile(wb, `احصائيات_الاطباء_${this.today}.xlsx`);
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

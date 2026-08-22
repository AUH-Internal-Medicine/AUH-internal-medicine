/**
 * Exports: PNG image capture (on-call card + "معلوماتي" card) and the Excel
 * export of the doctor-statistics table.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { safeNum } = AUH.text;
  const { showToast, showDownloadProgress, updateDownloadProgress, hideDownloadProgress } = AUH.ui;

  AUH.views.exports = {
  setDownloadBtnState(btn, loading) {
    if (!btn) return;
    btn.classList.toggle('loading', loading);
    btn.disabled = !!loading;
  },

  async _captureImage(el, fn, bg, btn) {
    if (this._id) return;
    this._id = true;
    this.setDownloadBtnState(btn, true);
    showDownloadProgress('جاري توليد الصورة...');
    updateDownloadProgress(5);

    let stage = null;
    try {
      await new Promise(requestAnimationFrame);
      const isOncall = el.id === 'oncallCardContent';
      const baseW = isOncall ? 840 : 920;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      // Always render at the highest quality tier — a single render scale for a crisp,
      // well anti-aliased source image (the on-screen "quality" the resident sees on their phone).
      const sc = Math.min(3.6, Math.max(2.85, dpr * 1.35));

      stage = document.createElement('div');
      stage.style.position = 'fixed';
      stage.style.left = '-10000px';
      stage.style.top = '0';
      stage.style.zIndex = '-1';
      stage.style.pointerEvents = 'none';

      const capNode = el.cloneNode(true);
      capNode.classList.add('capture-mode');
      capNode.style.width = baseW + 'px';
      capNode.style.maxWidth = baseW + 'px';
      capNode.style.margin = '0';

      stage.appendChild(capNode);
      document.body.appendChild(stage);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      updateDownloadProgress(14);

      const canvas = await html2canvas(capNode, {
        backgroundColor: bg,
        scale: sc,
        useCORS: true,
        allowTaint: true,
        logging: false
      });

      updateDownloadProgress(62);

      const pd = isOncall ? 20 : 22;
      const nc = document.createElement('canvas');
      nc.width = canvas.width + pd * 2;
      nc.height = canvas.height + pd * 2;

      const ctx = nc.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, nc.width, nc.height);
      ctx.drawImage(canvas, pd, pd);

      // Cap the FINAL exported dimensions to a size that WhatsApp/Telegram won't crush further
      // when the image is sent as a "photo": their own auto-compression is what causes the
      // "looks fine on the phone, blurry after sending" effect, and it hits oversized images
      // much harder. Keeping the output around ~2200px (instead of 3400+) means their pass has
      // far less downscaling to do, so what arrives on the other end looks noticeably sharper.
      const maxSide = 2200;
      const side = Math.max(nc.width, nc.height);
      let outCanvas = nc;

      if (side > maxSide) {
        const ratio = maxSide / side;
        outCanvas = document.createElement('canvas');
        outCanvas.width = Math.round(nc.width * ratio);
        outCanvas.height = Math.round(nc.height * ratio);
        const octx = outCanvas.getContext('2d');
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';
        octx.drawImage(nc, 0, 0, outCanvas.width, outCanvas.height);
      }

      updateDownloadProgress(86);

      const blob = await new Promise(res => outCanvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG export failed');

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = fn;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      updateDownloadProgress(100);
      setTimeout(() => {
        hideDownloadProgress();
        this._id = false;
        this.setDownloadBtnState(btn, false);
        showToast('تم التحميل بجودة عالية! لأفضل نتيجة عند المشاركة عبر واتساب/تلغرام، اختر إرسالها "كملف/document" لا "كصورة" لتفادي إعادة الضغط.');
      }, 450);
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
    this._captureImage(el, `مناوبات_${document.getElementById('oncallDatePicker').value || this.today}.png`, bg, btn);
  },

  downloadMyInfoImage() {
    const el = document.getElementById('myInfoContent');
    if (!el) return;
    const btn = el.querySelector('.download-btn');
    const bg = document.body.classList.contains('dark-mode') ? '#1e293b' : '#ffffff';
    this._captureImage(el, `${this.currentMyInfo?.name || 'معلوماتي'}.png`, bg, btn);
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
    const rows = list.map(r => ({
      'الاسم': r.name || '',
      'الاختصار': r.abbr || '',
      'أيام منذ الالتحاق': r.joinDaysSince ?? '',
      'مناوبات تراكمية': r.total || 0,
      'مناوبات تمت': r.completed || 0,
      'ساعات تمت': round1(r.hoursCompleted),
      'ترتيب الساعات (تمت)': r.rankCompleted || '',
      'ساعات تراكمية': round1(r.hoursTotal),
      'ترتيب الساعات (تراكمية)': r.rankTotal || '',
      'أجنحة': r.wards || 0,
      'عنايات': r.icu || 0,
      'اسعاف': r.emergency || 0,
      'منوع': r.misc || 0,
      'مناوبات عطل': r.holiday || 0,
      'مناوبات ليلية': r.night || 0,
      'أول مناوبة': r.firstOncall || '',
      'آخر مناوبة': r.lastOncall || ''
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 24 }, { wch: 10 }, { wch: 16 }, { wch: 15 }, { wch: 13 },
      { wch: 11 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 9 },
      { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 13 }, { wch: 13 },
      { wch: 13 }, { wch: 13 }
    ];
    ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'احصائيات الأطباء');
    XLSX.writeFile(wb, `احصائيات_الاطباء_${this.today}.xlsx`);
  }
  };
})(typeof window !== 'undefined' ? window : globalThis);

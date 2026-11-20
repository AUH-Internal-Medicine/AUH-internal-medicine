/**
 * محرّك قواعد تبديل/شيل المناوبات — مُستخلَصٌ من `js/swap.js` ليُستعمَل من أكثر
 * من صفحة (`swap.html` ونموذج تقديم الطلب، و`swap-find.html` واجهة «البحث عن
 * بديل») بلا أي تكرارٍ لمنطق منع الستريب والتعارضات. **لا كتابة مزدوجة لهذا
 * المنطق على الخادم** — نفس فلسفة المشروع القائمة: الفحص هنا جانب-عميل بحت،
 * والمراجعة البشرية من الأدمن قبل أي كتابةٍ فعلية على الجدول هي الضمانة
 * النهائية (راجع `نظام-التبديل.gs`: `submitRequest_`/`adminDecideRequest_`
 * لا يُعيدان هذا الفحص إطلاقاً، وهذا مقصود).
 *
 * الفرق الوحيد عن النسخة الأصلية داخل `swap.js`: كل دالّةٍ هنا نقيّة تماماً —
 * تأخذ قوائم المناوبات كمعاملاتٍ صريحة بدل قراءتها من حالة صفحةٍ بعينها
 * (`S.duties`/`S.exceptional`) — فتصلح لأي صفحةٍ تملك فهرس مناوباتٍ خاصّاً
 * بها. السلوك نفسه حرفياً، لا إعادة كتابة.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr, splitNames } = AUH.text;

  const HARD = ['إسعاف داخلي ليلي', 'إسعاف داخلي نهاري', 'إسعاف باب ليلي', 'إسعاف باب نهاري',
    'اسعاف بارد ليلي', 'اسعاف بارد صباحي'].map(normAr);

  const dayNum = iso => Math.round(new Date(iso + 'T00:00:00Z') / 86400000);
  const fmt = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;

  /* -------------------------------------------------------------- identity */
  const keyOf = doc => (doc.abbr || doc.name);
  const dutiesOf = (duties, doc) => (doc ? (duties.get(keyOf(doc)) || []) : []);

  /**
   * مناوبتان هما نفس المناوبة فقط إذا تطابق اليوم والفئة معاً — قد يحمل
   * المقيم مناوبتين بنفس اليوم، فحذف «كل ما في ذاك التاريخ» يحذف مناوبةً لم
   * يلمسها التبادل.
   */
  function sameDuty(a, b) {
    return !!a && !!b && a.date === b.date && normAr(a.cat || '') === normAr(b.cat || '');
  }

  /**
   * شكلُ جدول شخصٍ بعد أن تغادره مناوبةٌ وتصله أخرى. يُبنى الجدولُ الذي
   * سينتهي إليه فعلاً (مناوباته ناقص ما يُسلِّمه) ثم يُحاكَم فقط على ما
   * يستلمه — الحكم على الوارد مقابل قائمةٍ ما زالت تحمل الصادر هو ما كان
   * يُخفي تبديلاتٍ صحيحة سابقاً.
   *
   * @param {Array}         list       مناوبات الشخص الحالية
   * @param {Object|string|null} out   المناوبة (أو التاريخ) التي يُسلِّمها؛ null لتغطيةٍ بحتة
   * @param {Object|string} inc        المناوبة (أو التاريخ) التي يستلمها
   * @param {boolean}       allowStrip السماح بستريبٍ محسوبٍ (طلبٌ استثنائي)
   */
  function afterExchange(list, out, inc, allowStrip) {
    const outDuty = typeof out === 'string' ? { date: out, cat: null } : out;
    const rest = (list || []).filter(d => {
      if (!outDuty) return true;
      return outDuty.cat === null ? d.date !== outDuty.date : !sameDuty(d, outDuty);
    });
    const n = dayNum(typeof inc === 'string' ? inc : inc.date);
    const same = rest.find(d => dayNum(d.date) === n);
    const prev = rest.find(d => dayNum(d.date) === n - 1);
    const next = rest.find(d => dayNum(d.date) === n + 1);
    const strip = !same && !!(prev || next);

    return {
      ok: !same && (allowStrip || !strip),
      sameDay: !!same, strip, same, prev, next,
      blocks: [
        same && `مناوبة في نفس اليوم (${same.cat})`,
        prev && `مناوبة في اليوم السابق ${fmt(prev.date)}`,
        next && `مناوبة في اليوم التالي ${fmt(next.date)}`
      ].filter(Boolean)
    };
  }

  /** حُكمٌ على `date` لصاحب `duties`، متجاهلاً التاريخ الذي يُسلِّمه (`ignoreDate`). */
  function evaluate(duties, date, ignoreDate, allowStrip) {
    const r = afterExchange(duties, ignoreDate, date, allowStrip);
    const month = date.slice(0, 7);
    return Object.assign({}, r, {
      after: duties.filter(d => d.date !== ignoreDate && d.date.startsWith(month)).length + 1
    });
  }

  /* ------------------------------------------------- duty groups & gender */
  const GROUPS = {
    'أجنحة': ['تاني', 'ثالث', 'رابع', 'سابع', 'خارجيات'],
    'عنايات': ['عناية قلبية', 'عناية داخلية', 'عناية مركز'],
    'منوع': ['ديال', 'أورام']
  };

  function dutyGroup(cat) {
    const n = normAr(cat || '');
    if (!n) return 'منوع';
    if (n.includes(normAr('اسعاف'))) return 'إسعاف';
    for (const g of Object.keys(GROUPS)) {
      if (GROUPS[g].some(x => n.includes(normAr(x)))) return g;
    }
    return 'منوع';
  }

  /** إسعاف باب — نهاري أو ليلي — حصراً للأطباء الذكور. */
  function isDoorDuty(cat) {
    const n = normAr(cat || '');
    return n.includes(normAr('اسعاف')) && n.includes(normAr('باب'));
  }

  const isMale = doc => normAr((doc && doc.gender) || '') === normAr('طبيب');
  const genderBlocked = (cat, doc) => isDoorDuty(cat) && !isMale(doc);

  /* ------------------------------------------------------------ swap rules */
  /** شيل — هل يستطيع `toDoc` (صاحب `toDuties`) أخذ مناوبتي ببساطة؟ */
  function coverFeasible(myDuty, toDuties, toDoc, allowStrip) {
    if (genderBlocked(myDuty.cat, toDoc)) return null;
    const r = afterExchange(toDuties, null, myDuty, allowStrip);
    return r.ok ? { strip: r.strip } : null;
  }

  /**
   * تبديل — هل أستطيع إعطاء `myDuty` وأخذ `theirDuty`؟ كلا الجدولين يُحاكَيان:
   * كل طرفٍ يفقد ما يُسلِّمه قبل الحكم على ما يصله.
   */
  function swapFeasible(fromDoc, fromDuties, myDuty, toDoc, toDuties, theirDuty, allowStrip) {
    if (sameDuty(myDuty, theirDuty)) return null;
    if (genderBlocked(myDuty.cat, toDoc)) return null;
    if (genderBlocked(theirDuty.cat, fromDoc)) return null;

    const theirs = afterExchange(toDuties, theirDuty, myDuty, allowStrip);
    if (!theirs.ok) return null;
    const mine = afterExchange(fromDuties, myDuty, theirDuty, allowStrip);
    if (!mine.ok) return null;

    return { duty: theirDuty, strip: theirs.strip || mine.strip };
  }

  /** كل مناوبات `toDoc` القابلة للتبديل مقابل مناوبتي. */
  function feasibleSwaps(fromDoc, fromDuties, shift, toDoc, toDuties, today, allowStrip) {
    const late = shift.date < today;
    return toDuties
      .filter(d => (late ? d.date < today : d.date >= today))
      .map(d => swapFeasible(fromDoc, fromDuties, shift, toDoc, toDuties, d, allowStrip))
      .filter(Boolean)
      .map(x => x.duty);
  }

  /** قائمة المناوبات التي سينتهي إليها شخصٌ ما — ما يرسمه «بعد التبديل». */
  function dutiesAfter(duties, add, remove) {
    const list = duties.filter(d => !remove || !sameDuty(d, remove));
    return (add ? list.concat([add]) : list).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * فهرسٌ واحدٌ على جدول المناوبات: لكل طبيبٍ قائمةُ مناوباته مرتّبةً
   * بالتاريخ. نفس «المرور الواحد» الذي كان في `swap.js` (`index()`) حرفياً،
   * بلا أي حسابٍ خاصٍّ بصفحةٍ بعينها (لا شهر العرض الافتراضي ولا غيره).
   */
  function buildDutyIndex(ds) {
    const schedule = AUH.domain.oncallSchedule;
    const residents = ds.residents;
    const oncall = ds.oncall;
    const holidays = new Set(((ds.holidays && ds.holidays.list) || []).map(h => h.date).filter(Boolean));

    const roster = (residents.residents || [])
      .filter(r => r && r.name)
      .map(r => ({
        name: r.name, abbr: r.abbr || '', spec: r.spec || '', status: r.st || '',
        phone: r.phone || '', phone2: r.phone2 || '',
        gender: r.gender || '',
        joined: AUH.status.isJoined(r.st)
      }));

    const duties = new Map();
    const months = new Set();
    (oncall.rows || []).forEach(dayRow => {
      const date = dayRow.date;
      if (!date) return;
      months.add(date.slice(0, 7));
      const holiday = schedule.isHolidayDate(date, holidays);

      for (let col = 2; col < oncall.headers.length; col++) {
        const cat = (oncall.headers[col] || '').trim();
        const cell = (dayRow.row[col] || '').trim();
        if (!cat || !cell) continue;

        const sch = schedule.getCategorySchedule(cat, date, holidays);
        const duty = {
          date, cat, group: schedule.classifyGroup(cat),
          night: schedule.isNightCategory(cat), holiday,
          hard: HARD.includes(normAr(cat)),
          hours: AUH.text.parseDurationHours(sch ? sch.duration : '')
        };

        const seen = new Set();
        splitNames(cell).forEach(raw => {
          const r = residents.findByNameOrAbbr(raw);
          const key = r ? (r.abbr || r.name) : raw;
          if (seen.has(key)) return;
          seen.add(key);
          if (!duties.has(key)) duties.set(key, []);
          duties.get(key).push(duty);
        });
      }
    });

    duties.forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
    return { roster, duties, months: Array.from(months).sort() };
  }

  AUH.domain.swapRules = {
    keyOf, dutiesOf,
    sameDuty, afterExchange, evaluate,
    dutyGroup, isDoorDuty, isMale, genderBlocked,
    coverFeasible, swapFeasible, feasibleSwaps, dutiesAfter,
    buildDutyIndex
  };
})(typeof window !== 'undefined' ? window : globalThis);

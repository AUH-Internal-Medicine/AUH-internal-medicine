/**
 * استبيان المناوبات — الحساب.
 *
 * كل رقم في الصفحتين يُحسب هنا من الردود الخام. لا جدول إحصاءات يدويّاً ولا
 * رقماً منقولاً بخطّ اليد — وهو ثابتٌ في هذا المشروع: الجدول اليدوي كان دائماً
 * متأخّراً عن الواقع.
 *
 * دوال هذا الملف خالصة: تأخذ الردود وتعيد أرقاماً. لا DOM ولا شبكة.
 *
 * **المتوسط وحده يكذب.** فرزٌ متوسطه ٦ قد يكون ستّةً عند الجميع، وقد يكون
 * نصفهم عند ٣ ونصفهم عند ٩ — وهما حالان مختلفان تماماً لمن يبني الجدول. لذلك
 * كل تقييم هنا يعود بثلاثة: المتوسط، والوسيط، و**توزيع الدرجات العشر**.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const { normAr } = AUH.text;

  /** متوسط حسابي يتجاهل الفارغ، ويعيد null إن لم يبقَ شيء. */
  function mean(values) {
    const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function median(values) {
    const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = nums.length >> 1;
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  }

  /**
   * توزيع الدرجات ١..١٠: كم واحداً وضع ١، وكم وضع ٢ … إلى ١٠.
   * القيم الكسرية تُقرَّب لأقرب درجة، وما خرج عن المدى يُقصّ إليه.
   */
  function distribution(values) {
    const bins = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, count: 0 }));
    for (const v of values) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const slot = Math.min(10, Math.max(1, Math.round(v)));
      bins[slot - 1].count++;
    }
    return bins;
  }

  /**
   * أكثر درجة تكراراً (وأعلاها عند التعادل).
   *
   * ويعود `null` إن لم تتكرّر درجةٌ أصلاً: ثلاثة تقييمات مختلفة ليس فيها
   * «أكثر تكراراً»، وإظهار إحداها يوهم بنمطٍ لا وجود له.
   */
  function mode(bins) {
    let best = null;
    for (const b of bins) {
      if (!b.count) continue;
      if (!best || b.count >= best.count) best = b;
    }
    return best && best.count >= 2 ? best.value : null;
  }

  /** الأشهر الموجودة في الردود، الأحدث أولاً. */
  function months(responses) {
    const seen = new Map();
    for (const r of responses || []) {
      if (!r.month) continue;
      seen.set(r.month, (seen.get(r.month) || 0) + 1);
    }
    return [...seen.entries()]
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => (a.month < b.month ? 1 : -1));
  }

  function inMonth(responses, month) {
    if (!month || month === 'all') return responses || [];
    return (responses || []).filter(r => r.month === month);
  }

  /* ------------------------------------------------------------------ summary */

  /**
   * لمحة الشهر: كم شارك، وكم طلب فرزاً سهلاً أو صعباً.
   *
   * لا متوسطات مجمّعة هنا: متوسط صعوبة الفروز كلّها ونسبة التفريغ حُذفا بطلب
   * المالك (2026-09-18) — الرقم المجموع كان يخفي ما تُظهره أسطر الفرز الواحد.
   */
  function summary(responses) {
    const rows = responses || [];
    let hard = 0;
    let easy = 0;
    for (const r of rows) {
      const n = normAr(r.wanted);
      if (!n) continue;
      if (n.includes('صعب')) hard++;
      else if (n.includes('سهل')) easy++;
    }
    return {
      total: rows.length,
      wantedHard: hard,
      wantedEasy: easy,
      wantedNone: rows.length - hard - easy
    };
  }

  /* ------------------------------------------- الفرز الواحد: تقييمان لا واحد */

  /**
   * صيغة المقارنة للفرز: تطبيعٌ عربي، ثم **حذف «ال» من أول كل كلمة**، ثم حذف
   * كلمة «فرز» إن سبقت الاسم.
   *
   * ولماذا لا يكفي `normAr` وحده؟ لأن فيه `replace(/\bال/g, '')`، و`\b` في
   * جافاسكربت حدُّ كلمةٍ بمعيار ASCII: الحروف العربية ليست `\w` إطلاقاً، فلا
   * يقع بينها حدُّ كلمة ولا تُحذف «ال» إلا من أوّل النصّ كلّه. فكانت «العناية
   * القلبية» تصير «عنايه القلبيه»، ولا تطابق إجابة الطبيب «عناية قلبية» —
   * فظهر الفرز بصفر أطباء وفيه خمسة. مقيسٌ لا مفترض.
   *
   * ولم يُمسّ `normAr` نفسه: يقارن به الموقع كلّه أسماء الأطباء، وتغييره
   * لأجل هذه الصفحة تغييرٌ في مطابقة الأسماء في كل تبويب.
   */
  function rotationForm(text) {
    return normAr(text)
      .split(/\s+/)
      .map(word => word.replace(/^ال/, ''))
      .filter(word => word && word !== 'فرز')
      .join(' ')
      .trim();
  }

  /**
   * ربط ما كتبه المشارك في «فرزك لهذا الشهر» بالفرز المعروف الذي يقابله.
   *
   * الحقل نصٌّ حرّ: «صدرية د. مصطفى رنة» و«إسعاف» و«عناية قلبية » كلّها إجابات
   * حقيقية. والربط ضروريّ لأن التقييمين يأتيان من مكانين: صعوبة هذا الشهر من
   * إجابة صاحب الفرز، والتقييم العام من عمودٍ اسمه ثابت في الاستمارة.
   *
   * الأولوية: تطابقٌ تامّ ← الإجابة تحوي اسم الفرز ← اسم الفرز يحوي الإجابة
   * (للمختصَر مثل «إسعاف»)، والأخيرة **إن كان المرشّح واحداً لا أكثر**.
   * وما لم يُطابَق لا يُرمى: يُعرض كما كُتب في «فروز أخرى»، لأن دمج مسمّيين
   * مختلفين فعلاً («مشفى القلب» و«مركز قلب») قرارٌ طبّي يخصّ القسم لا الكود.
   */
  /**
   * مسمّيات يعرف القسم أنها فرزٌ واحد، أقرّها المالك في 2026-09-18.
   * تُقارن بصيغة `rotationForm` (تطبيع + حذف «ال» من أوّل كل كلمة)، وتُفحص
   * قبل أي مطابقة أخرى. هذا **قرار طبّي مكتوب**، لا تخمين من الكود.
   */
  const ROTATION_ALIASES = {
    'داخليه عامه': 'generalWard',
    'عامه': 'generalWard',
    'جناح عامه': 'generalWard',
    'مركز قلب': 'heartHospital',
    'مركز': 'heartHospital',
    'مركو': 'heartHospital'
  };

  function matchRotationKey(rotationText, items) {
    const r = rotationForm(rotationText);
    if (!r) return null;

    const keys = items.map(item => ({ key: item.key, norm: rotationForm(item.label) })).filter(x => x.norm);
    const known = new Set(keys.map(k => k.key));

    const alias = ROTATION_ALIASES[r];
    if (alias && known.has(alias)) return alias;

    for (const item of keys) if (item.norm === r) return item.key;

    const inside = keys.filter(item => r.includes(item.norm));
    if (inside.length) return inside.sort((a, b) => b.norm.length - a.norm.length)[0].key;

    const reverse = keys.filter(item => item.norm.includes(r));
    if (reverse.length === 1) return reverse[0].key;

    return null;
  }

  /** الشكل الموحَّد لأي تقييم: متوسط · وسيط · أكثر درجة · العدد · التوزيع. */
  function ratingOf(values) {
    const bins = distribution(values);
    return {
      avg: mean(values),
      med: median(values),
      mode: mode(bins),
      n: values.filter(v => typeof v === 'number').length,
      hard: values.filter(v => typeof v === 'number' && v >= 8).length,
      dist: bins
    };
  }

  /**
   * سطرٌ لكل فرز معروف:
   *   people   — كم شخصاً هذا الفرز فرزه (في كل المشاركات حتى الآن)
   *   current  — تقييم من يداوم فيه: صعوبته كما قدّرها أهله أنفسهم
   *   general  — تقييم من مرّ عليه: من كل من داوم فيه يوماً
   *
   * وتُحسب من **كل المشاركات منذ بدء الاستبيان** لا من شهر واحد: التقييم العام
   * لا معنى له بشهر.
   */
  function rotationBreakdown(responses, ratingDefs) {
    const rows = responses || [];
    const items = (ratingDefs || []).filter(d => d.group === 'rotations');

    const byKey = new Map();
    for (const item of items) {
      byKey.set(item.key, { key: item.key, label: item.label, people: 0, spellings: new Map(), current: [], general: [] });
    }

    const unmatched = new Map();
    for (const r of rows) {
      if (r.rotation) {
        const key = matchRotationKey(r.rotation, items);
        if (key && byKey.has(key)) {
          const entry = byKey.get(key);
          entry.people++;
          entry.spellings.set(r.rotation, (entry.spellings.get(r.rotation) || 0) + 1);
          if (typeof r.difficulty === 'number') entry.current.push(r.difficulty);
        } else {
          unmatched.set(r.rotation, (unmatched.get(r.rotation) || 0) + 1);
        }
      }
      for (const item of items) {
        const v = r.ratings[item.key];
        if (typeof v === 'number') byKey.get(item.key).general.push(v);
      }
    }

    const out = [...byKey.values()].map(e => ({
      key: e.key,
      label: e.label,
      people: e.people,
      spellings: [...e.spellings.entries()].sort((a, b) => b[1] - a[1]),
      current: ratingOf(e.current),
      general: ratingOf(e.general),
      /**
       * **مؤشّر الصعوبة**: متوسّط كل من صوّت للفرز — من فيه الآن ومن مرّ
       * عليه معاً. وهو الرقم الذي يُبنى عليه حساب عبء كل طبيب.
       *
       * ولماذا متوسّطٌ خام بلا تنعيم؟ قِيس ولم يلزم: التشتّت **بين** الفروز
       * (3.82) أكبر من التشتّت **داخل** الفرز الواحد (2.45)، وأقلّ فرز له
       * ١٦ صوتاً. ومعامل بايز التجريبية يخرج **0.64 صوت**، أي تصحيحٌ بـ١–٤٪
       * — أقلّ من رقمٍ عشري واحد في العرض. فالتعقيد هنا يُشترى بلا ثمن يُدفع.
       * (القياس: 2026-09-20 على ٥٠٤ أصوات.)
       *
       * ويبقى `current` و`general` معروضَين: فرزٌ يراه أهله ٩ ومن مرّ عليه ٥
       * حالٌ يجب أن تُرى، والمؤشّر وحده يخفيها.
       */
      combined: ratingOf(e.current.concat(e.general))
    }));

    return {
      rows: out,
      unmatched: [...unmatched.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
    };
  }

  /** سطرٌ لكل نوع مناوبة: التقييم نفسه بأجزائه الخمسة. */
  function dutyBreakdown(responses, ratingDefs) {
    const rows = responses || [];
    return (ratingDefs || [])
      .filter(d => d.group === 'duties')
      .map(def => ({
        key: def.key,
        label: def.label,
        rating: ratingOf(rows.map(r => r.ratings[def.key]).filter(v => typeof v === 'number'))
      }));
  }

  /**
   * عبء كل طبيب من تاريخ فروزه — والجواب عن «ليس الجميع داوم نفس عدد الأشهر».
   *
   * ┌ لماذا ثلاثة أرقام لا رقمٌ واحد ─────────────────────────────────────────┐
   * │ **المجموع** يقول ما حمله فعلاً، ولا يُقارَن بين من داوم شهراً ومن داوم  │
   * │ أربعة: طبيبٌ شهرٌ واحد في أصعب فرز مجموعه 8.6، وآخرُ أربعةَ أشهر        │
   * │ متوسّطة مجموعه 26 — والثاني ليس أشقى، بل أطولَ خدمةً.                   │
   * │                                                                        │
   * │ **المتوسّط** يقول شدّة العبء لا كمّيته، ويظلم الطويل: أربعةُ أشهر       │
   * │ بمتوسّط 7 عملٌ أثقل من شهرٍ واحد بـ8.                                  │
   * │                                                                        │
   * │ **والفرق عن المتوقَّع** يجمع الاثنين ويُقارَن عبر أعداد أشهر مختلفة:    │
   * │     الفرق = المجموع − (عدد الأشهر × متوسّط القسم لكل شهر)               │
   * │ أي: «كان يُتوقَّع أن تحمل كذا بحسب طول خدمتك؛ حملتَ كذا». موجبٌ =      │
   * │ حمل فوق نصيبه، وسالبٌ = دونه. ووحدته «درجة-شهر» فتُجمع وتُطرح بمعنى.   │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * ❗ **وجُرّب التنعيم البايزي أوّلاً ورُفض بالقياس.** التشتّت بين الأطباء
   *   خرج **صفراً**: بعد طرح أثر الصدفة لا فرق منهجيّاً بين طبيب وآخر —
   *   أي أن التوزيع كان عادلاً في المتوسّط، والاختلاف صدفةُ فرز. ومعامل
   *   بايز خرج ٢٩ ألف شهر، فيسحب الجميع إلى 6.61 ويمحو الترتيب كلّه.
   *   والسبب أن النموذج يقدّر **صفةً كامنة**، والسؤال هنا عن **ماضٍ مُنجَز**:
   *   الشهر الصعب الذي حمله حمله فعلاً، ولا يُنعَّم.
   *
   * @param {Array} residents  صفوف لائحة المقيمين (لكلٍّ `shifts` شهراً بشهر)
   * @param {Array} rows       مخرجات `rotationBreakdown().rows`
   * @param {Array} items      تعريفات الفروز (للمطابقة)
   */
  function burden(residents, rows, items) {
    const index = new Map();
    for (const r of rows || []) {
      if (r.combined && typeof r.combined.avg === 'number') index.set(r.key, r.combined.avg);
    }

    const unrated = new Map();
    const docs = [];

    for (const res of residents || []) {
      const values = [];
      const detail = [];
      const shifts = res.shifts || {};
      for (const month of Object.keys(shifts).sort((a, b) => a - b)) {
        const text = String(shifts[month] || '').trim();
        if (!text) continue;
        const key = matchRotationKey(text, items);
        if (key && index.has(key)) {
          values.push(index.get(key));
          detail.push({ month: Number(month), text, value: index.get(key) });
        } else {
          /* شهرٌ بفرزٍ غير مقيَّم **لا يُحتسب صفراً ولا يُحتسب شهراً**:
           * الصفر يجعل صاحبه يبدو مرتاحاً وهو لم يُقَس، وعدُّه شهراً يخفض
           * متوسّطه بلا سبب. يُطرح من الحساب ويُعرض عدده. */
          unrated.set(text, (unrated.get(text) || 0) + 1);
          detail.push({ month: Number(month), text, value: null });
        }
      }
      if (!values.length) continue;
      const sum = values.reduce((a, b) => a + b, 0);
      docs.push({
        name: res.name,
        abbr: res.abbr,
        months: values.length,
        skipped: detail.length - values.length,
        sum,
        avg: sum / values.length,
        detail
      });
    }

    /* متوسّط القسم لكل **شهر خدمة** — لا متوسّط متوسّطات الأطباء: الأوّل
     * يزن كل شهر مرّة، والثاني يعطي من داوم شهراً وزنَ من داوم أربعة. */
    const totalMonths = docs.reduce((s, d) => s + d.months, 0);
    const perMonth = totalMonths ? docs.reduce((s, d) => s + d.sum, 0) / totalMonths : 0;

    for (const d of docs) {
      d.expected = d.months * perMonth;
      d.dev = d.sum - d.expected;
    }

    /* انحرافٌ معياري للفروق: به وحده يُعرف أي فرقٍ إشارةٌ وأيّه ضجيج. */
    const sd = docs.length
      ? Math.sqrt(docs.reduce((s, d) => s + d.dev * d.dev, 0) / docs.length)
      : 0;

    docs.sort((a, b) => b.dev - a.dev);

    return {
      perMonth,
      sd,
      doctors: docs,
      unrated: [...unrated.entries()].map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)
    };
  }

  /**
   * ترتيب البطاقات. المفاتيح هي نفسها أزرار الترتيب في الواجهة، وما لا تقييم
   * له يهبط إلى الآخر دائماً — لا إلى الأعلى لأن `null` أصغر من كل رقم.
   */
  function sortBreakdown(list, key) {
    const desc = (a, b) => {
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      return b - a;
    };
    const copy = [...list];
    const generalAvg = x => (x.general ? x.general.avg : x.rating.avg);
    const currentAvg = x => (x.current ? x.current.avg : x.rating.avg);
    const count = x => (x.general ? x.general.n : x.rating.n);

    if (key === 'current') return copy.sort((a, b) => desc(currentAvg(a), currentAvg(b)));
    if (key === 'people') return copy.sort((a, b) => (b.people || 0) - (a.people || 0) || desc(generalAvg(a), generalAvg(b)));
    if (key === 'n') return copy.sort((a, b) => count(b) - count(a) || desc(generalAvg(a), generalAvg(b)));
    if (key === 'name') return copy.sort((a, b) => (a.label < b.label ? -1 : 1));
    return copy.sort((a, b) => desc(generalAvg(a), generalAvg(b)));
  }

  /* --------------------------------------------------------- الطلبات والتوصيات */

  /** يُرجع الردود التي تحمل أي طلب أو ملاحظة، مع عدّاد لكل نوع. */
  function requests(responses) {
    const rows = (responses || []).filter(
      r => r.wanted || r.wantedReason || r.daysRequested || r.daysReason || r.scheduleProblem || r.otherRequests
    );
    return {
      rows,
      counts: {
        rotation: rows.filter(r => r.wanted || r.wantedReason).length,
        days: rows.filter(r => r.daysRequested || r.daysReason).length,
        problems: rows.filter(r => r.scheduleProblem).length,
        other: rows.filter(r => r.otherRequests).length
      }
    };
  }

  AUH.domain.surveyStats = {
    mean,
    median,
    distribution,
    ratingOf,
    months,
    inMonth,
    summary,
    rotationForm,
    matchRotationKey,
    rotationBreakdown,
    burden,
    dutyBreakdown,
    sortBreakdown,
    requests
  };
})(typeof window !== 'undefined' ? window : globalThis);

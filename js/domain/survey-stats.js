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
  function matchRotationKey(rotationText, items) {
    const r = rotationForm(rotationText);
    if (!r) return null;

    const keys = items.map(item => ({ key: item.key, norm: rotationForm(item.label) })).filter(x => x.norm);

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
      general: ratingOf(e.general)
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
    dutyBreakdown,
    sortBreakdown,
    requests
  };
})(typeof window !== 'undefined' ? window : globalThis);

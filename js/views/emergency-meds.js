/**
 * «أدوية إسعافية» — مبادرة توفير الأدوية الإسعافية من التبرّعات.
 *
 * الغاية عملية ولحظية: زميلٌ في الإسعاف يحتاج دواءً **الآن**، فيفتح الصفحة
 * فيجد رقم المناوب اليوم من المسؤولين عن الأدوية. ولهذا صندوق «اليوم» في
 * أعلى الصفحة وبأكبر خطّ فيها — وما دونه تفصيلٌ يُقرأ وقت الفراغ.
 *
 * والأرقام والمناوبات **تُقرأ من اللائحة والجدول حيّةً** لا مكتوبةً هنا:
 * تغيير رقم في الشيت يظهر في الصفحة، وجدول الشهر القادم يعمل بلا تعديل سطر.
 * المكتوب هنا أسماء الثمانية لا غير — وهي ما لا يعرفه الجدول.
 */
(function (global) {
  'use strict';

  const AUH = global.AUH;
  const esc = s => AUH.text.escapeHtml(String(s ?? ''));
  const { normAr } = AUH.text;

  /** المتطوّعون الثمانية — بأسمائهم كما في اللائحة، واختصاراتهم كما في الجدول. */
  const VOLUNTEERS = [
    { name: 'علي حامد محمد',            abbr: 'علي محمد' },
    { name: 'شهد علي اللاذقاني',        abbr: 'شهد' },
    { name: 'عبد الرحمن صلاح العرابي',  abbr: 'العرابي' },
    { name: 'حلا محمد حمام النعساني',   abbr: 'حلا' },
    { name: 'ماهر منير قارح',           abbr: 'ماهر' },
    { name: 'رزان عدنان الشيخ',         abbr: 'رزان' },
    { name: 'جودي محمود طعمه',          abbr: 'طعمه' },
    { name: 'آية خديجه ابراهيم شنطه',   abbr: 'شنطه' }
  ];

  /** موقع المبادرة — يحتاج VPN من داخل سوريا. */
  const SITE = 'https://aleppo-emergency-support.yocclp21349481.chatgpt.site/';

  /**
   * بيانات التبرّع — محفظة باسم د. عبد الله خلدون سمونة.
   *
   * **الكود هو الأصل والرمز مساعد.** لو رُسم رمزٌ من نصٍّ لا يطابق ما ينتظره
   * تطبيق المحفظة لَذهب المسح إلى لا شيء — والمال لا يُجرَّب عليه. فالكود
   * معروضٌ كاملاً وقابلاً للنسخ، وهو الطريق المضمون.
   *
   * وإن وُضع ملفّ `donation-qr.png` بجانب `index.html` (صورة الرمز من التطبيق
   * نفسه) فهو ما يُعرض؛ وإلا رُسم رمزٌ من الكود.
   */
  const DONATION = {
    code:  '1b5c1cd13a9512bfef4abb28ac12ee63',
    owner: 'عبد الله خلدون سمونة',
    label: 'التبرّع للمبادرة',
    via:   'شام كاش',
    image: 'donation-qr.png'
  };

  /** رسالة المشرفين — تُعرض مطويّة لأنها طويلة، وتُفتح بنقرة. */
  const MESSAGE = `السلام عليكم ورحمة الله وبركاته

في البداية أنا أحد الأشخاص المشرفين على موضوع الأدوية الإسعافية وبدي احكيلكن كم نقطة.

المشروع بلّش قبل سنة وخمس شهور كفكرة من دفعتنا (٤٩)، الهدف كان إنو نأمّن الأدوية الإسعافية المهمة يلي المشفى ما عم يحسن يأمّنها، كحلّ مؤقّت لوقت ما يتحسّن وضع المشفى.

في البداية كنا مفكّرين شغلة ٦ شهور مو أكتر. بعدها بلّشنا نضيف الدفعات التانية (٥٠–٥١) الموجودين بألمانيا، والهدف إنو نجمع شهرياً مبلغ على قدّ استطاعة كل شخص. في ناس عم تدفع ١٠ يورو بالشهر وفي ناس عم تدفع أكتر. وفي ناس عم تدفع بالرغم من إنو لسا ما خلّصوا تعديل وما عندهن الدخل الكبير — يعني الحمدلله في تعاون من الكل. المقصد من كلامي إنو المشروع صغير والتمويل على قدّو، لهيك ما عم نحسن نغطّي شي برّا الإسعاف، وميزانية الإسعاف بالأساس كبيرة بالنسبة لوضعنا. (غروبنا فيه حالياً ١٣٠ شخص من كل الدفعات بس ما الكل عم يتبرّع.)

مع الوقت الحمدلله قدرنا نحافظ على مبلغ ثابت شهري نغطّي فيه الأدوية متل ما الكل كان ملاحظ. وكان الإسعاف الداخلي مغطّى بشكل كامل من ناحية الأدوية والحمد لله الأمور تمام.

بالفترة الأخيرة لاحظنا إنو الاستهلاك زاد — وهاد شي طبيعي بما إنو نحنا مشفى كبير وعدد مراجعين كبير — بس ميزانيتنا بألمانيا ما زادت. ولذلك وللأسف اضطرّينا نوقف المشروع بشكل مؤقّت. لهيك بهالموضوع بدنا كمان مساعدتكم.

سمعنا إنو في أصناف تأمّنت من الصيدلية الإسعافية (تقريباً ١٠ أصناف) ومع ذلك الاستهلاك كان عم يروح من أدوية التبرّعات — يمكن لأنو الوصول إلها أسهل. بس هاد الشي إلو أثر كبير علينا، وبالنهاية تمويل إدارة المشفى مو متل تمويل مشروعنا الصغير.

وكمان في بعض الأدوية زاد استهلاكها بشكل كبير متل الأوميزاك: في أحد الأشهر اقترب الاستعمال لـ١٠٠٠ أمبولة. لذلك كمان ننتبه على هالنقطة. بعرف إنو في بالمشفى قاعدة اسمها «كل ألم بطني غير مستجيب على السبازما نعطيه أوميزاك» — هي القاعدة كانت على زماننا كمان 😁 بس هي غير صحيحة، لذلك التوجّه الصحيح كمان يساعد كتير بهالموضوع، هاد ماعدا الآثار الطبية وتفادي اختلاطات دوائية غير مرغوبة.

بالنهاية المشروع صار أكبر من الشي يلي حسبنالو بالبداية، واستمرّينا أكتر من الفترة يلي كنا متوقّعينها، وحالياً الطلب بالإسعاف أكبر من التمويل تبعنا. وإن شاء الله هدفنا كلنا إنو نساعد المرضى على قدّ استطاعتنا، بس بدنا تعاون الكل: يعني الدوا الموجود بالمشفى لازم ينبعت المرافق يجيبه من الصيدلية الإسعافية، لحتى نخفّف استهلاك أدوية التبرّعات.

من لمّا وقّفنا أدوية التبرّعات حاولنا نلاقي صيغة تانية أو طريقة لننظّم الأمور لحتى ما نقطع الأدوية. متل ما قلتلكن، القصة باختصار هي استهلاك أكبر من قدرة المشروع.

بدنا الكل يتعاون معنا بهي النقطة لحتى ننقّص استهلاك الأدوية يلي متوفّرة بالمشفى، وبالتالي نحسن نكمّل بمشروعنا، وإن شاء الله بالمستقبل نكبّره إذا توفّرت الإمكانيات.

وصحيح نحنا سافرنا من زمان وصرنا بعاد، بس لسا متذكّرين وضع المشفى والمرضى وعم نحاول حسب استطاعتنا نحسّن الوضع. وحتى كمان عم نسمع إنو في قسم منيح منكم — بالمبالغ الموجودة عم يحاولوا يدعموا المشروع ويتبرّعوا ولو بمبالغ زهيدة — وهاد الشي منقدّره كتير. وأي حدا فيكم عم يشتغل بهالمشفى فهو عم يتبرّع من وقته وجهده متل ما نحنا عم نتبرّع بالمصاري؛ بالنهاية المصاري لحالها ما بتعمل شي بدون جهد منكم، فالله يجزيكم الخير.

وصار عنا حالياً علم بالأدوية يلي متوفّرة بالمشفى، لهيك نزّلنا نحنا اليوم الأدوية يلي المشفى مالو موفّرها، والميزانية يلي وفّرناها رح نحطّها بمكان تاني إن شاء الله.

موفّقين إن شاء الله، وأي حدا منكم عنده سؤال أو اقتراح فيه يبعتلنا.

والسلام عليكم ورحمة الله وبركاته`;

  /* ─────────────────────────── الرسم ─────────────────────────── */

  function render() {
    const host = document.getElementById('emergMedsHost');
    if (!host) return;
    const app = global.app;

    const today = AUH.dates.todayIso();
    const onDuty = dutiesToday(app, today);
    // مَن منهم مناوب اليوم يُوسم في القائمة أيضاً، لا في صندوق اليوم وحده:
    // من ينزل إلى القائمة ليتّصل بأقربهم يجب أن يرى من هو في المشفى الآن.
    const dutyNames = new Set(onDuty.map(d => normAr(d.name)));
    const people = VOLUNTEERS.map(v => {
      const info = lookup(app, v);
      return Object.assign({}, v, info, {
        onDutyToday: dutyNames.has(normAr(info.displayName || v.name))
      });
    });
    // المناوبون اليوم أوّلاً
    people.sort((a, b) => (b.onDutyToday ? 1 : 0) - (a.onDutyToday ? 1 : 0));

    host.innerHTML =
      '<div class="section-header"><h2><i class="fas fa-kit-medical"></i> الأدوية الإسعافية</h2>' +
        '<span class="em-sub">مبادرة تطوّعية لتوفير الأدوية الإسعافية من التبرّعات</span></div>' +

      todayBox(today, onDuty) +

      '<div class="em-grid">' +
        '<section class="em-card"><h3><i class="fas fa-user-doctor"></i> المتطوّعون من السنة الأولى</h3>' +
          '<p class="em-note">ثمانية تطوّعوا لتوفير الأدوية الإسعافية. ' +
          'إن لم يكن أحدهم مناوباً اليوم، تواصل مع أقربهم إليك.</p>' +
          '<div class="em-people">' + people.map(personRow).join('') + '</div>' +
        '</section>' +

        '<section class="em-card"><h3><i class="fas fa-hand-holding-heart"></i> ادعم المبادرة</h3>' +
          '<p class="em-note">المشروع يُموَّل من تبرّعات الزملاء. كل مبلغ — مهما صغر — يُترجَم دواءً في الإسعاف.</p>' +
          (DONATION.via ? `<div class="em-via"><i class="fas fa-wallet"></i> التبرّع عبر <b>${esc(DONATION.via)}</b></div>` : '') +
          (DONATION.code
            ? '<button type="button" class="em-btn p" id="emDonate">' +
              '<i class="fas fa-qrcode"></i> تبرَّع — الرمز والكود</button>'
            : '<div class="em-soon"><i class="fas fa-circle-info"></i> ' +
              'وسيلة التبرّع لم تُنشر على الموقع بعد. راجع المشرفين.</div>') +

          '<h3 style="margin-top:20px"><i class="fas fa-globe"></i> موقع المبادرة</h3>' +
          `<a class="em-btn" href="${esc(SITE)}" target="_blank" rel="noopener">` +
            '<i class="fas fa-up-right-from-square"></i> افتح موقع المبادرة</a>' +
          '<div class="em-vpn"><i class="fas fa-shield-halved"></i> ' +
            '<b>يحتاج VPN.</b> الموقع لا يُفتح من داخل سوريا بلا وسيط.</div>' +
        '</section>' +
      '</div>' +

      '<section class="em-card em-msg"><h3><i class="fas fa-envelope-open-text"></i> رسالة من المشرفين</h3>' +
        '<div class="em-msg-body" id="emMsgBody">' +
          MESSAGE.trim().split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('') +
        '</div>' +
        '<button type="button" class="em-more" id="emMore">' +
          '<i class="fas fa-chevron-down"></i> اقرأ الرسالة كاملة</button>' +
      '</section>';

    const more = document.getElementById('emMore');
    more.addEventListener('click', () => {
      const body = document.getElementById('emMsgBody');
      const open = body.classList.toggle('open');
      more.innerHTML = open
        ? '<i class="fas fa-chevron-up"></i> اطوِ الرسالة'
        : '<i class="fas fa-chevron-down"></i> اقرأ الرسالة كاملة';
    });

    const don = document.getElementById('emDonate');
    if (don) don.addEventListener('click', openDonation);

    wirePhoneButtons(host);
  }

  /** صندوق اليوم — أكبر ما في الصفحة، لأنه سبب فتحها. */
  function todayBox(iso, onDuty) {
    const d = new Date(iso + 'T00:00:00');
    const when = `${AUH.constants.DAY_NAMES[d.getDay()]} ${d.getDate()} ` +
                 `${AUH.constants.MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;

    if (!onDuty.length) {
      return '<div class="em-today none">' +
        `<div class="em-today-date"><i class="fas fa-calendar-day"></i> ${esc(when)}</div>` +
        '<div class="em-today-empty"><i class="fas fa-user-slash"></i>' +
          '<b>لا أحد من المسؤولين مناوب اليوم</b>' +
          '<span>تواصل مع أيٍّ منهم من القائمة أدناه.</span></div></div>';
    }

    return '<div class="em-today">' +
      `<div class="em-today-date"><i class="fas fa-calendar-day"></i> ${esc(when)}</div>` +
      '<div class="em-today-label">المناوبون اليوم من المسؤولين عن الأدوية</div>' +
      '<div class="em-today-list">' + onDuty.map(p =>
        '<div class="em-duty">' +
          `<div class="em-duty-who"><b>${esc(p.name)}</b>` +
            `<span class="em-duty-cat"><i class="fas fa-hospital"></i> ${esc(p.category)}</span></div>` +
          (p.phone
            ? `<a class="em-call" href="tel:${esc(p.phone.replace(/\s/g, ''))}">` +
              `<i class="fas fa-phone"></i> ${esc(p.phone)}</a>`
            : '<span class="em-nophone">لا رقم في اللائحة</span>') +
        '</div>').join('') +
      '</div></div>';
  }

  /**
   * هل هذا جهاز يستطيع الاتصال فعلاً؟
   *
   * `tel:` على الهاتف يفتح لوحة الاتصال، وعلى الحاسوب يذهب إلى FaceTime أو
   * إلى لا شيء — وهذا ما لا يريده المالك. فعلى الحاسوب يصير زرّ الاتصال نسخاً
   * للرقم مع إشعار، وعلى الهاتف يتّصل كما يجب.
   */
  const canDial = () =>
    /Android|iPhone|iPad|iPod|Mobile/i.test(global.navigator.userAgent) ||
    (global.matchMedia && global.matchMedia('(pointer: coarse)').matches);

  function personRow(p) {
    const clean = (p.phone || '').replace(/\D/g, '');
    const wa = clean ? (clean.startsWith('0') ? '963' + clean.slice(1) : clean) : '';
    const tel = (p.phone || '').replace(/\s/g, '');

    return '<div class="em-person">' +
      `<div class="em-person-n"><b>${esc(p.displayName || p.name)}</b>` +
        (p.onDutyToday ? '<span class="em-badge">مناوب اليوم</span>' : '') +
        (p.phone ? `<span class="em-num">${esc(p.phone)}</span>` : '') + '</div>' +
      (p.phone
        ? '<div class="em-person-a">' +
            (wa ? `<a class="em-act wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener" ` +
                  'title="واتساب"><i class="fab fa-whatsapp"></i><span>واتساب</span></a>' : '') +
            `<a class="em-act call" href="tel:${esc(tel)}" data-tel="${esc(tel)}" title="اتصال">` +
              '<i class="fas fa-phone"></i><span>اتصال</span></a>' +
            `<button type="button" class="em-act copy" data-copy="${esc(tel)}" title="نسخ الرقم">` +
              '<i class="fas fa-copy"></i><span>نسخ</span></button>' +
          '</div>'
        : '<span class="em-nophone">لا رقم في اللائحة</span>') +
    '</div>';
  }

  /** أزرار الاتصال والنسخ — تُربط بعد كل رسم. */
  function wirePhoneButtons(host) {
    host.querySelectorAll('.em-act.copy').forEach(b =>
      b.addEventListener('click', () => copyNumber(b, b.dataset.copy)));

    // على الحاسوب: الاتصال يصير نسخاً بدل أن يفتح FaceTime
    if (canDial()) return;
    host.querySelectorAll('.em-act.call').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        copyNumber(a, a.dataset.tel, 'نُسخ — اتصل من هاتفك');
      });
      a.title = 'لا يمكن الاتصال من الحاسوب — اضغط لنسخ الرقم';
    });
  }

  async function copyNumber(btn, num, okText) {
    const span = btn.querySelector('span');
    const original = span ? span.textContent : '';
    const done = t => {
      if (!span) return;
      span.textContent = t;
      btn.classList.add('ok');
      setTimeout(() => { span.textContent = original; btn.classList.remove('ok'); }, 2000);
    };
    try {
      await navigator.clipboard.writeText(num);
      done(okText || 'نُسخ');
    } catch (e) {
      // الحافظة تُرفض على http أو في متصفّح قديم — يبقى التحديد اليدوي
      const t = document.createElement('textarea');
      t.value = num; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(okText || 'نُسخ'); }
      catch (e2) { done('انسخه يدوياً'); }
      t.remove();
    }
  }

  /* ─────────────────────── القراءة من البيانات ─────────────────────── */

  /** رقم المتطوّع واسمه كما في اللائحة — حيّاً لا مكتوباً هنا. */
  function lookup(app, v) {
    const model = app && app.rosterModelFor ? app.rosterModelFor(1) : (app && app.residentsModel);
    if (!model) return {};
    const r = model.findByNameOrAbbr(v.name) || model.findByNameOrAbbr(v.abbr);
    return r ? { displayName: r.name, phone: r.phone, abbr: r.abbr || v.abbr } : {};
  }

  /**
   * من منهم مناوب اليوم، وما مناوبته.
   *
   * يُقرأ من جدول السنة الأولى نفسه الذي تعرضه رزنامة المناوبات — فلا جدول
   * ثانٍ يُحدَّث على حدة ويفترق عنه.
   */
  function dutiesToday(app, iso) {
    if (!app || !app.oncRows || !app.oncHeaders) return [];
    const row = app.oncRows.find(r => r.date === iso);
    if (!row) return [];

    const byAbbr = {};
    VOLUNTEERS.forEach(v => { byAbbr[normAr(v.abbr)] = v; });

    const out = [];
    for (let col = 2; col < app.oncHeaders.length; col++) {
      const cat = app.oncHeaders[col] || '';
      const cell = (row.row[col] || '').trim();
      if (!cell) continue;
      cell.split(/\s*[-–—,،\n\r]\s*/).forEach(piece => {
        const v = byAbbr[normAr(piece.trim())];
        if (!v) return;
        const info = lookup(app, v);
        out.push({ name: info.displayName || v.name, phone: info.phone || '', category: cat });
      });
    }
    return out;
  }

  /* ─────────────────────────── التبرّع ─────────────────────────── */

  function openDonation() {
    let m = document.getElementById('emDonModal');
    if (m) m.remove();

    m = document.createElement('div');
    m.id = 'emDonModal';
    m.className = 'em-modal';
    m.innerHTML =
      '<div class="em-modal-box">' +
        '<button type="button" class="em-modal-x" title="إغلاق">&times;</button>' +
        `<h3><i class="fas fa-hand-holding-heart"></i> ${esc(DONATION.label)}</h3>` +
        (DONATION.via ? `<div class="em-via"><i class="fas fa-wallet"></i> التبرّع عبر <b>${esc(DONATION.via)}</b></div>` : '') +
        (DONATION.owner ? `<p class="em-owner">باسم <b>${esc(DONATION.owner)}</b></p>` : '') +
        '<div class="em-qr" id="emQr"></div>' +
        '<div class="em-code-label">كود المحفظة</div>' +
        '<div class="em-code-row">' +
          `<code id="emCode">${esc(DONATION.code)}</code>` +
          '<button type="button" class="em-btn p sm" id="emCopy"><i class="fas fa-copy"></i> نسخ</button>' +
        '</div>' +
        '<p class="em-note" style="margin-top:12px">إن لم يقرأ التطبيقُ الرمزَ، انسخ الكود وألصقه فيه.</p>' +
      '</div>';
    document.body.appendChild(m);

    const close = () => m.remove();
    m.querySelector('.em-modal-x').addEventListener('click', close);
    m.addEventListener('click', e => { if (e.target === m) close(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    drawQr(DONATION.code);

    document.getElementById('emCopy').addEventListener('click', async () => {
      const btn = document.getElementById('emCopy');
      try {
        await navigator.clipboard.writeText(DONATION.code);
        btn.innerHTML = '<i class="fas fa-check"></i> نُسخ';
      } catch (e) {
        // الحافظة تُرفض على http أو في متصفّح قديم — التحديد اليدوي يبقى ممكناً
        const r = document.createRange();
        r.selectNode(document.getElementById('emCode'));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        btn.innerHTML = '<i class="fas fa-hand-pointer"></i> حُدِّد — انسخه';
      }
      setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> نسخ'; }, 2200);
    });
  }

  /**
   * رمز QR يُرسم في المتصفّح من النصّ نفسه.
   *
   * لا صورة مرفوعة: لو رُفعت صورة لتغيّر الرمز كلّما تغيّر رقم الحساب، وصار
   * تحديثه يحتاج تصميماً. وهنا يكفي تبديل سطر `DONATION.code` أعلاه.
   */
  function drawQr(text) {
    const box = document.getElementById('emQr');
    if (!box || !text) return;

    // صورة الرمز من التطبيق نفسه إن وُجدت — أوثق من أي رمز نرسمه نحن
    if (DONATION.image) {
      const img = new Image();
      img.alt = 'رمز التبرّع';
      img.onload  = () => { box.innerHTML = ''; box.appendChild(img); };
      img.onerror = () => generate(text, box);
      box.innerHTML = '<div class="em-note"><i class="fas fa-spinner fa-spin"></i> جاري تحضير الرمز…</div>';
      img.src = DONATION.image;
      return;
    }
    generate(text, box);
  }

  function generate(text, box) {
    const make = () => {
      box.innerHTML = '';
      try {
        new global.QRCode(box, { text, width: 200, height: 200, correctLevel: global.QRCode.CorrectLevel.M });
      } catch (e) {
        box.innerHTML = '<div class="em-note">تعذّر رسم الرمز — انسخ الكود أدناه.</div>';
      }
    };
    if (global.QRCode) { make(); return; }

    box.innerHTML = '<div class="em-note"><i class="fas fa-spinner fa-spin"></i> جاري تحضير الرمز…</div>';
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = make;
    s.onerror = () => { box.innerHTML = '<div class="em-note">تعذّر تحميل مولّد الرمز — انسخ الكود أدناه.</div>'; };
    document.head.appendChild(s);
  }

  AUH.views.emergMeds = { render };
})(typeof window !== 'undefined' ? window : globalThis);

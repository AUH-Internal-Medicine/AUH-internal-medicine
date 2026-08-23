# خطة التحويل إلى موقع ديناميكي (سيرفر + قاعدة بيانات)

هذا المستند يشرح **أين بالضبط** يُوصل السيرفر بالكود الحالي، وما الذي لا يحتاج
تعديلاً أصلاً. البنية الحالية رُتّبت خصيصاً لهذا الغرض: طبقة البيانات معزولة
خلف واجهة واحدة، وكل المنطق (الإحصائيات، جداول الدوام، الثناءات، الفروز) لا يعرف
شيئاً عن Google Sheets.

---

## 1. الطبقات الحالية

```
index.html
└── js/
    ├── core/      إعدادات + دوال نصية/تاريخية نقية (لا DOM ولا بيانات)
    ├── data/      عقد البيانات: schema → header-map → transport → parsers → repository
    ├── domain/    قواعد العمل: جداول الدوام، العطل، التعديلات، إحصائيات الأطباء
    ├── views/     العرض فقط (تُدمج في HospitalApp.prototype)
    └── app.js     المنسّق: دورة التحميل + واجهة رقيقة تستدعيها الـ views
```

القاعدة: **كل طبقة تستعمل ما فوقها فقط.** لا يستدعي أي view واجهة Google مباشرة،
ولا يعرف أي parser شيئاً عن الـ DOM.

---

## 2. نقطة الوصل الوحيدة

كل الجلب يمرّ عبر ملفين:

| الملف | الدور |
|---|---|
| `js/data/gviz-client.js` | النقل من Google Sheets: fetch مع بديل JSONP (يعمل حتى مع فتح الملف مباشرة) |
| `js/data/api-client.js` | النقل من السيرفر (جاهز، خامل حتى تُضبط `apiBaseUrl`) |
| `js/data/repository.js` | التنسيق: يجلب كل المصادر → `parseAll()` → `dataset` + الكاش |

وفي `js/core/config.js`:

```js
dataSource: 'auto',       // 'auto' | 'gviz' | 'api'
apiBaseUrl: '',           // اضبطه ليتحول الموقع إلى السيرفر
sheetsTransport: 'auto',  // 'auto' | 'fetch' | 'jsonp'
```

`repository.clientFor()` هو المكان الوحيد الذي يتفرّع على `dataSource`، و
`repository.fetchAll()` هو المكان الوحيد الذي يعرف قائمة المصادر.

---

## 3. أبسط طريق للتحويل (مرحلتان)

### المرحلة أ — سيرفر يعيد نفس الشكل الحالي (جاهزة مسبقاً — سطر واحد)

`js/data/api-client.js` **مكتوب وموجود بالفعل**، ولا يفعل شيئاً حتى تضبط العنوان:

```js
// js/core/config.js
apiBaseUrl: 'https://api.example.com',   // ← هذا كل ما يلزم
dataSource: 'auto',                      // الافتراضي: API إن وُجد، وإلا Google Sheets
```

ما الذي يتوقعه من السيرفر:

```
GET {apiBaseUrl}/tables/{sourceKey}     مثال: /tables/residents
->  [["ت","الاسم الثلاثي", …], ["1","رزان …", …]]        (صف العناوين أولاً)
    أو  {"headers":[…], "rows":[[…], …]}
```

`sourceKey` هو مفتاح المصدر في الـ schema: `residents`, `oncall`, `oncallYear2`,
`oncallAdjustments`, `evaluation`, `links`, `qa`, `lectures`, `oncallRules`.

مع `dataSource: 'auto'` يبقى Google Sheets شبكة أمان: إذا تعطّل السيرفر أو لم
يستجب، يعود الموقع تلقائياً للشيتات بدل أن يفرغ من البيانات. لذلك يمكن تشغيل
السيرفر تدريجياً دون أي مخاطرة على المستخدمين.

### المرحلة ب — سيرفر يعيد سجلات JSON نظيفة (الشكل النهائي)

عندما تصبح البيانات في قاعدة بيانات فعلية، الأفضل أن يعيد السيرفر سجلات مباشرة
بدل جداول. عندها يُضاف تفرّع واحد في `repository.parseAll()`:

```js
const residents = raw.residents
  ? (AUH.config.dataSource === 'api'
      ? AUH.parse.residentsFromRecords(raw.residents)   // يبني نفس الـ model
      : AUH.parse.residents(raw.residents))
  : prev.residents;
```

المهم أن يبقى **شكل الـ model** كما هو (نفس الحقول ونفس الدوال)، لأن كل ما فوقه
مبني عليه. الحقول المطلوبة موجودة في `js/data/parsers/*.js` وموثّقة في
[DATA-CONTRACT.md](DATA-CONTRACT.md).

---

## 4. مقترح مخطط قاعدة البيانات

الأسماء مطابقة لحقول الـ schema الحالية حتى تبقى الترجمة مباشرة.

```sql
-- المقيمون
CREATE TABLE residents (
  id            SERIAL PRIMARY KEY,
  seq           INT,                 -- الترتيب المعروض
  name          TEXT NOT NULL,       -- الاسم الثلاثي
  abbr          TEXT NOT NULL UNIQUE,-- الاختصار (مفتاح الربط)
  phone         TEXT,
  gender        TEXT,
  specialty     TEXT,                -- الاختصاص
  university    TEXT,
  join_date     DATE,
  status        TEXT NOT NULL,       -- تم الالتحاق / تم الانفكاك / ...
  detach_date   DATE,
  detach_reason TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- الفروز الشهرية (بدل أعمدة "فرز شهر N")
CREATE TABLE rotations (
  resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  month       INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  rotation    TEXT NOT NULL,         -- اسم الفرز
  PRIMARY KEY (resident_id, year, month)
);

-- فئات المناوبات (بدل عناوين الأعمدة)
CREATE TABLE oncall_categories (
  id       SERIAL PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,     -- "عناية قلبية" ...
  grp      TEXT NOT NULL,            -- wards | icu | emergency | misc
  is_night BOOLEAN DEFAULT false,
  year_level INT NOT NULL DEFAULT 1  -- 1 أو 2
);

-- المناوبات (كل سطر = شخص + يوم + فئة)
CREATE TABLE oncall_shifts (
  id          SERIAL PRIMARY KEY,
  shift_date  DATE NOT NULL,
  category_id INT REFERENCES oncall_categories(id),
  resident_id INT REFERENCES residents(id),
  hours       NUMERIC(4,1),          -- NULL = استخدم المدة القياسية
  kind        TEXT DEFAULT 'regular',-- regular | volunteer
  note        TEXT,
  UNIQUE (shift_date, category_id, resident_id)
);

-- التقييم السنوي
CREATE TABLE evaluations (
  resident_id INT PRIMARY KEY REFERENCES residents(id) ON DELETE CASCADE,
  academic_year TEXT,
  scores      JSONB,                 -- {clinical: 70, knowledge: 80, ...}
  total       NUMERIC(5,2),
  praise_count   INT DEFAULT 0,      -- عدد الثناءات
  penalty_count  INT DEFAULT 0
);

-- تفاصيل الثناءات/العقوبات (اختياري لكنه الأنظف)
CREATE TABLE evaluation_notes (
  id          SERIAL PRIMARY KEY,
  resident_id INT REFERENCES residents(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,         -- praise | penalty
  note        TEXT,
  noted_on    DATE,
  created_by  TEXT
);

CREATE TABLE lectures (...);   -- نفس حقول شيت المحاضرات
CREATE TABLE links (...);
CREATE TABLE qa (...);
CREATE TABLE holidays (holiday_date DATE PRIMARY KEY, label TEXT);
```

> ملاحظة مهمة عن الثناءات: في الشيت اليوم العمود رقم مجرّد. جدول
> `evaluation_notes` يجعل الرقم **محسوباً** (`COUNT(*)`) بدل أن يُكتب يدوياً،
> فتختفي أخطاء العدّ نهائياً. الواجهة تستعمل `praiseCount` كما هي.

---

## 5. مقترح واجهة REST

```
GET  /api/residents                  → [{id, name, abbr, phone, specialty, status, joinDate, rotations:[{month, rotation}]}]
GET  /api/oncall?from=&to=&year=1    → [{date, category, residents:[abbr], hours?}]
GET  /api/evaluations                → [{residentId, scores, total, praiseCount, penaltyCount}]
GET  /api/lectures?from=             → [{date, title, speaker, place, time, duration, dept, year, links}]
GET  /api/links | /api/qa | /api/holidays
GET  /api/snapshot                   → كل ما سبق في طلب واحد (يوازي loadFresh الحالي)
```

`/api/snapshot` هو الأقرب لسلوك الموقع الحالي (طلب واحد لكل شيء + كاش محلي)،
ويقلّل زمن التحميل الأول.

للكتابة لاحقاً (لوحة إدارة):

```
POST/PATCH/DELETE /api/residents/:id, /api/oncall/:id, /api/evaluations/:id
POST /api/oncall/bulk        ← استيراد شهر كامل دفعة واحدة
```

مع مصادقة (JWT أو جلسة) وصلاحيات: **قراءة عامة**، وكتابة لرئاسة المقيمين فقط.

---

## 6. ما الذي لا يتغيّر إطلاقاً

- `js/domain/*` — الإحصائيات وجداول الدوام والعطل والتعديلات: دوال نقية تأخذ
  models وتُعيد نتائج. تعمل كما هي فوق أي مصدر بيانات (بل وتعمل في Node، وهو ما
  تستفيد منه `tools/verify-data.mjs`).
- `js/views/*` — تعرض من الـ models فقط.
- `js/core/*` — التوحيد العربي والبحث والتواريخ.
- شكل الكاش المحلي (`localStorage`) — يبقى مفيداً للعمل السريع/شبه دون اتصال.

---

## 7. خطوات مقترحة بالترتيب

1. **قاعدة بيانات + استيراد أولي** من الشيتات الحالية (سكربت يستخدم نفس الـ parsers
   في `tools/` — فهي تعمل في Node أصلاً).
2. **سيرفر قراءة فقط** يخدم `/api/snapshot` بنفس شكل الجداول (المرحلة أ) →
   تحويل `dataSource: 'api'` واختبار الموقع كما هو.
3. **مزامنة مؤقتة**: تبقى الشيتات مصدر التحرير، والسيرفر يستوردها دورياً، حتى
   تجهز لوحة الإدارة.
4. **لوحة إدارة للكتابة** (مصادقة + صلاحيات + سجل تعديلات) ثم إيقاف التحرير على
   الشيتات.
5. **حذف `gviz-client.js`** ومصادر الشيتات من `schema` عند الاستغناء عنها.

---

## 8. تنبيهات

- **الاختصار (`abbr`) هو مفتاح الربط** في كل مكان اليوم. في قاعدة البيانات اجعل
  الربط عبر `resident_id`، وأبقِ `abbr` فريداً للعرض والاستيراد.
- **التواريخ**: التطبيق يتعامل مع `YYYY-MM-DD` نصاً في كل مكان. اجعل الـ API
  يُخرج التواريخ بهذه الصيغة (لا ISO كامل بتوقيت) لتفادي انزياح يوم كامل.
- **الساعات**: `hours` في `oncall_shifts` تقابل «تعديلات المناوبات» الحالية
  (تجاوز المدة القياسية). اتركها `NULL` للمناوبة العادية.
- **الأمان**: الشيت العام اليوم يعني أن أرقام هواتف المقيمين متاحة لمن يملك
  الرابط. عند الانتقال إلى سيرفر، هذه فرصة لإخفاء الأرقام خلف تسجيل دخول.

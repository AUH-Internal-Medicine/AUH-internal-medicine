/**
 * Generates docs/DATA-CONTRACT.md from js/data/schema.js.
 *
 * The contract between the Google Sheets and the app is declared in exactly one
 * place (the schema). This script renders it as Arabic documentation for the
 * people who maintain the sheets, so the document can never drift from the code.
 *
 *     node tools/generate-data-contract.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['core/namespace.js', 'core/storage.js', 'core/config.js', 'data/schema.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', file), 'utf8'), sandbox, { filename: file });
}

const { schema } = sandbox.AUH.data;
const { spreadsheets } = sandbox.AUH.config;

const TYPE_LABEL = {
  text: 'نص',
  number: 'رقم',
  date: 'تاريخ',
  url: 'رابط',
  multiline: 'نص متعدد الأسطر'
};

const lines = [];
const put = (...l) => lines.push(...l);

put('# عقد البيانات — أعمدة جداول Google Sheets', '');
put('> ⚠️ **هذا الملف مولَّد آلياً من `js/data/schema.js`.**');
put('> لا تعدّله يدوياً؛ عدّل الـ schema ثم شغّل:', '');
put('```bash', 'node tools/generate-data-contract.mjs', '```', '');
put('---', '');
put('## كيف يقرأ الموقع الأعمدة؟', '');
put('لا يعتمد الموقع على **ترتيب** الأعمدة، بل على **اسم العمود** في صف العناوين.');
put('يمكن تحريك عمود أو إضافة عمود جديد بينها دون أي تعديل على الكود، بشرط بقاء الاسم كما هو.', '');
put('ترتيب المطابقة:', '');
put('1. **تطابق تام** بعد التوحيد (تجاهل الهمزات، التاء المربوطة، «ال» التعريف، والمسافات الزائدة).');
put('2. **تطابق بادئة** — مفيد لعناوين تحمل نسبة مئوية مثل `المهارات السريرية 25%`.');
put('3. **تطابق جزئي** — يُقبل فقط إذا كان هناك عمود واحد مطابق (لا تخمين عند التعدد).');
put('4. **الموضع الافتراضي** — فقط للأعمدة التي لا عنوان لها أصلاً في الشيت (مثل عمود «ت»).', '');
put('إذا تعذّر إيجاد عمود **إلزامي**، يظهر خطأ واضح في الـ console وفي أداة الفحص');
put('(`node tools/verify-data.mjs`) بدل أن تظهر أرقام خاطئة بصمت.', '');
put('**قواعد مهمة لمن يحرّر الشيت:**', '');
put('- لا تُعِد تسمية عمود إلزامي (الاسم/الاختصار/الحالة/التاريخ...) دون تحديث الـ schema.');
put('- الاختصار (`الاختصار`) هو مفتاح الربط بين اللوائح وجداول المناوبات — يجب أن يبقى فريداً.');
put('- الأعمدة الشهرية تُكتشف تلقائياً بنمط `فرز شهر N` و `مناوبات شهر N`.');
put('- صفوف بلا اسم (كصف المجاميع في نهاية شيت التقييم) تُتجاهَل تلقائياً.', '');
put('---', '');

put('## الجداول المصدرية', '');
put('| المفتاح | الجدول | الشيت | GID | الصيغة |');
put('|---|---|---|---|---|');
for (const source of Object.values(schema)) {
  put(`| \`${source.key}\` | ${source.label} | \`${spreadsheets[source.spreadsheet]}\` | \`${source.gid}\` | ${source.format.toUpperCase()} |`);
}
put('');
put('---', '');

for (const source of Object.values(schema)) {
  put(`## ${source.label}  \`${source.key}\``, '');
  put(`- **الشيت:** \`${spreadsheets[source.spreadsheet]}\``);
  put(`- **GID:** \`${source.gid}\` — **الصيغة:** ${source.format.toUpperCase()}`);
  put(`- **صف العناوين:** ${source.headerRow === 'auto' ? 'يُكتشف تلقائياً (صف واحد أو صفّان مدمجان)' : `الصف ${source.headerRow}`}`);
  put('');

  if (source.columns) {
    put('| الحقل في الكود | أسماء العمود المقبولة | إلزامي | النوع | ملاحظات |');
    put('|---|---|---|---|---|');
    for (const [field, def] of Object.entries(source.columns)) {
      const labels = (def.labels || []).map(l => `\`${l}\``).join(' · ');
      const required = def.required ? '✅' : '—';
      const type = TYPE_LABEL[def.type] || def.type || '';
      const notes = [];
      if (def.note) notes.push(def.note);
      if (def.match) notes.push(`المطابقة: ${def.match.join('/')}`);
      if (Number.isInteger(def.fallbackIndex)) notes.push(`موضع افتراضي: ${def.fallbackIndex}`);
      put(`| \`${field}\` | ${labels} | ${required} | ${type} | ${notes.join(' — ') || ''} |`);
    }
    put('');
  }

  if (source.skills) {
    put('**أعمدة المهارات (بالترتيب المعروض):**', '');
    put('| المفتاح | اسم العمود المتوقع |');
    put('|---|---|');
    source.skills.forEach(s => put(`| \`${s.key}\` | ${(s.labels || [s.label]).map(l => `\`${l}\``).join(' · ')} |`));
    put('');
  }

  if (source.patterns) {
    put('**أعمدة متكررة (تُكتشف تلقائياً):**', '');
    put('| المجموعة | النمط | المعنى |');
    put('|---|---|---|');
    for (const [name, def] of Object.entries(source.patterns)) {
      put(`| \`${name}\` | \`${String(def.regex)}\` | ${def.label || ''} |`);
    }
    put('');
  }

  if (source.categoryColumns) {
    put('**أعمدة الفئات:** كل عمود بعد أعمدة التاريخ/اليوم وله عنوان غير فارغ يُعتبر فئة مناوبة،');
    put('وتُقرأ خلاياه كأسماء مقيمين (مفصولة بأسطر أو بفواصل). إضافة فئة جديدة لا تحتاج تعديل كود.', '');
  }

  if (source.annualHolidaysSection) {
    put(`**العطل السنوية:** تُقرأ من الصفوف الواقعة تحت الخلية \`${source.annualHolidaysSection.label}\`، من العمود رقم ${source.annualHolidaysSection.dateColumn}.`, '');
  }

  if (source.exampleNameValues) {
    put(`**صف المثال:** ${source.exampleNameValues.map(v => `\`${v}\``).join(' / ')} — يُعرض في الجدول بلون باهت ويُستثنى من البطاقات والحسابات.`, '');
  }

  if (source.note) put(`> ${source.note}`, '');
  put('---', '');
}

put('## أوقات ومدد المناوبات', '');
put('ليست في الشيت: هي ثابتة في `js/domain/oncall-schedule.js` (جدولان: قبل وبعد');
put('`2026-07-23` تاريخ التحول من الشفتات الجزئية إلى الكاملة). لتعديل توقيت أو مدة،');
put('عدّل ذلك الملف مباشرة.', '');
put('## التحقق', '');
put('```bash', 'node tools/verify-data.mjs         # فحص شامل مقابل الشيتات الحقيقية', 'node tools/verify-data.mjs --debug # مع طباعة خريطة الأعمدة المكتشفة', '```', '');

fs.writeFileSync(path.join(ROOT, 'docs', 'DATA-CONTRACT.md'), lines.join('\n') + '\n', 'utf8');
console.log('docs/DATA-CONTRACT.md updated');

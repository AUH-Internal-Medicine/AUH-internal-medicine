/**
 * Data contract checker — runs the app's real parsing/statistics code outside
 * the browser against the live Google Sheets and reports anything that looks
 * wrong: a renamed column, an unreadable date, a resident who cannot be matched
 * between two sheets, a praise count that does not add up.
 *
 * Run it whenever the sheets are edited, before assuming the site is at fault:
 *
 *     node tools/verify-data.mjs            # live sheets
 *     node tools/verify-data.mjs --debug    # also print resolved column maps
 *
 * Exit code 0 = everything the app depends on resolved correctly.
 * Exit code 1 = at least one check failed (details printed above).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEBUG = process.argv.includes('--debug');

/* Load the browser modules that have no DOM dependency into one sandbox. */
const MODULES = [
  'core/namespace.js',
  'core/storage.js',
  'core/config.js',
  'core/logger.js',
  'core/text.js',
  'core/status.js',
  'core/dates.js',
  'data/schema.js',
  'data/header-map.js',
  'data/gviz-client.js',
  'data/api-client.js',
  'data/parsers/residents.js',
  'data/parsers/oncall.js',
  'data/parsers/evaluation.js',
  'data/parsers/lectures.js',
  'data/parsers/holidays.js',
  'data/parsers/content.js',
  'data/repository.js',
  'domain/oncall-schedule.js',
  'domain/oncall-adjustments.js',
  'domain/doctor-stats.js'
];

const sandbox = { console, fetch, TextDecoder, URL, Date, Math, JSON, setTimeout, clearTimeout };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const file of MODULES) {
  const code = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

const AUH = sandbox.AUH;
if (DEBUG) AUH.config.debug = true;

/* ------------------------------------------------------------------ checks */

let failures = 0;
let warnings = 0;

function ok(message) {
  console.log(`  [32m✓[0m ${message}`);
}
function fail(message) {
  failures++;
  console.log(`  [31m✗[0m ${message}`);
}
function warn(message) {
  warnings++;
  console.log(`  [33m![0m ${message}`);
}
function section(title) {
  console.log(`\n[1m${title}[0m`);
}
function check(condition, passMessage, failMessage) {
  if (condition) ok(passMessage);
  else fail(failMessage || passMessage);
  return condition;
}

/* -------------------------------------------------------------------- run */

console.log('AUH data contract check —', new Date().toISOString().slice(0, 19).replace('T', ' '));

section('1. تحميل المصادر');
const fetchResult = await AUH.data.repository.fetchAll();
const raw = fetchResult.tables;
console.log(`  (المصدر: ${fetchResult.source})`);
for (const { datasetKey, schemaKey } of AUH.data.repository.SOURCES) {
  check(!!raw[datasetKey], `${schemaKey}: تم التحميل (${raw[datasetKey] ? raw[datasetKey].length : 0} صف)`, `${schemaKey}: فشل التحميل`);
}

const dataset = AUH.data.repository.parseAll(raw);

section('2. مطابقة الأعمدة مع الشيت');
// A source that failed to download parses as an empty model, which would look
// like "every required column is missing". Only judge the contract for sources
// that actually arrived.
const failedSources = AUH.data.repository.SOURCES.filter(s => !raw[s.datasetKey]).map(s => s.schemaKey);
if (failedSources.length) warn(`تعذر تحميل: ${failedSources.join(', ')} — تم تخطي فحص أعمدتها (غالباً مشكلة شبكة مؤقتة)`);
const allIssues = (dataset.issues || []).filter(i => !failedSources.includes(i.source));
const errors = allIssues.filter(i => i.level === 'error');
const warns = allIssues.filter(i => i.level === 'warn');
check(errors.length === 0, 'كل الأعمدة الإلزامية موجودة', `أعمدة إلزامية مفقودة: ${errors.map(e => `${e.source}.${e.field}`).join(', ')}`);
warns.forEach(w => warn(`${w.source}.${w.field}: ${w.message}`));

if (DEBUG) {
  console.log('\n  الأعمدة المكتشفة (المقيمون):');
  console.table(
    Object.entries(dataset.residents.columnDetail).map(([field, info]) => ({ field, index: info.index, header: info.header, via: info.via }))
  );
  console.log('  أعمدة غير معروفة:', dataset.residents.unknownHeaders.map(u => u.header).join(' | ') || '—');
}

if (failedSources.length === AUH.data.repository.SOURCES.length) {
  fail('تعذر تحميل أي مصدر — تحقق من الاتصال بالإنترنت ثم أعد المحاولة.');
  console.log(`\n[1mالنتيجة[0m\n  أخطاء: ${failures} — تنبيهات: ${warnings}`);
  process.exit(1);
}

section('3. لائحة المقيمين');
const residents = dataset.residents;
check(residents.residents.length > 0, `عدد المقيمين: ${residents.residents.length}`);
const missingAbbr = residents.residents.filter(r => !r.abbr);
check(missingAbbr.length === 0, 'كل مقيم له اختصار', `مقيمون بلا اختصار: ${missingAbbr.map(r => r.name).join(', ')}`);
const dupAbbr = Object.entries(
  residents.residents.reduce((acc, r) => {
    const key = AUH.text.normAr(r.abbr);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})
).filter(([, n]) => n > 1);
check(dupAbbr.length === 0, 'لا توجد اختصارات مكررة', `اختصارات مكررة: ${dupAbbr.map(([k]) => k).join(', ')}`);
check(residents.getShiftMonths().length > 0, `أعمدة الفرز الشهري: ${residents.getShiftMonths().map(m => m.month).join(', ')}`);
const badJoin = residents.residents.filter(r => r.join && !AUH.dates.extractDate(r.join));
check(badJoin.length === 0, 'كل تواريخ الالتحاق مقروءة', `تواريخ التحاق غير مقروءة: ${badJoin.map(r => `${r.name}="${r.join}"`).slice(0, 5).join(', ')}`);

section('4. المناوبات (السنة الأولى)');
const oncall = dataset.oncall;
check(oncall.rows.length > 0, `عدد الأيام: ${oncall.rows.length}`);
check(oncall.categories.length > 0, `عدد الفئات: ${oncall.categories.length} (${oncall.categories.join(' · ')})`);
const unknownSchedule = oncall.categories.filter(c => !AUH.domain.oncallSchedule.getCategorySchedule(c, '2026-08-01', new Set()));
check(unknownSchedule.length === 0, 'كل الفئات لها توقيت/مدة معرفة', `فئات بلا جدول دوام: ${unknownSchedule.join(', ')}`);
const unknownGroup = oncall.categories.filter(c => AUH.domain.oncallSchedule.classifyGroup(c) === 'other');
if (unknownGroup.length) warn(`فئات غير مصنفة ضمن مجموعة (ستظهر تحت "أخرى"): ${unknownGroup.join(', ')}`);

/* Every name in the on-call sheet must resolve to a resident, otherwise their
   hours are counted under a name nobody can find in the roster. */
const unresolved = new Map();
oncall.rows.forEach(row => {
  for (let col = 2; col < oncall.headers.length; col++) {
    AUH.text.splitNames(row.row[col] || '').forEach(name => {
      if (!residents.findByNameOrAbbr(name)) unresolved.set(name, (unresolved.get(name) || 0) + 1);
    });
  }
});
check(
  unresolved.size === 0,
  'كل الأسماء في جدول المناوبات مرتبطة بمقيم',
  `أسماء غير معروفة في جدول المناوبات: ${[...unresolved.entries()].map(([n, c]) => `${n} (${c})`).join(', ')}`
);

section('5. مناوبات السنة الثانية');
const y2 = dataset.oncallYear2;
check(y2.rows.length > 0, `عدد الأيام: ${y2.rows.length} — نمط العناوين: ${y2.headerLayout}`);
check((y2.skippedDates || []).length === 0, 'كل التواريخ مقروءة', `تواريخ غير مقروءة: ${(y2.skippedDates || []).join(', ')}`);
const y2Dates = y2.rows.map(r => r.date).sort();
if (y2Dates.length) {
  const first = y2Dates[0];
  const last = y2Dates[y2Dates.length - 1];
  const spanDays = (new Date(last) - new Date(first)) / 86400000;
  if (spanDays > 200) warn(`مدى تواريخ السنة الثانية غير منطقي (${first} .. ${last}) — تحقق من خطأ سنة في الشيت`);
  else ok(`مدى التواريخ: ${first} .. ${last}`);
}
/* The Year-1 ↔ Year-2 mapping is only useful if the names still exist. */
const y2Missing = Object.entries(AUH.domain.oncallSchedule.YEAR2_CATEGORY_MAP)
  .filter(([y1]) => oncall.categories.some(c => AUH.text.normAr(c) === AUH.text.normAr(y1)))
  .filter(([, y2cats]) => !y2cats.some(c => y2.categories.some(actual => AUH.text.normAr(actual) === AUH.text.normAr(c))))
  .map(([y1]) => y1);
if (y2Missing.length) warn(`فئات السنة الأولى بلا مقابل في شيت السنة الثانية: ${y2Missing.join(', ')}`);
else ok('كل فئات السنة الأولى المعرَّفة لها مقابل في السنة الثانية');

section('6. التقييم السنوي والثناءات');
const evaluation = dataset.evaluation;
check(evaluation.list.length > 0, `عدد صفوف التقييم: ${evaluation.list.length}`);
check(evaluation.list.every(r => r.name), 'كل صف تقييم له اسم');
const praiseTotal = evaluation.list.reduce((a, r) => a + r.praiseCount, 0);
ok(`مجموع الثناءات في الشيت: ${praiseTotal}`);
const unmatchedEval = residents.residents.filter(r => !evaluation.findFor(r.name, r.abbr));
if (unmatchedEval.length) warn(`مقيمون بلا صف تقييم: ${unmatchedEval.map(r => r.name).join(' | ')}`);
else ok('كل مقيم له صف تقييم');

/* The statistics tab must show exactly the sheet's praise number. */
const stats = AUH.domain.doctorStats.computeDoctorStats({
  residents,
  oncall,
  evaluation,
  ...AUH.domain.adjustments.resolveAdjustments(dataset.adjustments.entries, { residents, oncall }),
  annualHolidays: dataset.rules.annualHolidays,
  today: AUH.dates.todayIso(),
  currentMonth: new Date().getMonth() + 1
});
const praiseMismatch = residents.residents
  .map(r => {
    const record = evaluation.findFor(r.name, r.abbr);
    const stat = AUH.domain.doctorStats.findStatsFor(stats, r.name, r.abbr);
    return { name: r.name, sheet: record ? record.praiseCount : 0, stat: stat ? stat.praiseCount : 0 };
  })
  .filter(x => x.sheet !== x.stat);
check(
  praiseMismatch.length === 0,
  'عدد الثناءات في الإحصائيات مطابق لشيت التقييم',
  `اختلاف في عدد الثناءات: ${praiseMismatch.map(x => `${x.name}: شيت=${x.sheet} إحصائيات=${x.stat}`).join(' | ')}`
);
const statsPraiseTotal = stats.reduce((a, s) => a + s.praiseCount, 0);
check(statsPraiseTotal === praiseTotal, `مجموع الثناءات في الإحصائيات = ${statsPraiseTotal}`, `مجموع الثناءات مختلف: شيت=${praiseTotal} إحصائيات=${statsPraiseTotal}`);

section('7. الإحصائيات المحسوبة');
let assignments = 0;
oncall.rows.forEach(row => {
  for (let col = 2; col < oncall.headers.length; col++) {
    if (!oncall.headers[col]) continue;
    const names = new Set(
      AUH.text.splitNames(row.row[col] || '').map(n => {
        const r = residents.findByNameOrAbbr(n);
        return r ? r.abbr || r.name : n;
      })
    );
    assignments += names.size;
  }
});
const totalCounted = stats.reduce((a, s) => a + s.total, 0);
const additions = AUH.domain.adjustments.resolveAdjustments(dataset.adjustments.entries, { residents, oncall }).additions.length;
check(
  totalCounted === assignments + additions,
  `مجموع المناوبات المحسوبة (${totalCounted}) = خلايا الجدول (${assignments}) + الإضافات (${additions})`,
  `عدم تطابق: محسوب=${totalCounted}, جدول=${assignments}, إضافات=${additions}`
);
const negative = stats.filter(s => s.hoursTotal < 0 || s.total < 0);
check(negative.length === 0, 'لا توجد قيم سالبة');
const noHours = stats.filter(s => s.total > 0 && s.hoursTotal === 0);
check(noHours.length === 0, 'كل من له مناوبات له ساعات محسوبة', `مقيمون بمناوبات وبلا ساعات: ${noHours.map(s => s.name).join(', ')}`);

section('8. العطل الرسمية');
const holidays = dataset.holidays;
check(holidays.list.length > 0, `عدد العطل: ${holidays.list.length}`, 'لا توجد عطل مقروءة — تحقق من الشيت');
holidays.list.forEach(h => ok(`${h.date} · ${h.day} — ${h.name}`));
const badHoliday = holidays.list.filter(h => !/^\d{4}-\d{2}-\d{2}$/.test(h.date));
check(badHoliday.length === 0, 'كل تواريخ العطل بصيغة صحيحة', `تواريخ غير صالحة: ${badHoliday.map(h => h.name).join(', ')}`);
/* A holiday must actually change the duty schedule for that day. */
const sampleHoliday = holidays.list[0];
if (sampleHoliday) {
  const merged = new Set([...(dataset.rules.annualHolidays || []), ...holidays.dates]);
  const sched = AUH.domain.oncallSchedule.getCategorySchedule('تالت', sampleHoliday.date, merged);
  const normal = AUH.domain.oncallSchedule.getCategorySchedule('تالت', sampleHoliday.date, new Set());
  check(
    !!sched && sched.isHoliday && sched.duration !== (normal && normal.duration),
    `يوم ${sampleHoliday.date} يُحسب بتوقيت العطلة (${sched && sched.duration})`,
    'العطلة لا تغيّر مدة المناوبة — تحقق من الربط'
  );
}

section('9. المحاضرات والروابط والأسئلة');
check(dataset.lectures.list.length > 0, `عدد المحاضرات/الأنشطة: ${dataset.lectures.list.length}`);
check((dataset.lectures.skippedDates || []).length === 0, 'كل تواريخ المحاضرات مقروءة', `تواريخ غير مقروءة: ${(dataset.lectures.skippedDates || []).join(', ')}`);
check(dataset.links.list.length > 0, `عدد الروابط: ${dataset.links.list.length}`);
check(dataset.qa.list.length > 0, `عدد الأسئلة: ${dataset.qa.list.length} في ${dataset.qa.categories.length} تصنيف`);
ok(`عدد العطل من تبويب القواعد القديم: ${dataset.rules.annualHolidays.size}`);

section('النتيجة');
console.log(`  أخطاء: ${failures} — تنبيهات: ${warnings}`);
process.exit(failures ? 1 : 0);

function toggleDarkMode(){
  document.body.classList.toggle('dark-mode');
  const i=document.getElementById('darkModeIcon');
  if(document.body.classList.contains('dark-mode')){
    i.className='fas fa-sun';
    localStorage.setItem('darkMode','true');
  }else{
    i.className='fas fa-moon';
    localStorage.setItem('darkMode','false');
  }
}
if(localStorage.getItem('darkMode')==='true'){
  document.body.classList.add('dark-mode');
  const darkIcon=document.getElementById('darkModeIcon');
  if(darkIcon)darkIcon.className='fas fa-sun';
}

let ttp='';
function showTooltip(e,nm,ph){
  e.stopPropagation();
  const tt=document.getElementById('nameTooltip');
  document.getElementById('ttName').textContent=nm;
  document.getElementById('ttPhone').textContent='هاتف: '+ph;
  ttp=ph;
  tt.classList.add('show');
  const x=e.clientX||(e.touches&&e.touches[0].clientX)||0;
  const y=e.clientY||(e.touches&&e.touches[0].clientY)||0;
  tt.style.left=Math.min(x-100,window.innerWidth-220)+'px';
  tt.style.top=(y-110)+'px';
}
function hideTooltip(){document.getElementById('nameTooltip').classList.remove('show');}
function copyTooltipPhone(){
  if(ttp){
    navigator.clipboard.writeText(ttp);
    const b=document.getElementById('ttCopyBtn');
    b.innerHTML='<i class="fas fa-check"></i> تم النسخ';
    showToast('تم نسخ الرقم!');
    setTimeout(()=>b.innerHTML='<i class="fas fa-copy"></i> نسخ الرقم',1500);
  }
}

document.addEventListener('click',e=>{
  if(!e.target.closest('.name-clickable')&&!e.target.closest('.name-tooltip'))hideTooltip();
});

document.addEventListener('click',e=>{
  const db=e.target.closest('.names-dropdown-btn');
  if(db){
    e.stopPropagation();
    db.classList.toggle('open');
    const c=db.nextElementSibling;
    if(c)c.classList.toggle('show');
  }else if(!e.target.closest('.names-dropdown')){
    document.querySelectorAll('.names-dropdown-btn.open').forEach(b=>{
      b.classList.remove('open');
      const c=b.nextElementSibling;
      if(c)c.classList.remove('show');
    });
  }
});

function copyPhone(p,b){
  navigator.clipboard.writeText(p).then(()=>{
    const i=b.querySelector('i');
    const o=i.className;
    i.className='fas fa-check';
    b.classList.add('copied');
    showToast('تم نسخ الرقم!');
    setTimeout(()=>{i.className=o;b.classList.remove('copied');},1500);
  }).catch(()=>{});
}
function toggleCollapsible(btn){
  btn.classList.toggle('open');
  const c=btn.nextElementSibling;
  if(c)c.classList.toggle('show');
}
function toggleQACard(card){card.classList.toggle('open');}
function toggleQACategory(h){
  h.classList.toggle('open');
  const c=h.nextElementSibling;
  if(c)c.classList.toggle('show');
}

function showToast(m){
  const t=document.createElement('div');
  t.className='toast';
  t.textContent=m;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2000);
}
function showDownloadProgress(t){
  const o=document.getElementById('downloadProgressOverlay');
  document.getElementById('dpTitle').textContent=t||'جاري توليد الصورة...';
  document.getElementById('dpBar').style.width='0%';
  document.getElementById('dpPercent').textContent='0%';
  document.getElementById('dpSub').textContent='';
  o.classList.remove('hidden');
}
function updateDownloadProgress(p,s){
  document.getElementById('dpBar').style.width=p+'%';
  document.getElementById('dpPercent').textContent=Math.round(p)+'%';
  if(s)document.getElementById('dpSub').textContent=s;
}
function hideDownloadProgress(){document.getElementById('downloadProgressOverlay').classList.add('hidden');}
function debounce(fn,wait=120){
  let t;
  return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),wait);};
}

function normAr(t){
  if(!t)return'';
  let r=String(t).toLowerCase().trim();
  r=r.replace(/[أإآا]/g,'ا').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ى/g,'ا').replace(/ة/g,'ه');
  r=r.replace(/\bال/g,'').replace(/^ال/,'');
  r=r.replace(/[\u064B-\u0652]/g,'').replace(/\s+/g,' ').trim();
  return r;
}
function prepSearch(t){return normAr(t);}
function exactNameMatch(a,b){
  if(!a||!b)return false;
  const n1=String(a).trim();
  const n2=String(b).trim();
  if(n1===n2)return true;
  const nn1=normAr(n1);
  const nn2=normAr(n2);
  if(nn1===nn2)return true;
  return nn1.replace(/[.\s]/g,'')===nn2.replace(/[.\s]/g,'');
}
function splitNames(t){
  if(!t)return[];
  const lines=String(t).split(/[\n\r]+/);
  const r=[];
  for(let l of lines){
    l=l.trim();
    if(!l)continue;
    const sp=l.split(/[-–—,،;؛\/\\|]+/);
    for(let s of sp){
      s=s.trim();
      if(s)r.push(s);
    }
  }
  return r;
}
function smartSearch(t,s){
  if(!s)return true;
  const nt=prepSearch(t);
  const ns=prepSearch(s);
  const sw=ns.split(/\s+/).filter(w=>w.length>0);
  if(!sw.length)return true;
  return sw.every(w=>nt.includes(w));
}
function extractDate(t){
  if(!t)return null;
  let c=String(t).replace(/السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday/gi,'');
  c=c.replace(/[\u0660-\u0669]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x0660+0x30));
  c=c.replace(/[٠-٩]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x0660+0x30));
  let m=c.match(/(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
  if(m)return`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=c.match(/(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{4})/);
  if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=c.match(/(\d{1,2})\s*[\/\-.\\]\s*(\d{1,2})\s*[\/\-.\\]\s*(\d{2})\b/);
  if(m){
    const y=parseInt(m[3],10)<50?'20'+m[3]:'19'+m[3];
    return`${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}
function getDayName(d){
  const dt=new Date(d+'T00:00:00');
  return isNaN(dt.getTime())?'':DAY_NAMES[dt.getDay()];
}
function getDayIndex(d){
  const dt=new Date(d+'T00:00:00');
  return isNaN(dt.getTime())?-1:dt.getDay();
}
function isWeekend(d){
  const i=getDayIndex(d);
  return i===5||i===6;
}
function isJoined(s){
  const st=(s||'').toLowerCase();
  return st.includes('التحق')||st.includes('ملتحق')||st.includes('التحاق');
}
function isDetachedStatus(s){
  const st=normAr(s||'');
  return st.includes('تم الانفكاك');
}
function getStatusBadgeClass(s){
  const st=normAr(s||'');
  if(isDetachedStatus(s))return 'status-detached';
  if(st.includes('لم ينضم للغروب'))return 'status-not-joined';
  if(st.includes('لم يلتحق بعد'))return 'status-not-yet';
  return isJoined(s)?'status-joined':'status-pending';
}
function mcn(nm,ph,ab){
  let d=nm;
  if(ab)d+=' ('+ab+')';
  if(!ph)return d;
  return`<span class="name-clickable" onclick="event.stopPropagation();showTooltip(event,'${nm.replace(/'/g,"\\'")}','${ph}')">${d}</span>`;
}
function toAsciiDigits(v){
  return String(v||'')
    .replace(/[\u0660-\u0669]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x0660+0x30))
    .replace(/[٠-٩]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x0660+0x30));
}
function safeNum(v){
  const n=parseFloat(toAsciiDigits(v).replace(/,/g,'.'));
  return Number.isFinite(n)?n:0;
}
function daysSinceDate(dateIso){
  if(!dateIso)return null;
  const d=new Date(dateIso+'T00:00:00');
  if(isNaN(d.getTime()))return null;
  const now=new Date();
  const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const diff=today.getTime()-d.getTime();
  return diff>=0?Math.floor(diff/86400000):0;
}
function parseDurationHours(s){
  if(!s)return 0;
  const t=toAsciiDigits(s);
  const m=t.match(/(\d+(?:\.\d+)?)/);
  let n=m?parseFloat(m[1]):0;
  if(/نصف/.test(s))n+=0.5;
  return n;
}

const SID='1Pb5VK1HsccaJpKXm-jersktd8yk4jf1V7o8qsDDmCI4';
const GID_R='0';
const GID_O='238974679';
const GID_E='253629565';
const GID_L='1649404909';
const GID_Q='680270268';
const GID_LEC='393274093';
const GID_OR='1364488029';
// Manual on-call adjustments sheet: overtime-hour corrections for specific people on
// specific existing shifts, and/or brand-new volunteer shifts not in the main on-call
// table. Columns: A=name, B=abbr, C=date (day-month-year), D=category, E=hours.
const GID_ADJ='1181737768';

// Second-year residents on-call schedule — a different spreadsheet with a different
// header structure (merged group + sub-role header rows instead of one header row).
const SID2='1dOvCHFQBYz0wFklUFicjf8iU3IscJNzUrUcSYeKMlh8';
const GID_O2='0';

// Builds one clean category label per data column from the Year-2 sheet's two merged
// header rows (row1 = group name e.g. "الاسعاف", row2 = sub-role e.g. "باب"/"بارد",
// only present inside the "الاسعاف" group). Forward-fills blank (merged) cells from the
// nearest earlier non-blank cell, so it adapts automatically to however many columns each
// group/sub-role actually spans — no hardcoded column counts.
function buildYear2CategoryLabels(row1, row2){
  const labels=[];
  let lastGroup='';
  let lastShift='';
  const maxLen=Math.max(row1.length,row2.length);
  for(let col=1;col<maxLen;col++){
    const g1=(row1[col]||'').trim();
    const g2=(row2[col]||'').trim();
    if(g1)lastGroup=g1;

    let finalLabel;
    if(normAr(lastGroup)===normAr('الاسعاف')){
      if(g2){
        if(g2.includes('نهاري')){lastShift='نهاري';finalLabel=g2;}
        else if(g2.includes('ليلي')){lastShift='ليلي';finalLabel=g2;}
        else if(g2==='باب'||g2==='بارد')finalLabel=`اسعاف ${g2} ${lastShift}`;
        else finalLabel=lastGroup;
      }else{
        finalLabel=null;
      }
    }else{
      finalLabel=lastGroup;
    }
    labels.push(finalLabel);
  }
  for(let i=0;i<labels.length;i++){
    if(labels[i]===null)labels[i]=i>0?labels[i-1]:'';
  }
  return labels;
}

// Best-effort correspondence between Year-1 on-call category names and their closest
// Year-2 equivalent(s), used only to suggest "زملاء السنة الثانية" in My Info. The two
// sheets track duty differently (Year-2 splits emergency duty into hall/cold-room/door,
// Year-1 doesn't), so this is an approximation — categories with no clear match are
// simply omitted rather than guessed.
const YEAR2_CATEGORY_MAP={
  'سابع':['جناح السابع'],
  'رابع':['جناح الرابع'],
  'تالت':['ثالث خاص + خارجيات'],
  'خارجيات':['ثالث خاص + خارجيات'],
  'تاني':['ثاني رجال'],
  'ديال':['ديال'],
  'عناية قلبية':['عناية قلبية'],
  'عناية مركز':['عناية المركز'],
  'عناية داخلية':['عناية داخلية'],
  'اسعاف مركز صباحي':['اسعاف مركز'],
  'اسعاف مركز ليلي':['اسعاف مركز'],
  'اسعاف بارد صباحي':['اسعاف بارد نهاري'],
  'اسعاف بارد ليلي':['اسعاف بارد ليلي']
};

const AM=['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
const DAY_NAMES=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

const APP_BUILD_ID=(window.__APP_BUILD_ID__||'dev').trim();
const CK='hc_v63_'+APP_BUILD_ID;
const CD=10*60*1000;

// Fixed on-call duty times/durations (manually set — these rarely change, so
// they are no longer read from the Google Sheet's "on-call rules" tab).
// There are TWO fixed schedules because the duty system genuinely changed on
// a specific date (شفتات جزئية before, شفتات كاملة on/after): dates before
// ONCALL_SCHEDULE_SWITCH_DATE use ONCALL_SCHEDULE_OLD, dates on/after it use
// ONCALL_SCHEDULE_NEW. To adjust any time, edit the values below directly.
const ONCALL_SCHEDULE_SWITCH_DATE='2026-07-23';

const ONCALL_SCHEDULE_OLD={
  'عناية قلبية':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'عناية مركز':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'عناية داخلية':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'سابع':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'رابع':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'تالت':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'تاني':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'خارجيات':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'ديال':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'أورام':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'إسعاف مركز صباحي':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'إسعاف مركز ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'},
  'اسعاف بارد صباحي':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'اسعاف بارد ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'},
  'إسعاف باب نهاري':{workTime:'2:30 حتى 10:00',workDuration:'7 ساعات ونصف',holidayTime:'9 صباحاً حتى 10 ليلاً',holidayDuration:'13 ساعة'},
  'اسعاف باب ليلي':{workTime:'10:00 ليلاً حتى 8:30 صباحاً',workDuration:'10 ساعات ونصف',holidayTime:'10:00 ليلاً حتى 9:00 صباحاً',holidayDuration:'11 ساعة'}
};

const ONCALL_SCHEDULE_NEW={
  'عناية قلبية':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'عناية مركز':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'عناية داخلية':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'سابع':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'رابع':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'تالت':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'تاني':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'خارجيات':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'ديال':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'أورام':{workTime:'2:30 pm حتى 8:30 am',workDuration:'18 ساعة',holidayTime:'9:00 am حتى 9:00 am',holidayDuration:'24 ساعة'},
  'إسعاف مركز صباحي':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
  'إسعاف مركز ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'},
  'اسعاف بارد صباحي':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
  'اسعاف بارد ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'},
  'إسعاف باب نهاري':{workTime:'2:30 pm حتى 10:00 pm',workDuration:'7 ساعات ونصف',holidayTime:'9:00 am حتى 10:00 pm',holidayDuration:'13 ساعة'},
  'اسعاف باب ليلي':{workTime:'10:00 pm حتى 8:30 am',workDuration:'10 ساعات ونصف',holidayTime:'10:00 pm حتى 9:00 am',holidayDuration:'11 ساعة'}
};

const TABS=[
  {id:'residents',icon:'<i class="fas fa-user-doctor"></i>',label:'لائحة المقيمين'},
  {id:'lectures',icon:'<i class="fas fa-calendar-check"></i>',label:'رزنامة المحاضرات'},
  {id:'shifts',icon:'<i class="fas fa-clipboard-list"></i>',label:'الفروز'},
  {id:'oncall',icon:'<i class="fas fa-calendar-days"></i>',label:'المناوبات'},
  {id:'exams',icon:'<i class="fas fa-file-pen"></i>',label:'الامتحانات والاختبارات'},
  {id:'clinicalcases',icon:'<i class="fas fa-stethoscope"></i>',label:'مشروع الحالات السريرية'},
  {id:'doctorstats',icon:'<i class="fas fa-chart-column"></i>',label:'احصائيات الأطباء'},
  {id:'evaluation',icon:'<i class="fas fa-chart-line"></i>',label:'التقييم السنوي'},
  {id:'links',icon:'<i class="fas fa-link"></i>',label:'روابط هامة'},
  {id:'myinfo',icon:'<i class="fas fa-id-card"></i>',label:'معلوماتي'},
  {id:'qa',icon:'<i class="fas fa-circle-question"></i>',label:'Q&A'}
];

function buildNav(){
  return TABS.map(t=>`<button class="nav-btn" data-tab="${t.id}">${t.icon} <span>${t.label}</span></button>`).join('');
}

function buildMainContent(){
  return `<section class="tab-content active" id="residents-tab"><div class="section-header"><h2><i class="fas fa-users"></i> لائحة مقيمي السنة الأولى <span class="count-badge" id="residentCount">0</span><span class="percentage-badge" id="joinedPercentageBadge" style="display:none;"></span></h2></div><div class="controls-row" style="margin-bottom:12px"><div class="search-box"><input type="text" id="residentSearch" placeholder="ابحث باسم أو اختصار..."><i class="fas fa-search"></i></div></div><div class="controls-row" style="margin-bottom:12px"><select class="specialty-filter" id="specialtyFilter" onchange="app.filterBySpecialty()"><option value="">جميع الاختصاصات</option></select><select class="shift-filter" id="shiftFilter" onchange="app.filterByShift()"><option value="">جميع الفروز</option></select><button class="filter-btn" id="filterJoinedBtn" onclick="app.toggleFilter()"><i class="fas fa-filter"></i> الملتحقين فقط</button><button class="filter-btn detached-filter-btn" id="filterDetachedBtn" onclick="app.toggleDetachedFilter()"><i class="fas fa-user-slash"></i> المنفكين 0</button></div><div class="contacts-bar"><button class="select-all-btn" onclick="app.toggleSelectAll()"><i class="fas fa-check-square"></i> تحديد الكل</button><span class="selected-count" id="selectedCount">0 محدد</span><button class="contacts-btn" id="exportContactsBtn" onclick="app.exportToContacts()" disabled><i class="fas fa-address-book"></i> تحميل إلى جهات اتصالي</button></div><div class="table-wrapper desktop-table"><table><thead><tr><th style="width:35px">ت</th><th style="width:40px"><i class="fas fa-check"></i></th><th>الاسم الثلاثي</th><th>الاختصار</th><th>الاختصاص</th><th>الهاتف</th><th>الفرز</th><th>الالتحاق</th><th>المناوبات</th><th>الحالة</th></tr></thead><tbody id="residentsBody"></tbody></table></div><div class="mobile-cards" id="residentsCards"></div></section>
<section class="tab-content" id="lectures-tab"><div class="section-header"><h2><i class="fas fa-calendar-check"></i> رزنامة المحاضرات والانشطة الطبية</h2><div class="search-box"><input type="text" id="lecturesSearch" placeholder="ابحث بعنوان المحاضرة أو المحتويات أو المحاضر..."><i class="fas fa-search"></i></div></div><div class="controls-row" style="margin-bottom:12px"><select class="specialty-filter" id="lecturesCategoryFilter" onchange="app.filterLecturesByCategory()"><option value="">كل التصنيفات</option></select><select class="specialty-filter" id="lecturesDeptFilter" onchange="app.filterLecturesByDept()"><option value="">كل الأقسام</option></select><select class="shift-filter" id="lecturesYearFilter" onchange="app.filterLecturesByYear()"><option value="">كل السنوات</option></select><button class="filter-btn" id="lecturesPastBtn" onclick="app.togglePastLectures()"><i class="fas fa-clock-rotate-left"></i> رؤية المحاضرات القديمة</button></div><div class="lectures-calendar-shell"><div class="lectures-calendar-head"><button class="filter-btn lectures-cal-nav" aria-label="الشهر السابق" onclick="app.changeLecturesCalendarMonth(-1)"><i class="fas fa-chevron-right"></i></button><h3 id="lecturesCalendarTitle"></h3><button class="filter-btn lectures-cal-nav" aria-label="الشهر التالي" onclick="app.changeLecturesCalendarMonth(1)"><i class="fas fa-chevron-left"></i></button></div><div id="lecturesMonthlyCalendar" class="lectures-monthly-calendar"></div></div><div id="lecturesSelectedDayBox" class="lectures-selected-day"></div><div class="lectures-section-head lectures-today-head"><h3><i class="fas fa-star"></i> محاضرات اليوم</h3></div><div id="todayLecturesHero" class="today-lectures-hero"></div><div class="lectures-section-head"><h3><i class="fas fa-calendar-plus"></i> المحاضرات القادمة</h3></div><div id="upcomingLecturesList" class="lectures-grid"></div><div id="pastLecturesWrap" style="display:none;"><div class="lectures-section-head"><h3><i class="fas fa-calendar-minus"></i> المحاضرات القديمة</h3></div><div id="pastLecturesList" class="lectures-grid"></div></div></section>
<section class="tab-content" id="shifts-tab"><div class="section-header"><h2><i class="fas fa-clipboard-list"></i> جدول فروز <span id="shiftMonthName"></span> <span class="shift-month-wrap"><span class="shift-month-label">الشهر</span><select class="month-selector" id="shiftsMonthSelector" onchange="app.changeShiftsMonth()"></select></span></h2><div class="search-box"><input type="text" id="shiftSearch" placeholder="ابحث باسم أو فرز..."><i class="fas fa-search"></i></div></div><div class="shifts-grid" id="shiftsGrid"></div></section>
<section class="tab-content" id="oncall-tab"><div class="section-header"><h2><i class="fas fa-calendar-check"></i> مناوبات شهر <span id="oncallMonthTitle"></span></h2></div><div class="oncall-year-filter" id="oncallYearFilter"><button type="button" class="oncall-year-btn active" data-year="y1" onclick="app.changeOncallYearFilter('y1')">السنة الأولى</button><button type="button" class="oncall-year-btn" data-year="y2" onclick="app.changeOncallYearFilter('y2')">السنة الثانية</button><button type="button" class="oncall-year-btn" data-year="y1y2" onclick="app.changeOncallYearFilter('y1y2')">الأولى + الثانية</button></div><div class="oncall-controls"><label><i class="fas fa-calendar-day"></i> اختر تاريخ:</label><input type="date" id="oncallDatePicker" onchange="app.selectDayFromCalendar()"><select class="month-selector" id="monthSelector" onchange="app.changeMonth()">${AM.map((m,i)=>`<option value="${i}">${m}</option>`).join('')}</select><button class="filter-btn" onclick="app.toggleOncallRawTable()"><i class="fas fa-table"></i> عرض كجدول</button></div><div id="oncallRawTableWrap" class="oncall-raw-wrap" style="display:none;"></div><div id="monthlyCalendar"></div><div id="oncallDayDisplay" style="margin-top:14px"></div></section>
<section class="tab-content" id="doctorstats-tab"><div class="section-header"><h2><i class="fas fa-chart-column"></i> احصائيات الأطباء <span class="count-badge" id="doctorStatsCount">0</span></h2><div class="search-box"><input type="text" id="doctorStatsSearch" placeholder="ابحث باسم الطبيب أو اختصاره..."><i class="fas fa-search"></i></div></div><div class="controls-row" style="margin-bottom:12px"><button class="filter-btn" id="sortHoursBtn" onclick="app.toggleDoctorStatsSort('hours')"><i class="fas fa-arrow-down-wide-short"></i> ترتيب حسب عدد الساعات</button><button class="filter-btn" onclick="app.downloadDoctorStatsExcel()"><i class="fas fa-file-excel"></i> تحميل كملف إكسل</button></div><div class="doctor-stats-grid" id="doctorStatsGrid"></div></section>
<section class="tab-content" id="evaluation-tab"><div class="section-header"><h2><i class="fas fa-star"></i> التقييم السنوي للمقيمين</h2><div class="search-box"><input type="text" id="evalSearch" placeholder="ابحث باسم أو اختصار..."><i class="fas fa-search"></i></div></div><div class="table-wrapper desktop-table"><table><thead id="evalHead"></thead><tbody id="evalBody"></tbody></table></div><div class="mobile-cards" id="evalCards"></div></section>
<section class="tab-content" id="links-tab"><div class="section-header"><h2><i class="fas fa-link"></i> الروابط والقنوات الهامة</h2></div><div id="linksGrid"></div></section>
<section class="tab-content" id="myinfo-tab"><div class="section-header"><h2><i class="fas fa-user-search"></i> معلوماتي</h2><div class="search-box"><input type="text" id="myInfoSearch" placeholder="اكتب اسمك أو اختصارك..."><i class="fas fa-search"></i></div></div><div class="myinfo-hint">قم بكتابة اسمك في مربع البحث ليظهر لك معلوماتك (الفرز - المناوبات - التقييم - الاحصائيات ...)</div><div id="searchResultsList" class="search-results-list"></div><div id="myInfoResult" class="student-result"></div></section>
<section class="tab-content" id="qa-tab"><div class="section-header"><h2><i class="fas fa-question-circle"></i> الأسئلة والأجوبة</h2><div class="search-box"><input type="text" id="qaSearch" placeholder="ابحث في الأسئلة والأجوبة..."><i class="fas fa-search"></i></div></div><div id="qaContainer"></div></section>
<section class="tab-content" id="complaints-tab"><div class="section-header"><h2><i class="fas fa-triangle-exclamation"></i> الشكاوي</h2></div><div class="student-result" style="display:block;"><div class="student-body"><div class="complaint-primary">اذا كانت هناك اي مشاكل إدارية يرجى التواصل<br>د. محمد عدنان طرابيشي<br>وتس 0964515974<br>تلغرام Adnan_Tarabishi@<br>وشكرا</div><hr style="margin:14px 0;border:none;border-top:1px solid var(--border);"><div class="student-header"><h3 style="margin:0 auto;text-align:center;">اذا كانت هناك اي مشاكل تقنية يرجى التواصل</h3></div><div class="info-row"><i class="fas fa-user"></i><strong>علي شايب</strong></div><div class="info-row"><i class="fab fa-whatsapp"></i> وتس 0983893299</div><div class="info-row"><i class="fab fa-telegram"></i> تلغرام @ALI15cha</div><div class="info-row" style="justify-content:center;font-weight:700;">وشكرا</div></div></div></section>`;
}

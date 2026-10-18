const fs=require('fs'), vm=require('vm');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','..','index.html'),'utf8');
const k1=html.indexOf('/* ---------- KPI сотрудника'), k2=html.indexOf('function initTabs(){');
const p1=html.indexOf('/* ---------- Фильтр периода в «Лидах»'), p2=html.indexOf('function renderMaxLeadsView(){');
if(k1<0||k2<0||p1<0||p2<0) throw new Error('markers not found in index.html');
const src=html.slice(k1,k2)+'\n'+html.slice(p1,p2);
function mk(todayStr){
  const RealDate=Date;
  const [y,m,d]=todayStr.split('-').map(Number);
  class FD extends RealDate{ constructor(...a){ if(a.length===0) super(y,m-1,d,12,0,0); else super(...a); } static now(){ return new RealDate(y,m-1,d,12).getTime(); } }
  const banner={cls:new Set(['hidden']),innerHTML:'',dataset:{},classList:{add(c){banner.cls.add(c)},remove(c){banner.cls.delete(c)},toggle(c,on){on?banner.cls.add(c):banner.cls.delete(c)},contains(c){return banner.cls.has(c)}}};
  const ctx={Date:FD,console,Math,Number,String,Object,Array,JSON,isNaN,parseFloat,
    el:(id)=>id==='kpi-banner'?banner:null,
    getMondayOf:(dd)=>{const day=dd.getDay();const diff=day===0?-6:1-day;const mo=new Date(dd);mo.setDate(dd.getDate()+diff);mo.setHours(0,0,0,0);return mo;},
    leadStatusDate:(l)=>(l.status==='Call done'&&l.callDate)?l.callDate:l.statusChangedDate,
    isNastyaUser:()=>true, viewAsUid:null, ownerUid:()=>'nastya', currentUser:{uid:'nastya'},
    maxLeads:[], maxRemindersAll:[], unsubMaxLeads:{}, subscribeMaxLeads(){}, doc(){}, getDoc(){}, getDocs(){}, query(){}, where(){}, collection(){}, db:{}, onSnapshot(){}, setDoc(){return Promise.resolve()}, updateDoc(){return Promise.resolve()}, deleteField(){}, document:{activeElement:null}, window:{}, setInterval(){}, alert(){}, confirm(){return true}
  };
  vm.createContext(ctx);
  vm.runInContext(src+'\nthis.__x={kpiRamp,kpiHistCompanies,maxPeriodGroups,kpiSnapshotOf,kpiFollowups,kpiNoTouch,kpiFuLimit,kFuMissedAt,kFuJournalStart,setRem:(r)=>{maxRemindersAll=r},kpiPay,kpiModel,kpiConf,kpiCheckReminder,kScale,kWork,kpiSla,kpiFacts,kpiCsv,kpiReportHtml,setData:(d)=>{kpiData=Object.assign({minN:1},d); kpiAll={data:kpiData}; kpiActive=\'data\';},setAll:(a)=>{kpiAll=a},kpiEmpIds,kLeadMine,kpiUse:(i)=>{kpiUse(i)},kpiConfOf,setLeads:(l)=>{maxLeads=l},setStats:(s)=>{kpiStats=s},kpiRange,kpiView:()=>kpiView};',ctx);
  return {x:ctx.__x,banner,ctx};
}
let fails=0; function ok(c,msg){ if(!c){fails++;console.log('FAIL',msg);} else console.log('ok  ',msg); }
function approx(a,b){return Math.abs(a-b)<1e-6;}

// ---- 1. proration mid-month
{
 const {x}=mk('2026-10-23');
 x.setData({startDate:'2026-10-19',firstProrate:false,sdrName:'Test'});
 const [f,t]=['2026-10-01','2026-10-31'];
 const m=x.kpiModel(f,t);
 ok(m.ok && m.f==='2026-10-19' && m.t==='2026-10-23','period clipped to start/today: '+m.f+'..'+m.t);
 ok(m.wd===5,'work days elapsed =5 got '+m.wd);
 ok(approx(m.scale,0.5),'scale 5/10 = 0.5 got '+m.scale);
 ok(m.idx===1,'month index 1');
 ok(m.active.map(d=>d.key).join()==='sla,meetings,scheduled,live','trial set = sla,meetings,scheduled(info),live: '+m.active.map(d=>d.key));
 ok(m.later.length===6,'later metrics 6 got '+m.later.length);
 const mt=m.rows.find(r=>r.def.key==='meetings');
 ok(approx(mt.th.min,1.5)&&approx(mt.th.plan,2)&&approx(mt.th.excl,2.5),'meetings thresholds scaled 1.5/2/2.5');
 const lv=m.rows.find(r=>r.def.key==='live');
 ok(lv.th.plan===45&&lv.th.min===35,'rate thresholds not scaled');
}
// ---- 2. November: month 2, more metrics, scale 9/21
{
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19',firstProrate:false});
 const m=x.kpiModel('2026-11-01','2026-11-30');
 ok(m.idx===2,'month index 2');
 ok(approx(m.scale,9/21),'scale 9/21 got '+m.scale);
 ok(m.active.some(d=>d.key==='companies')&&!m.active.some(d=>d.key==='r2i'),'month2 adds companies, not r2i');
 // week 2 of Nov scale
 const w=m.weeks.find(w=>w.mon==='2026-11-09'); ok(w&&w.wd===4&&approx(w.scale,4/21),'week 9-12 Nov: 4 days, scale 4/21 got '+(w&&w.scale));
}
// ---- 3. leads math
{
 const {x}=mk('2026-10-30');
 x.setData({startDate:'2026-10-19',firstProrate:false});
 const L=(id,co,status,msgs,extra)=>Object.assign({id,companyName:co,status,messages:msgs.map((d,i)=>({id:'m'+i,date:d,text:'t'})),statusChangedDate:msgs[0]||'2026-10-20'},extra||{});
 x.setLeads([
  L('1','Hilton','Interested',['2026-10-20','2026-10-21','2026-10-22']),   // live
  L('2','Hilton Hotels','Neutral',['2026-10-20']),                          // single
  L('3','  hilton ','Neutral',['2026-10-22','2026-10-23']),                  // live, same company as 1 (normalised)
  L('4','Marriott','Irrelevant',['2026-10-21']),                            // wrong icp (excluded from sig)
  L('5','Accor','Call scheduled',['2026-10-24'],{statusChangedDate:'2026-10-27'}),
  L('6','Old Co','Call done',['2026-09-01'],{callDate:'2026-10-26',statusChangedDate:'2026-09-02'}), // meeting counted by callDate; reply before period
  L('7','NoLog','Interested',[],{firstContactDate:'2026-10-21'}),          // legacy lead w/o messages -> 1 reply
 ]);
 const m=x.kpiModel('2026-10-01','2026-10-31');
 const g=k=>m.rows.find(r=>r.def.key===k);
 // cohort (first reply in Oct 19..30): 1,2,3,4,5,7 =6 ; sig excl Irrelevant(4) =5 ; live: 1,3 =2 -> 40%
 ok(approx(g('live').val,40),'live = 2/5=40% got '+g('live').val);
 ok(g('live').tier==='min','live 40% -> Минимум (35..45) got '+g('live').tier);
 ok(g('meetings').val===1,'meetings held: only Old Co (Call done by callDate) = 1 got '+g('meetings').val);
 ok(g('meetings').tier==='low','meetings 2 < min 3*1.0 -> low got '+g('meetings').tier);
 // companies metric (month 2) — compute directly via facts
 const f=x.kpiFacts('2026-10-19','2026-10-30');
 // companies with a message in range: hilton(1,2,3 normalised: 'hilton' ,'hilton hotels' differ!) -> hilton, hilton hotels, marriott, accor, nolog => 5 ('Old Co' has msg in Sept only)
 ok(f.companies.val===5,'companies unique normalised =5 got '+f.companies.val+' (Hilton vs Hilton Hotels stay separate by design)');
 ok(approx(f.wrongicp.val,100/6),'wrong ICP 1/6 got '+f.wrongicp.val);
 ok(approx(f.r2i.val,60),'r2i: Interested 1,7 + Call scheduled 5 =3 of 5 = 60% got '+f.r2i.val);
}
// ---- 4. SLA engine
{
 const {x}=mk('2026-10-23');
 x.setData({startDate:'2026-10-19',firstProrate:false,days:{
   '2026-10-19':{u:0,o:0},'2026-10-20':{u:1,o:0},'2026-10-21':{u:2,o:1},'2026-10-22':{u:5,o:0},'2026-10-23':{}},
   weeks:{'2026-10-19':{rd:0}}});
 const s=x.kpiSla('2026-10-19','2026-10-23');
 const un=s.rows[0], od=s.rows[1], rp=s.rows[2];
 // unanswered: 0->95, 1->90, 2->85, 5->0 => avg 67.5
 ok(approx(un.avg,67.5),'unanswered avg 67.5 got '+un.avg);
 // overdue: 0,0,1,0 -> 95,95,90,95 = 93.75
 ok(approx(od.avg,93.75),'overdue avg 93.75 got '+od.avg);
 ok(rp.avg===95,'report delay 0 -> 95');
 ok(approx(s.pct,(67.5+93.75+95)/3),'overall avg got '+s.pct);
 ok(s.checked===4 && s.clean===1,'clean days 1 of 4 got '+s.clean+'/'+s.checked);
}
// ---- 5. contacts proration from weekly stats
{
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19',firstProrate:false});
 // Oct 26-Nov 1 week has 5 workdays (26-30) all in Oct; Nov 2 week full in Nov
 x.setStats({'nastya_2026-10-26':100,'nastya_2026-11-02':200,'nastya_2026-11-09':50});
 const f=x.kpiFacts('2026-11-01','2026-11-12');
 ok(f.contacts.val===240,'contacts Nov 1-12 = 200 + 50*4/5 (partial week by workdays) got '+f.contacts.val);
 const o=x.kpiFacts('2026-10-19','2026-10-31');
 ok(o.contacts.val===undefined || o.contacts.val===null || typeof o.contacts.val==='number','oct contacts defined or loading');
}
// ---- 6. reminder dates
{
 function banner(today,done){ const {x,banner}=mk(today); const d={startDate:'2026-10-19',firstProrate:false}; if(done) d.done={'2026-10':true}; x.setData(d); x.kpiCheckReminder(); return banner; }
 let b=banner('2026-11-06'); ok(b.cls.has('hidden'),'6 Nov: no reminder');
 b=banner('2026-11-07'); ok(!b.cls.has('hidden') && b.innerHTML.includes('осталось дн.: 3') && b.innerHTML.includes('октябр'),'7 Nov: reminder 3 days before, for October: '+b.innerHTML);
 b=banner('2026-11-10'); ok(!b.cls.has('hidden') && b.innerHTML.includes('сегодня последний день'),'10 Nov: last day');
 b=banner('2026-11-11'); ok(!b.cls.has('hidden') && b.cls.has('deadline-banner') && b.innerHTML.includes('не закрыт'),'11 Nov: overdue style');
 b=banner('2026-11-08',true); ok(b.cls.has('hidden'),'done -> hidden');
 // start in Nov: October not applicable
 const {x,banner:bb}=mk('2026-11-08'); x.setData({startDate:'2026-11-03'}); x.kpiCheckReminder(); ok(bb.cls.has('hidden'),'start after prev month end: no reminder');
}
// ---- 7. exports
{
 const {x}=mk('2026-10-30');
 x.setData({startDate:'2026-10-19',firstProrate:false,sdrName:'Эвелина',days:{'2026-10-19':{u:0,o:0}}});
 x.setLeads([]);
 const rg={from:'2026-10-01',to:'2026-10-31',label:'Октябрь 2026'};
 const m=x.kpiModel(rg.from,rg.to);
 const csv=x.kpiCsv(m,rg), html=x.kpiReportHtml(m,rg);
 ok(csv.startsWith('﻿KPI;Эвелина;Период;Октябрь 2026'),'csv header');
 ok(html.includes('<title>KPI Эвелина')&&html.includes('Средний SLA'),'html report content');
 ok(csv.split('\r\n').length>15,'csv lines '+csv.split('\r\n').length);
}

// ---- 8. payout
{
 const {x}=mk('2026-10-30');
 x.setData({startDate:'2026-10-19',firstProrate:false});
 const L=(id,co,status,msgs)=>({id,companyName:co,status,messages:msgs.map((d,i)=>({id:'m'+i,date:d,text:'t'})),statusChangedDate:msgs[0]});
 x.setLeads([L('1','A','Interested',['2026-10-20','2026-10-21']),L('2','B','Neutral',['2026-10-20']),L('3','C','Call scheduled',['2026-10-22']),L('4','D','Neutral',['2026-10-23','2026-10-25']),L('5','E','Neutral',['2026-10-26'])]);
 const m=x.kpiModel('2026-10-01','2026-10-31');
 const g=k=>m.rows.find(r=>r.def.key===k);
 // weights trial: sla20 meetings30 live20 => W=70
 ok(Math.abs(g('meetings').amount-200*30/70)<1e-6,'meetings amount 85.71 got '+g('meetings').amount);
 // live: cohort 5 leads (A,B,C,D,E) sig 5; live A,D =2 => 40% -> min -> 50%
 ok(g('live').tier==='min' && Math.abs(g('live').pay-g('live').amount*0.5)<1e-6,'live min pays 50%: '+g('live').pay);
 // meetings: C only =1 <3 => low => 0
 ok(g('meetings').tier==='low' && g('meetings').pay===0,'meetings low pays 0');
 ok(g('sla').payNote==='нет данных' && m.pay.unrated===1,'sla nodata unrated');
 ok(Math.abs(m.pay.max-240)<1e-6,'max = 120% of 200 = 240 got '+m.pay.max);
 ok(Math.abs(m.pay.total-g('live').pay)<1e-6,'total = live only '+m.pay.total);
}
{ // gate by status accuracy + month 2 weights
 const {x}=mk('2026-11-30');
 x.setData({startDate:'2026-10-19',firstProrate:false,audits:{'2026-11':{n:20,wrong:6,miss:0}}});
 const L=(id,co,status,msgs)=>({id,companyName:co,status,messages:msgs.map((d,i)=>({id:'m'+i,date:d})),statusChangedDate:msgs[0]});
 x.setLeads([L('1','A','Interested',['2026-11-02','2026-11-03']),L('2','B','Interested',['2026-11-04','2026-11-05']),L('3','C','Neutral',['2026-11-06'])]);
 const m=x.kpiModel('2026-11-01','2026-11-30');
 const live=m.rows.find(r=>r.def.key==='live');
 ok(m.pay.gate===true && live.pay===0 && /не засчитан/.test(live.payNote),'gate at accuracy 70% <80: live not counted');
 // weights: sla20 meetings30 live20 companies10 contacts10 = 90 (r2i month3, others 0)
 ok(m.pay.W===90,'W month2 =90 got '+m.pay.W);
}
{ // custom bonus + levels
 const {x}=mk('2026-10-30'); x.setData({startDate:'2026-10-19',firstProrate:false,bonus:300,lvPlan:100,lvMin:40,lvExcl:150,gateAcc:null}); x.setLeads([]);
 const m=x.kpiModel('2026-10-01','2026-10-31'); ok(Math.abs(m.pay.bonus-300)<1e-9 && Math.abs(m.pay.max-450)<1e-6,'custom bonus 300, excl 150% => max 450 got '+m.pay.max);
}

// ---- 9. start on the 18th of a month, closing on the 10th of the next
{
 const {x,banner}=mk('2026-12-10');
 x.setData({startDate:'2026-11-18',sdrName:'Test'});
 const m=x.kpiModel('2026-11-01','2026-11-30');
 ok(m.f==='2026-11-18' && m.t==='2026-11-30','period = 18 Nov .. 30 Nov: '+m.f+'..'+m.t);
 ok(m.wd===9,'9 work days worked got '+m.wd);
 ok(Math.abs(m.scale-9/21)<1e-9,'norm = 9/21 of full month got '+m.scale);
 const mt=m.rows.find(r=>r.def.key==='meetings');
 ok(Math.abs(mt.th.plan-4*9/21)<1e-9,'meetings plan 4 -> '+mt.th.plan);
 ok(Math.abs(m.payShare-9/21)<1e-9 && Math.abs(m.pay.bonus-200*9/21)<1e-6,'bonus prorated 200*9/21='+m.pay.bonus);
 x.kpiCheckReminder();
 ok(!banner.cls.has('hidden') && banner.innerHTML.includes('ноябр') && banner.innerHTML.includes('сегодня последний день'),'10 Dec: banner for November, last day');
 // second month full (December): no proration
 const d=x.kpiModel('2026-12-01','2026-12-31');
 ok(d.idx===2 && d.payShare===1,'next month idx 2, full bonus share');
}
{ // toggle off: first month treated as full month from start date
 const {x}=mk('2026-12-10');
 x.setData({startDate:'2026-11-18',firstProrate:false});
 const m=x.kpiModel('2026-11-01','2026-11-30');
 ok(Math.abs(m.scale-1)<1e-9 && m.payShare===1 && m.pay.bonus===200,'toggle off: scale 1, full bonus');
}
{ // start on a weekend (Sun 18 Oct 2026): first worked day is Monday 19
 const {x}=mk('2026-11-10');
 x.setData({startDate:'2026-10-18'});
 const m=x.kpiModel('2026-10-01','2026-10-31');
 ok(m.f==='2026-10-18' && m.wd===10,'start Sunday 18 Oct: 10 work days (19-23, 26-30) got '+m.wd);
 ok(Math.abs(m.scale-10/22)<1e-9,'scale 10/22 got '+m.scale);
}

// ---- 10. follow-up journal
{
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19'});
 const H=(created,evts)=>[{type:'created',d:created,t:created+'T08:00:00Z'}].concat(evts.map((e,i)=>Object.assign({t:e.d+'T1'+i+':00:00Z'},e)));
 const R=(id,orig,date,extra)=>Object.assign({id,origDate:orig,date,done:false,leadId:null,name:id},extra);
 const rem=[
  R('R1','2026-11-05','2026-11-05',{done:true,doneDate:'2026-11-05',history:H('2026-11-02',[{type:'done',d:'2026-11-05'}])}),
  R('R2','2026-11-04','2026-11-04',{done:true,doneDate:'2026-11-06',history:H('2026-11-02',[{type:'done',d:'2026-11-06'}])}),
  R('R3','2026-11-03','2026-11-03',{history:H('2026-11-02',[])}),
  R('R4','2026-11-03','2026-11-10',{done:true,doneDate:'2026-11-10',history:H('2026-11-02',[{type:'date',from:'2026-11-03',to:'2026-11-10',d:'2026-11-03',by:'a@x'},{type:'done',d:'2026-11-10'}])}),
  R('R5','2026-11-05','2026-11-05',{deleted:true,history:H('2026-11-02',[{type:'deleted',d:'2026-11-05'}])}),
  R('R6','2026-11-20','2026-11-20',{history:H('2026-11-10',[])}),
  {id:'R7',date:'2026-11-02',done:true,name:'R7'}, // legacy: no history
 ];
 x.setRem(rem);
 const r=x.kpiFollowups('2026-11-01','2026-11-12'), c=r.c;
 ok(c.total===6,'follow-up total in period 6 got '+c.total);
 ok(c.ontime===1 && c.late===2 && c.missed===1 && c.deleted===1 && c.nolog===1,'ontime1 late2 missed1 deleted1 nolog1 got '+JSON.stringify(c));
 ok(c.moved===1,'moved 1 (R4)');
 ok(x.kFuJournalStart()==='2026-11-02','journal start = first event date');
 ok(x.kFuMissedAt('2026-11-04')===2,'end of 4 Nov: R2 and R3 unfinished (R4 already moved) got '+x.kFuMissedAt('2026-11-04'));
 ok(x.kFuMissedAt('2026-11-06')===1,'end of 6 Nov: only R3 got '+x.kFuMissedAt('2026-11-06'));
 // moved + done late: lists problem rows
 ok(r.rows.some(q=>q.r.id==='R4'&&q.moves.length===1) && r.rows.some(q=>q.r.id==='R3') && !r.rows.some(q=>q.r.id==='R1'),'problem rows list');
}
{
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19'});
 const L=(id,status,last,extra)=>Object.assign({id,companyName:id,status,messages:[{date:last,id:'m'}],statusChangedDate:last},extra||{});
 x.setLeads([L('L1','Neutral','2026-11-03'),L('L2','Neutral','2026-11-10'),L('L3','Neutral','2026-11-05'),L('L4','Not interested','2026-10-01'),L('L5','Neutral','2026-11-02'),L('L6','Neutral','2026-11-02')]);
 const rm=(id,lead,date,done,dd)=>({id,leadId:lead,date,origDate:date,done:!!done,doneDate:dd||null,history:[{type:'created',d:'2026-11-02',t:'2026-11-02T00:00:00Z'}]});
 x.setRem([rm('a','L3','2026-11-13'), rm('b1','L5','2026-11-04',true,'2026-11-04'),rm('b2','L5','2026-11-06',true,'2026-11-06'),rm('b3','L5','2026-11-10',true,'2026-11-10'),
   rm('c1','L6','2026-11-04',true,'2026-11-04'),rm('c2','L6','2026-11-06',true,'2026-11-06'),rm('c3','L6','2026-11-09',true,'2026-11-09'),rm('c4','L6','2026-11-13')]);
 const nt=x.kpiNoTouch().map(q=>q.l.id).sort();
 // L1: last 3 Nov, no plan, 7 wd -> flagged; L2 fine; L3 plan 13 Nov is 6 wd after 5 Nov -> flagged; L4 terminal; L5 last done 10 Nov -> fine; L6 last done 9 Nov, plan 13 Nov -> gap 4 wd(10,11,12,13) >3 -> flagged
 ok(nt.join()==='L1,L3,L6','no-touch leads L1,L3,L6 got '+nt.join());
 const lim=x.kpiFuLimit();
 ok(lim.length===2 && lim.find(q=>q.l.id==='L5').why.includes('нужно решение') && lim.find(q=>q.l.id==='L6').why.includes('превышен'),'limit: L5 decision needed, L6 exceeded: '+JSON.stringify(lim.map(q=>q.l.id+':'+q.why)));
}
{ // SLA uses auto value for follow-ups when journal exists
 const {x}=mk('2026-11-06');
 x.setData({startDate:'2026-10-19',days:{'2026-11-04':{u:0},'2026-11-05':{u:0,o:0}}});
 const H=(c)=>[{type:'created',d:c,t:c+'T00:00:00Z'}];
 x.setRem([{id:'z',origDate:'2026-11-03',date:'2026-11-03',done:false,history:H('2026-11-02')}]);
 const s=x.kpiSla('2026-11-04','2026-11-05');
 // 4 Nov: manual u=0, o auto=1 (open overdue) => SLA o: 1 -> 90 ; 5 Nov: manual o=0 overrides auto => 95
 ok(Math.abs(s.rows[1].avg-92.5)<1e-9,'overdue SLA mixes auto(1)->90 and manual override(0)->95 = 92.5 got '+s.rows[1].avg);
 ok(s.checked===2 && s.clean===1,'clean days 1 of 2 got '+s.clean+'/'+s.checked);
}

// ---- 11. personal absences (vacation / sick days) shrink the norms proportionally
{
 const {x}=mk('2026-12-10');
 x.setData({startDate:'2026-10-19',absences:['2026-11-09..2026-11-13']});
 const m=x.kpiModel('2026-11-01','2026-11-30');
 ok(m.wd===16 && m.absDays===5,'Nov: 21 work days - 5 absent = 16 worked got '+m.wd+'/'+m.absDays);
 ok(Math.abs(m.scale-16/21)<1e-9,'norm scale 16/21 got '+m.scale);
 const mt=m.rows.find(r=>r.def.key==='meetings');
 ok(Math.abs(mt.th.min-3*16/21)<1e-9 && Math.abs(mt.th.plan-4*16/21)<1e-9 && Math.abs(mt.th.excl-5*16/21)<1e-9,'meetings min/plan/excl scaled 16/21');
 ok(Math.abs(m.payShare-16/21)<1e-9 && Math.abs(m.pay.bonus-200*16/21)<1e-6,'bonus prorated 16/21 got '+m.pay.bonus);
 const live=m.rows.find(r=>r.def.key==='live'); ok(live.th.plan===45,'percent norms not scaled');
 ok(m.daily.filter(d=>d.off).length===5,'daily rows mark 5 off days');
}
{ // per-day off flag + SLA skips absent day + current month mid-way
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19',days:{'2026-11-10':{off:true,u:9,o:9},'2026-11-11':{u:0,o:0}}});
 const m=x.kpiModel('2026-11-01','2026-11-30');
 // worked up to 12 Nov: 2-6,9,11,12 -> 8 (10 Nov off), full month 21
 ok(m.wd===8 && Math.abs(m.scale-8/21)<1e-9,'mid-month: 8 worked days, scale 8/21 got '+m.wd+' / '+m.scale);
 const s=m.sla; ok(s.rows[0].n===1 && s.checked===1 && s.clean===1,'SLA ignores the off day (bad values 9 not counted) n='+s.rows[0].n);
 ok(Math.abs(m.pay.bonus-200*(20/21))<1e-6,'bonus share = whole-month worked 20/21 (10 Nov off) got '+m.pay.bonus);
}

// ---- 12. live dialog (new definition): active leads in the period, share with a 2nd+ reply in the period
{
 const {x}=mk('2026-12-12');
 x.setData({startDate:'2026-09-01',firstProrate:false});
 const L=(id,msgs,status)=>({id,companyName:id,status:status||'Neutral',messages:msgs.map((d,i)=>({id:'m'+i,date:d})),statusChangedDate:msgs[0]});
 x.setLeads([
  L('A',['2026-09-20','2026-10-03']),                   // first Sep, continues in Oct -> live in Oct (continuing)
  L('B',['2026-10-05','2026-10-08']),                   // new in Oct, two replies in Oct -> live
  L('C',['2026-10-30','2026-11-03']),                   // new Oct 30 (single in Oct), second Nov 3
  L('D',['2026-09-25','2026-09-28','2026-10-04']),      // went live in Sep, replies again in Oct -> live again (ok)
  L('E',['2026-10-10']),                                // new in Oct, single -> not live
  L('F',['2026-09-10']),                                // silent after Sep, not active in Oct
  L('G',['2026-10-12','2026-10-13'],'Irrelevant'),      // excluded
 ]);
 const o=x.kpiFacts('2026-10-01','2026-10-31');
 // active in Oct: A,B,C,D,E = 5 ; live: A,B,D = 3 => 60%
 ok(Math.abs(o.live.val-60)<1e-9 && o.live.n===5,'Oct: 3 of 5 active = 60% got '+o.live.val+' n='+o.live.n);
 ok(/новых 3, из прошлых периодов 2/.test(o.live.base),'Oct breakdown new 3 / earlier 2: '+o.live.base);
 const n=x.kpiFacts('2026-11-01','2026-11-30');
 ok(Math.abs(n.live.val-100)<1e-9 && n.live.n===1,'Nov: only C active, second reply -> 100% got '+n.live.val);
 // silent lead F is not in October (not in the base) and E is not in November
 const s=x.kpiFacts('2026-09-01','2026-09-30'); // Sep: A(new,single in Sep), D(new live), F(new single) => 1 of 3
 ok(Math.abs(s.live.val-100/3)<1e-9 && s.live.n===3,'Sep: D live of A,D,F = 33.3% got '+s.live.val);
 x.setData({startDate:'2026-09-01',firstProrate:false,liveMin:3});
 const g=x.kpiFacts('2026-10-01','2026-10-31'); ok(Math.abs(g.live.val-20)<1e-9,'threshold 3rd reply: only D (3rd reply 4 Oct) = 1 of 5 = 20% got '+g.live.val);
 // leads whose first reply is before the start date are ignored unless enabled
 x.setData({startDate:'2026-10-01',firstProrate:false});
 const p1=x.kpiFacts('2026-10-01','2026-10-31'); ok(p1.live.n===3,'pre-start leads excluded: active B,C,E = 3 got '+p1.live.n);
 x.setData({startDate:'2026-10-01',firstProrate:false,livePre:true});
 const p2=x.kpiFacts('2026-10-01','2026-10-31'); ok(p2.live.n===5,'livePre on: 5 active got '+p2.live.n);
}

// ---- 13. one lead with many replies = one live dialog, not many
{
 const {x}=mk('2026-11-12'); x.setData({startDate:'2026-10-19',firstProrate:false});
 const L=(id,co,msgs)=>({id,companyName:co,status:'Neutral',messages:msgs.map((d,i)=>({id:'m'+i,date:d})),statusChangedDate:msgs[0]});
 x.setLeads([L('A','Hilton',['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']), L('B','Accor',['2026-11-03']), L('C','Hilton',['2026-11-04','2026-11-05'])]);
 const f=x.kpiFacts('2026-11-01','2026-11-30');
 ok(f.live.n===3 && Math.abs(f.live.val-200/3)<1e-9,'5 replies from A count once: live 2 of 3 leads = 66.7% got '+f.live.val+' n='+f.live.n);
 ok(f.companies.val===2,'companies in dialog counts companies once (Hilton x2 leads) = 2 got '+f.companies.val);
}

// ---- 14. meetings: held (paid) vs scheduled (info), by their own dates
{
 const {x}=mk('2026-11-20'); x.setData({startDate:'2026-10-19',firstProrate:false});
 const L=(id,status,extra)=>Object.assign({id,companyName:id,status,messages:[{date:'2026-10-20'}],statusChangedDate:'2026-10-20'},extra);
 x.setLeads([
  L('A','Call done',{scheduledDate:'2026-10-28',callDate:'2026-11-04'}), // scheduled in Oct, held in Nov
  L('B','Call scheduled',{scheduledDate:'2026-11-05',meetingDate:'2026-11-25'}),
  L('C','Call done',{scheduledDate:'2026-11-02',callDate:'2026-11-10'}),
  L('D','Call scheduled',{statusChangedDate:'2026-10-30'}),               // no scheduledDate: falls back to status change date
 ]);
 const oct=x.kpiFacts('2026-10-19','2026-10-31'), nov=x.kpiFacts('2026-11-01','2026-11-30');
 ok(oct.meetings.val===0 && oct.scheduled.val===2,'Oct: held 0, scheduled A and D = 2 got '+oct.meetings.val+'/'+oct.scheduled.val);
 ok(nov.meetings.val===2 && nov.scheduled.val===2,'Nov: held A and C = 2, scheduled B and C = 2 got '+nov.meetings.val+'/'+nov.scheduled.val);
 ok(nov.meetings.list.length===2 && /звонок/.test(nov.meetings.list[0]),'drill list for meetings');
}
// ---- 15. small samples are not coloured / not paid
{
 const {x}=mk('2026-11-12'); x.setData({startDate:'2026-10-19',firstProrate:false,minN:10});
 x.setLeads([{id:'1',companyName:'A',status:'Interested',messages:[{date:'2026-11-03'},{date:'2026-11-04'}],statusChangedDate:'2026-11-03'}]);
 const m=x.kpiModel('2026-11-01','2026-11-30'), live=m.rows.find(r=>r.def.key==='live');
 ok(live.tier==='small' && live.low===true,'n=1 < minN 10 -> "small", no tier colour');
 ok(live.pay===0 && live.payNote==='мало данных','small sample -> not paid, noted');
 ok(m.pay.unrated>=1,'counted as unrated');
}
// ---- 16. author filter + list source (Wrong ICP only on own research)
{
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19',firstProrate:false,authorOnly:true,sdrEmail:'sdr@hotelcompas.com'});
 const L=(id,by,extra)=>Object.assign({id,companyName:id,status:'Neutral',messages:[{date:'2026-11-03',by},{date:'2026-11-04',by}],statusChangedDate:'2026-11-03'},extra);
 x.setLeads([L('A','sdr@hotelcompas.com'),L('B','nastya@hotelcompas.com'),L('C',undefined)]);
 const f=x.kpiFacts('2026-11-01','2026-11-30');
 ok(f.live.n===1,'only SDR-authored messages count: 1 active lead got '+f.live.n);
 x.setData({startDate:'2026-10-19',firstProrate:false});
 const g=x.kpiFacts('2026-11-01','2026-11-30'); ok(g.live.n===3,'filter off: all 3 leads');
 x.setLeads([L('A','s',{status:'Irrelevant'}),L('B','s',{status:'Irrelevant',listSource:'nastya'}),L('C','s'),L('D','s',{listSource:'sdr'})]);
 const w=x.kpiFacts('2026-11-01','2026-11-30');
 ok(w.wrongicp.n===3 && Math.abs(w.wrongicp.val-100/3)<1e-9,'Wrong ICP: lead from Nastya list excluded: 1 of 3 got '+w.wrongicp.val+' n='+w.wrongicp.n);
}
// ---- 17. snapshot is a plain, storable object
{
 const {x}=mk('2026-12-12'); x.setData({startDate:'2026-10-19',firstProrate:false}); x.setLeads([]);
 const m=x.kpiModel('2026-11-01','2026-11-30'), s=x.kpiSnapshotOf(m,'2026-11');
 const walk=(o)=>{ for(const k in o){ const v=o[k]; if(v===undefined) return false; if(v&&typeof v==='object'&&!walk(v)) return false; } return true; };
 ok(walk(s) && s.rows.length===m.rows.length && s.month==='2026-11','snapshot has no undefined values (Firestore-safe), rows match');
}
// ---- 18. period filter in Leads: new vs continuation
{
 const {x}=mk('2026-11-12');
 const L=(id,ds)=>({id,companyName:id,messages:ds.map((d,i)=>({id:'m'+i,date:d}))});
 const leads=[L('A',['2026-11-02']),L('B',['2026-10-28','2026-11-03']),L('C',['2026-11-04','2026-11-05','2026-11-06']),L('D',['2026-10-01','2026-10-02','2026-10-03','2026-11-09']),L('E',['2026-10-10'])];
 const g=x.maxPeriodGroups(leads,'2026-11-01','2026-11-30');
 ok(g.neu.length===2 && g.neu.map(r=>r.l.id).sort().join()==='A,C','new in Nov: A and C got '+g.neu.map(r=>r.l.id));
 ok(g.cont.length===3 && g.cont.map(r=>r.l.id).sort().join()==='B,C,D','continuation: B (2nd), C (2nd,3rd), D (4th) got '+g.cont.map(r=>r.l.id));
 ok(g.two===1 && g.three===2,'breakdown: 2nd = B only; 3rd+ = C and D got '+g.two+'/'+g.three);
 ok(g.active.length===4 && g.msgs===6,'active 4 leads (E silent), 6 messages in period got '+g.active.length+'/'+g.msgs);
}

// ---- 19. several employees: reminders, switching, attribution by author
{
 const {x,banner}=mk('2026-11-08');
 x.setAll({ data:{sdrName:'Эвелина',startDate:'2026-10-19',createdAtMs:0}, emp_b:{sdrName:'Ирина',startDate:'2026-10-05',createdAtMs:5,done:{'2026-10':true}}, emp_c:{sdrName:'Старый',startDate:'2026-10-05',createdAtMs:7,archived:true} });
 x.kpiCheckReminder();
 ok(!banner.cls.has('hidden') && banner.innerHTML.includes('Эвелина') && !banner.innerHTML.includes('Ирина') && !banner.innerHTML.includes('Ещё сотрудников'),'only employees without closed month and not archived: Эвелина');
 x.setAll({ data:{sdrName:'Эвелина',startDate:'2026-10-19',createdAtMs:0}, emp_b:{sdrName:'Ирина',startDate:'2026-10-05',createdAtMs:5} });
 x.kpiCheckReminder();
 ok(banner.innerHTML.includes('Ещё сотрудников: 1'),'two pending employees: banner mentions the other one');
 ok(x.kpiEmpIds().join()==='data,emp_b','employees ordered by creation (legacy doc first)');
 x.kpiUse('emp_b'); ok(x.kpiConfOf({sdrName:'X'}).sdrName==='X','config is read from any employee document');
}
{ // attribution: with the author filter on, only own leads/messages/reminders count
 const {x}=mk('2026-11-12');
 x.setData({startDate:'2026-10-19',firstProrate:false,authorOnly:true,sdrEmail:'a@hotelcompas.com'});
 const L=(id,by,status,cb)=>({id,companyName:id,createdBy:cb,status:status||'Neutral',callDate:'2026-11-05',statusChangedDate:'2026-11-05',messages:[{date:'2026-11-03',by},{date:'2026-11-04',by}]});
 x.setLeads([L('A1','a@hotelcompas.com','Call done'),L('B1','b@hotelcompas.com','Call done','b@hotelcompas.com'),L('C1','b@hotelcompas.com','Neutral','a@hotelcompas.com')]);
 const f=x.kpiFacts('2026-11-01','2026-11-30');
 ok(f.meetings.val===1,'meetings: only employee A lead counted (B excluded) got '+f.meetings.val);
 ok(f.companies.val===1,'companies: only A1 (C1 is A lead, but its replies were logged by B, so not counted) got '+f.companies.val);
 x.setData({startDate:'2026-10-19',firstProrate:false});
 ok(x.kpiFacts('2026-11-01','2026-11-30').meetings.val===2,'filter off: both meetings counted');
}

// ---- 20. meeting norm grows with tenure: 3/4/5 -> 10 from month 4 -> 15 from month 7
{
 const mt=(start,end0,end1,data)=>{ const {x}=mk(end1); x.setData(Object.assign({startDate:start,firstProrate:false},data||{})); x.setLeads([]); return x.kpiModel(end0,end1).rows.find(r=>r.def.key==='meetings'); };
 let r=mt('2026-10-01','2026-10-01','2026-10-31'); ok(r.th.plan===4 && r.th.min===3 && r.th.excl===5,'month 1: 3/4/5');
 r=mt('2026-07-01','2026-10-01','2026-10-31'); ok(r.th.plan===10 && r.th.min===8 && r.th.excl===12,'month 4 (Jul start): plan 10 got '+r.th.plan);
 r=mt('2026-04-01','2026-10-01','2026-10-31'); ok(r.th.plan===15 && r.th.min===12 && r.th.excl===18,'month 7 (Apr start): plan 15 got '+r.th.plan);
 r=mt('2026-07-01','2026-09-01','2026-09-30'); ok(r.th.plan===4,'month 3 still 4 got '+r.th.plan);
 r=mt('2026-07-01','2026-10-01','2026-10-31',{meetingStages:[{from:1,min:2,plan:3,excl:4},{from:2,min:5,plan:6,excl:7}]}); ok(r.th.plan===6,'custom stages respected: plan 6 got '+r.th.plan);
 // prorated by worked days like other count norms (absence 5 of 22 days in Oct 2026)
 r=mt('2026-07-01','2026-10-01','2026-10-31',{absences:['2026-10-05..2026-10-09']}); ok(Math.abs(r.th.plan-10*17/22)<1e-9,'month 4 plan 10 prorated by worked days 17/22 got '+r.th.plan);
}

// ---- 21. thresholds from history (contacts / companies)
{
 const {x}=mk('2026-11-12');
 const r=x.kpiRamp(600); ok(r.min===600 && r.plan===690 && r.excl===780,'ramp 600 -> 600/690/780 got '+JSON.stringify(r));
 x.setData({startDate:'2026-07-01',firstProrate:false});
 const L=(id,ds)=>({id,companyName:id,status:'Neutral',messages:ds.map((d,i)=>({id:'m'+i,date:d})),statusChangedDate:ds[0]});
 // companies with a reply: Aug 3 (A,B,C), Sep 2 (A,B,C,D,E,F), Oct 1 (A,B,C)
 const mk2=(co,months)=>L(co,months.map(m=>m+'-10'));
 x.setLeads(['A','B','C'].map(c=>mk2(c,['2026-08','2026-09','2026-10'])).concat(['D','E','F'].map(c=>mk2(c,['2026-09']))));
 const h=x.kpiHistCompanies(); ok(h && h.n===3 && Math.abs(h.avg-4)<1e-9,'avg companies per full month (3,6,3) = 4 got '+(h&&h.avg));
 x.setData({startDate:'2026-10-20',firstProrate:false}); ok(x.kpiHistCompanies()===null,'start month is partial: no history yet -> null');
}

// ---- 22. contacts per month: 1500 / 1800 / 2700 from the regulation, prorated by worked days
{
 const {x}=mk('2026-11-30'); x.setData({startDate:'2026-10-05',firstProrate:false}); x.setLeads([]);
 x.setStats({'nastya_2026-10-26':0,'nastya_2026-11-02':400,'nastya_2026-11-09':400,'nastya_2026-11-16':400,'nastya_2026-11-23':400,'nastya_2026-11-30':200});
 const m=x.kpiModel('2026-11-01','2026-11-30'); const r=m.rows.find(q=>q.def.key==='contacts');
 ok(r.th.min===1500*m.scale && r.th.plan===1800*m.scale && r.th.excl===2700*m.scale,'contacts norms 1500/1800/2700 scaled by '+m.scale);
 ok(r.val===1640 && r.tier==='min','4 full weeks (1600) + 1/5 of the week 30 Nov (200*1/5=40) = 1640 -> Минимум (>=1500, <1800) got '+r.val+' '+r.tier);
}
console.log(fails?('FAILED '+fails):'ALL PASSED');
process.exit(fails?1:0);

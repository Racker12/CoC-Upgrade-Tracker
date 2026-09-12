import { parseVillageExport } from './village-import.js';
import { loadUpgradeData } from './data-loader.js';

const $=s=>document.querySelector(s);
const storeKey='cocTrackerV2';
const oldStoreKey='cocTrackerV1';
let data={items:[]};
let exportMap={};
let state=loadState();
let tab='buildings';
let importMode='new';

function loadState(){
  try {
    const v2=localStorage.getItem(storeKey);
    if(v2)return JSON.parse(v2);
    const v1=localStorage.getItem(oldStoreKey);
    if(v1){const s=JSON.parse(v1);for(const a of s.accounts||[]){a.instances=a.instances||{};a.lastImport=a.lastImport||null;a.importUnknown=a.importUnknown||[]}return s}
  } catch {}
  return {accounts:[],active:null};
}
const save=()=>localStorage.setItem(storeKey,JSON.stringify(state));
const uid=()=>crypto.randomUUID();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=s=>{s=Math.max(0,Math.round(s));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return [d&&`${d}T`,h&&`${h}h`,m&&`${m}m`].filter(Boolean).join(' ')||'<1m'};
const dateFmt=ms=>new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(ms));
const active=()=>state.accounts.find(a=>a.id===state.active);
const levelInfo=(item,lvl)=>item?.levels?.find(x=>x.level===lvl);
const maxForTH=(item,th)=>Math.max(0,...(item?.levels||[]).filter(l=>(l.townHallRequired||0)<=th).map(l=>l.level));
const cats=['buildings','heroes','pets','troops','spells','siege','traps','walls'];
const labels={buildings:'Gebäude',heroes:'Helden',pets:'Haustiere',troops:'Truppen',spells:'Zauber',siege:'Belagerung',traps:'Fallen',walls:'Mauern'};
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const itemById=id=>data.items.find(i=>i.id===id);
const itemNamed=(...names)=>data.items.find(i=>names.some(n=>norm(i.name)===norm(n)));
const runRemaining=r=>fmt((r.end-Date.now())/1000);

function accountWorkStatus(a){
  const builderItem=data.items.find(i=>Number(i.dataId)===1000015)||itemNamed("Builder's Hut",'Builders Hut','Builder Hut');
  const labItem=data.items.find(i=>Number(i.dataId)===1000007)||itemNamed('Laboratory');
  const petHouseItem=data.items.find(i=>Number(i.dataId)===1000068)||itemNamed('Pet House');
  const builderCount=builderItem ? (a.instances[builderItem.id]?.length||0) : 0;
  const labAvailable=!!(labItem&&(a.instances[labItem.id]?.length||0));
  const petAvailable=!!(petHouseItem&&(a.instances[petHouseItem.id]?.length||0));
  const builderJobs=[];

  for(const [id,arr] of Object.entries(a.instances||{})){
    const item=itemById(id);
    if(!item||!['buildings','traps'].includes(item.category))continue;
    arr.forEach((inst,index)=>{
      if(!inst.running)return;
      builderJobs.push({
        label:`${item.name}${arr.length>1?` #${index+1}`:''}`,
        detail:`Lv. ${inst.running.from} → ${inst.running.to}`,
        end:inst.running.end,
        imported:!!inst.running.imported
      });
    });
  }
  for(const [id,run] of Object.entries(a.running||{})){
    if(!run)continue;
    const item=itemById(id);
    if(item?.category!=='heroes')continue;
    builderJobs.push({label:item.name,detail:`Lv. ${run.from} → ${run.to}`,end:run.end,imported:!!run.imported});
  }
  builderJobs.sort((x,y)=>x.end-y.end);

  const labJobs=[];
  const petJobs=[];
  for(const [id,run] of Object.entries(a.running||{})){
    if(!run)continue;
    const item=itemById(id);if(!item)continue;
    const job={label:item.name,detail:`Lv. ${run.from} → ${run.to}`,end:run.end,imported:!!run.imported};
    if(['troops','spells','siege'].includes(item.category))labJobs.push(job);
    if(item.category==='pets')petJobs.push(job);
  }
  labJobs.sort((x,y)=>x.end-y.end);petJobs.sort((x,y)=>x.end-y.end);
  return {builderCount,builderJobs,labJobs,petJobs,labAvailable,petAvailable};
}

function newAccount(name){return{id:uid(),name:name||`Account ${state.accounts.length+1}`,tag:'',th:1,costReduction:0,timeReduction:0,hideMax:false,progress:{},running:{},instances:{},lastImport:null,importUnknown:[]}}
function ensureAccount(a){a.progress ||= {};a.running ||= {};a.instances ||= {};a.costReduction ??=0;a.timeReduction??=0;a.hideMax??=false;a.importUnknown||=[]}
function ensureProgress(a){ensureAccount(a);for(const i of data.items){if(['buildings','traps','walls'].includes(i.category))continue;if(a.progress[i.id]==null)a.progress[i.id]=0}}

function renderAccounts(){
  const el=$('#accounts');
  if(!state.accounts.length){el.innerHTML='<div class="empty asideEmpty">Noch kein Account.<br><br>Importiere deinen Village-JSON-Export.</div>';return}
  el.innerHTML=state.accounts.map(a=>`<button class="account ${a.id===state.active?'active':''}" data-id="${a.id}"><b>${esc(a.name)}</b><br><span class="meta">RH ${a.th}${a.tag?` · ${esc(a.tag)}`:''}</span></button>`).join('');
  el.querySelectorAll('.account').forEach(b=>b.onclick=()=>{state.active=b.dataset.id;save();render()})
}

function openImport(mode){
  importMode=mode;
  $('#importTitle').textContent=mode==='new'?'Neuen Account aus Village JSON anlegen':'Aktiven Account mit Village JSON aktualisieren';
  $('#jsonInput').value='';$('#importError').classList.add('hidden');$('#importDialog').showModal();
  setTimeout(()=>$('#jsonInput').focus(),50);
}
async function pasteClipboard(){
  try{$('#jsonInput').value=await navigator.clipboard.readText();$('#importError').classList.add('hidden')}
  catch{$('#importError').textContent='Browser konnte die Zwischenablage nicht lesen. Bitte mit Strg+V einfügen.';$('#importError').classList.remove('hidden')}
}
function applyImport(){
  try{
    const parsed=parseVillageExport($('#jsonInput').value,exportMap,data.items);
    let a;
    if(importMode==='new'){
      a=newAccount(parsed.tag?`Account ${state.accounts.length+1}`:undefined);
      state.accounts.push(a);state.active=a.id;
    }else{
      a=active();if(!a)throw new Error('Kein aktiver Account vorhanden.');
    }
    ensureAccount(a);
    // Village export is authoritative for these sections. Keep custom account name and boost settings.
    a.tag=parsed.tag||a.tag;
    a.th=parsed.th;
    // Home-Village-Singletons aus dem neuen Snapshot ersetzen; alte Timer dürfen nicht hängen bleiben.
    for(const item of data.items){
      if(['heroes','pets','troops','spells','siege'].includes(item.category)){
        a.progress[item.id]=0;
        delete a.running[item.id];
      }
    }
    a.progress={...a.progress,...parsed.progress};
    a.running={...a.running,...parsed.running};
    a.instances=parsed.instances;
    a.lastImport=parsed.timestamp;
    a.importUnknown=parsed.unknown;
    a.importStats=parsed.stats;
    ensureProgress(a);save();$('#importDialog').close();render();
  }catch(e){$('#importError').textContent=e.message||String(e);$('#importError').classList.remove('hidden')}
}

function finishExpired(){
  let changed=false;
  for(const a of state.accounts){ensureAccount(a);
    for(const [id,r] of Object.entries(a.running)){if(Date.now()>=r.end){a.progress[id]=r.to;delete a.running[id];changed=true}}
    for(const arr of Object.values(a.instances)){for(const inst of arr){if(inst.running&&Date.now()>=inst.running.end){inst.level=inst.running.to;delete inst.running;changed=true}}}
  }
  if(changed)save();
}

function startSingletonUpgrade(a,item){
  const cur=a.progress[item.id]||0,next=cur+1,li=levelInfo(item,next);if(!li)return;
  const duration=Math.round(li.durationSeconds*(1-a.timeReduction/100));
  a.running[item.id]={from:cur,to:next,start:Date.now(),end:Date.now()+duration*1000,cost:Math.round(li.cost*(1-a.costReduction/100)),resource:li.resource,imported:false};save();render();
}
function startInstanceUpgrade(a,item,index){
  const inst=a.instances[item.id]?.[index];if(!inst||inst.running)return;
  const next=inst.level+1,li=levelInfo(item,next);if(!li)return;
  const duration=Math.round(li.durationSeconds*(1-a.timeReduction/100));
  inst.running={from:inst.level,to:next,start:Date.now(),end:Date.now()+duration*1000,cost:Math.round(li.cost*(1-a.costReduction/100)),resource:li.resource,imported:false};save();render();
}

function singletonCard(a,item){
  const cur=a.progress[item.id]||0,max=maxForTH(item,a.th),run=a.running[item.id];
  if(a.hideMax&&cur>=max&&!run)return'';
  const next=levelInfo(item,cur+1),isMax=max>0&&cur>=max;
  let action='';
  if(run){action=`<div class="running">🔨 ${run.from} → ${run.to} · noch <span data-end="${run.end}">${fmt((run.end-Date.now())/1000)}</span>${run.imported?' <span class="source">JSON-Timer</span>':''}</div><div class="finish">Fertig ${dateFmt(run.end)}</div>`}
  else if(!isMax&&next){const t=Math.round(next.durationSeconds*(1-a.timeReduction/100)),c=Math.round(next.cost*(1-a.costReduction/100));action=`<div class="meta">Nächstes: Lv. ${cur+1} · ${c.toLocaleString('de-DE')} ${esc(next.resource)} · ${fmt(t)}</div><div class="row"><button class="small upSingle" data-id="${esc(item.id)}">Upgrade starten</button><button class="small setSingle" data-id="${esc(item.id)}">Level setzen</button></div>`}
  else{action=`<div class="done">✓ Für dieses Rathaus max</div><div class="row"><button class="small setSingle" data-id="${esc(item.id)}">Level setzen</button></div>`}
  return `<div class="card ${isMax?'maxed':''}"><h3>${esc(item.name)}</h3><div class="meta">Aktuell Lv. ${cur} · RH-Max ${max||'–'}</div>${action}</div>`;
}

function structureCard(a,item){
  const arr=a.instances[item.id]||[];if(!arr.length)return'';
  const max=maxForTH(item,a.th);
  const allMax=max>0&&arr.every(x=>x.level>=max&&!x.running);
  if(a.hideMax&&allMax)return'';
  const levelCounts=new Map();for(const x of arr)levelCounts.set(x.level,(levelCounts.get(x.level)||0)+1);
  const distribution=[...levelCounts.entries()].sort((x,y)=>x[0]-y[0]).map(([l,c])=>`Lv. ${l} ×${c}`).join(' · ');
  const runningCount=arr.filter(x=>x.running).length;
  if(item.category==='walls'){
    const candidate=arr.map((x,i)=>({x,i})).filter(o=>!o.x.running&&o.x.level<max).sort((a,b)=>a.x.level-b.x.level)[0];
    let wallAction='';
    if(candidate){const li=levelInfo(item,candidate.x.level+1);const c=li?Math.round(li.cost*(1-a.costReduction/100)):0;wallAction=`<div class="meta">Nächste Wand: Lv. ${candidate.x.level} → ${candidate.x.level+1}${li?` · ${c.toLocaleString('de-DE')} ${esc(li.resource)}`:''}</div><button class="small upInst" data-id="${esc(item.id)}" data-index="${candidate.i}">Eine Wand upgraden</button>`}
    return `<div class="card ${allMax?'maxed':''}"><h3>${esc(item.name)} <span class="count">${arr.length}</span></h3><div class="meta">${distribution}</div>${wallAction||'<div class="done">✓ Für dieses Rathaus max</div>'}</div>`;
  }
  const rows=arr.map((inst,i)=>{
    const isMax=max>0&&inst.level>=max;
    if(inst.running)return `<div class="instance"><span>#${i+1} · Lv. ${inst.level} → ${inst.running.to}</span><span class="running">🔨 <span data-end="${inst.running.end}">${fmt((inst.running.end-Date.now())/1000)}</span></span></div>`;
    const li=!isMax?levelInfo(item,inst.level+1):null;
    return `<div class="instance"><span>#${i+1} · Lv. ${inst.level}${isMax?' ✓':''}</span>${li?`<button class="mini upInst" data-id="${esc(item.id)}" data-index="${i}">→ ${inst.level+1}</button>`:''}</div>`
  }).join('');
  return `<div class="card ${allMax?'maxed':''}"><h3>${esc(item.name)} <span class="count">${arr.length}</span></h3><div class="meta">${distribution}${runningCount?` · 🔨 ${runningCount}`:''} · RH-Max ${max||'–'}</div><div class="instances">${rows}</div></div>`;
}

function jobSlot(title,icon,job,slotClass='',available=true){
  if(!available)return `<div class="workSlot unavailable ${slotClass}"><div class="workIcon">${icon}</div><div class="workBody"><span class="workTitle">${esc(title)}</span><b>Nicht vorhanden</b><small>Für dieses Dorf noch nicht erkannt</small></div></div>`;
  if(!job)return `<div class="workSlot free ${slotClass}"><div class="workIcon">${icon}</div><div class="workBody"><span class="workTitle">${esc(title)}</span><b>Frei</b><small>Bereit für das nächste Upgrade</small></div><span class="statusDot">●</span></div>`;
  return `<div class="workSlot busy ${slotClass}"><div class="workIcon">${icon}</div><div class="workBody"><span class="workTitle">${esc(title)}</span><b>${esc(job.label)}</b><small>${esc(job.detail)} · noch <span data-end="${job.end}">${runRemaining(job)}</span></small></div><span class="workEta">${dateFmt(job.end)}</span></div>`;
}

function workOverview(a){
  const w=accountWorkStatus(a);
  const inferred=Math.max(w.builderCount,w.builderJobs.length);
  const builderTotal=inferred||0;
  const builderSlots=[];
  for(let i=0;i<builderTotal;i++)builderSlots.push(jobSlot(`Bauarbeiter ${i+1}`,'🔨',w.builderJobs[i]));
  const extras=w.builderJobs.slice(builderTotal);
  const lab=w.labJobs[0];
  const pet=w.petJobs[0];
  const freeBuilders=Math.max(0,builderTotal-w.builderJobs.length);
  return `<section class="workOverview">
    <div class="workOverviewHead"><div><h2>Upgrade-Status</h2><p>Auf einen Blick siehst du, was gerade arbeitet und was frei ist.</p></div><div class="builderPill ${freeBuilders?'hasFree':''}">${builderTotal?`${freeBuilders}/${builderTotal} Bauarbeiter frei`:'Keine Bauarbeiter erkannt'}</div></div>
    <div class="workGrid builders">${builderSlots.join('')||'<div class="workSlot muted"><div class="workIcon">🔨</div><div class="workBody"><b>Keine Builder’s Huts erkannt</b><small>Importiere einen aktuellen Village-JSON-Export.</small></div></div>'}</div>
    <div class="serviceGrid">${jobSlot('Labor','🧪',lab,'service',w.labAvailable)}${jobSlot('Haustierhaus','🐾',pet,'service',w.petAvailable)}</div>
    ${w.labJobs.length>1||w.petJobs.length>1||extras.length?`<div class="statusWarning">Hinweis: Es wurden mehr gleichzeitige Jobs erkannt als reguläre Slots vorhanden sind (${extras.length?'Bauarbeiter ':''}${w.labJobs.length>1?'Labor ':''}${w.petJobs.length>1?'Haustiere':''}). Prüfe bei Bedarf manuell gestartete Tracker-Upgrades.</div>`:''}
  </section>`;
}

function dashboard(a){
  const runs=Object.values(a.running).filter(Boolean).length+Object.values(a.instances).flat().filter(x=>x.running).length;
  const importText=a.lastImport?`Letzter JSON-Stand: ${dateFmt(a.lastImport)}`:'Noch kein Village JSON importiert';
  const unknown=a.importUnknown?.length||0;
  return `${workOverview(a)}<div class="summary"><div><b>RH ${a.th}</b><span>${esc(a.tag||'kein Spieler-Tag')}</span></div><div><b>${runs}</b><span>laufende Upgrades</span></div><div><b>${Object.values(a.instances).reduce((n,x)=>n+x.length,0)}</b><span>importierte Objekte</span></div><div><b>${unknown}</b><span>unbekannte Export-Einträge</span></div></div><div class="importNote">${importText}${a.lastImport?' · Importierte Timer werden unverändert aus dem Spiel übernommen.':''}</div>`;
}

function renderContent(){
  const a=active(),c=$('#content');
  if(!a){c.innerHTML=`<div class="welcome"><h2>Village JSON importieren</h2><p>Erstelle deinen ersten Account direkt aus dem Datenexport von Clash of Clans. Gebäude, Fallen, Mauern, Helden, Truppen, Zauber, Haustiere und laufende Timer werden übernommen.</p><button class="primary" id="firstImport">Village JSON einfügen</button><button class="small" id="blankAccount">Leeren Account erstellen</button></div>`;$('#firstImport').onclick=()=>openImport('new');$('#blankAccount').onclick=()=>{const x=newAccount();state.accounts.push(x);state.active=x.id;save();render()};return}
  ensureProgress(a);
  const filtered=data.items.filter(i=>i.category===tab);
  c.innerHTML=`<div class="top accountHead"><div class="accountTitle"><span class="eyebrow">AKTIVER ACCOUNT</span><span class="name">${esc(a.name)}</span><span class="accountTag">RH ${a.th}${a.tag?` · ${esc(a.tag)}`:''}</span></div><div class="accountActions"><button class="small" id="rename">Umbenennen</button><button class="primary compact" id="jsonImport">↻ Village JSON aktualisieren</button><button class="small danger" id="delete">Löschen</button></div></div>
  ${dashboard(a)}
  <div class="sectionLabel">Account-Einstellungen</div><div class="settings"><label><span>Rathaus</span> <select id="th">${Array.from({length:18},(_,i)=>`<option ${a.th===i+1?'selected':''}>${i+1}</option>`).join('')}</select></label><label><span>Kosten ↓</span> <select id="costR">${[0,5,10,15,20,25,30,35,40,45,50].map(x=>`<option ${a.costReduction===x?'selected':''}>${x}%</option>`).join('')}</select></label><label><span>Bauzeit ↓</span> <select id="timeR">${[0,5,10,15,20,25,30,35,40,45,50].map(x=>`<option ${a.timeReduction===x?'selected':''}>${x}%</option>`).join('')}</select></label><label class="toggleLabel"><input type="checkbox" id="hideMax" ${a.hideMax?'checked':''}><span>RH-Max ausblenden</span></label></div>
  <div class="sectionLabel">Dorf & Armee</div><div class="tabs">${cats.map(x=>`<button class="tab ${tab===x?'active':''}" data-tab="${x}">${labels[x]}</button>`).join('')}</div>
  <div class="grid">${filtered.map(i=>['buildings','traps','walls'].includes(i.category)?structureCard(a,i):singletonCard(a,i)).join('')||'<div class="empty">Keine importierten Daten in dieser Kategorie.</div>'}</div>`;

  $('#rename').onclick=()=>{const n=prompt('Accountname:',a.name);if(n?.trim()){a.name=n.trim();save();render()}};
  $('#jsonImport').onclick=()=>openImport('update');
  $('#delete').onclick=()=>{if(confirm(`${a.name} wirklich löschen?`)){state.accounts=state.accounts.filter(x=>x.id!==a.id);state.active=state.accounts[0]?.id||null;save();render()}};
  $('#th').onchange=e=>{a.th=+e.target.value;save();render()};
  $('#costR').onchange=e=>{a.costReduction=parseInt(e.target.value);save();render()};
  $('#timeR').onchange=e=>{a.timeReduction=parseInt(e.target.value);save();render()};
  $('#hideMax').onchange=e=>{a.hideMax=e.target.checked;save();render()};
  c.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderContent()});
  c.querySelectorAll('.upSingle').forEach(b=>b.onclick=()=>startSingletonUpgrade(a,data.items.find(i=>i.id===b.dataset.id)));
  c.querySelectorAll('.upInst').forEach(b=>b.onclick=()=>startInstanceUpgrade(a,data.items.find(i=>i.id===b.dataset.id),+b.dataset.index));
  c.querySelectorAll('.setSingle').forEach(b=>b.onclick=()=>{const i=data.items.find(x=>x.id===b.dataset.id),v=prompt(`${i.name}: aktuelles Level`,a.progress[i.id]||0);if(v!==null){a.progress[i.id]=Math.max(0,parseInt(v)||0);delete a.running[i.id];save();render()}});
}

function render(){finishExpired();renderAccounts();renderContent()}

$('#addAccount').onclick=()=>openImport('new');
$('#pasteClipboard').onclick=pasteClipboard;
$('#doImport').onclick=applyImport;

try{
  $('#content').innerHTML='<div class="empty"><b>Clash-Daten werden geladen …</b><br><span class="meta">Beim ersten Aufruf kann das kurz dauern.</span></div>';
  const [loadedData,mr]=await Promise.all([loadUpgradeData(),fetch('./export-map.json')]);
  if(!mr.ok)throw new Error('export-map.json konnte nicht geladen werden.');
  data=loadedData;exportMap=await mr.json();
  for(const a of state.accounts)ensureProgress(a);
  render();
  setInterval(()=>{finishExpired();document.querySelectorAll('[data-end]').forEach(x=>x.textContent=fmt((+x.dataset.end-Date.now())/1000))},1000);
}catch(e){$('#content').innerHTML=`<div class="empty"><b>Clash-Daten konnten nicht geladen werden.</b><br>${esc(e.message)}<br><br>Prüfe deine Internetverbindung und lade die Seite neu.</div>`}

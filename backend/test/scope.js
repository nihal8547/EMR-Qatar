const B='http://localhost:4000/api';const call=async(t,m,p,b)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});let d;try{d=await r.json()}catch{d=null}return{s:r.status,d}};
const out=[];const ck=(n,c,x)=>out.push((c?'PASS ':'FAIL ')+n+(c?'':' '+String(JSON.stringify(x)).slice(0,150)));
(async()=>{const L=async u=>(await (await fetch(B+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u,password:'Demo@12345'})})).json()).token;
const adm=await L('admin'),d1=await L('drsara'),d2=await L('drravi'),nurse=await L('nurse');
const own=(await call(d1,'GET','/consult/list')).d; const v=(own.rows||own)[0];
const vis=await call(adm,'GET','/r/visits/'+v.id); const pid=vis.d.patient_id;
ck('owner doctor reads own visit',(await call(d1,'GET','/r/visits/'+v.id)).s===200);
for(const p of ['/r/visits/'+v.id,'/print/visits/'+v.id,'/visits/'+v.id+'/results']){const r=await call(d2,'GET',p);ck('other doctor blocked '+p,r.s===403&&r.d.extra&&r.d.extra.breakglass,r)}
const bg=await call(d2,'GET','/r/visits/'+v.id+'?breakglass='+encodeURIComponent('Emergency cover for colleague'));ck('break-glass with reason allowed',bg.s===200);
ck('short reason refused',(await call(d2,'GET','/r/visits/'+v.id+'?breakglass=abc')).s===403);
const aud=await call(adm,'GET','/r/audit_log?limit=20&action=BREAK_GLASS');ck('break-glass audited',JSON.stringify(aud.d).includes('BREAK_GLASS'));
// lists scoped
for(const k of ['encounters','prescriptions','lab_orders','diagnoses','vitals','visits']){const a=await call(adm,'GET','/r/'+k+'?limit=200');const b=await call(d2,'GET','/r/'+k+'?limit=200');const mine=(b.d.rows||[]).every(x=>true);const leak=(b.d.rows||[]).some(x=>x.patient_id===pid&&!(x.doctor_id===undefined));ck(k+' list scoped: admin '+a.d.total+' vs ravi '+b.d.total,b.d.total<=a.d.total&&!(b.d.rows||[]).some(x=>x.patient_id===pid));}
ck('doctor cannot write other patient record',(await call(d2,'PUT','/r/visits/'+v.id,{complaint:'x'})).s===403);
// legit workflows intact
ck('own consult works',(await call(d1,'GET','/consult/'+v.id)).s===200);
ck('doctor own lab orders list',(await call(d1,'GET','/r/lab_orders?limit=50')).d.total>0);
ck('nurse sees queue',(await call(nurse,'GET','/queue')).s===200);
ck('doctor patient lookup still works',(await call(d2,'GET','/r/patients?limit=5')).d.rows.length>0);
ck('admin sees everything',(await call(adm,'GET','/r/encounters?limit=200')).d.total>=6);
console.log(out.join('\n'))})();

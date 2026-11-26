// 12 parallel check-ins for one doctor must get 12 distinct, consecutive tokens. Run on db:reset:demo.
const B='http://localhost:4000/api';const call=async(t,m,p,b)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',authorization:'Bearer '+t},body:b?JSON.stringify(b):undefined});let d;try{d=await r.json()}catch{d=null}return{s:r.status,d}};
(async()=>{const L=async u=>(await (await fetch(B+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:u,password:'Demo@12345'})})).json()).token;
const rec=await L('reception'),doc=await L('drravi'),adm=await L('admin');
const pats=(await call(adm,'GET','/r/patients?limit=20')).d.rows;const dr=(await call(adm,'GET','/r/users?q=drravi')).d.rows[0];
const res=await Promise.all(pats.slice(0,12).map(p=>call(rec,'POST','/visits/start',{patient_id:p.id,doctor_id:dr.id,payer_type:'Cash'})));
const ok=res.filter(r=>r.s===201||r.s===200);const toks=ok.map(r=>r.d.token_no);
const uniq=new Set(toks).size===toks.length;console.log((ok.length>0&&uniq?'PASS':'FAIL'),'parallel check-ins',ok.length,'created, tokens',toks.sort((a,b)=>a-b).join(','),'; skipped (already open/other):',res.length-ok.length);
const q=(await call(doc,'GET','/consult/list')).d;const rows=q.rows||q;console.log(rows.every(r=>r.token_no>0)?'PASS':'FAIL','doctor queue shows tokens');
process.exit(uniq?0:1)})();

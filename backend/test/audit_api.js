const B='http://localhost:4000/api';
const call=async(t,m,p)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json',...(t?{authorization:'Bearer '+t}:{})}});let d;const x=await r.text();try{d=JSON.parse(x)}catch{d=x}return{s:r.status,d,x}};
(async()=>{

const lg=await fetch(B+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'Demo@12345'})});const tok=(await lg.json()).token;
const meta=(await call(tok,'GET','/meta')).d; const res=meta.resources||meta.registry||meta;
const keys=Object.keys(res.resources||res);
console.log('resources',keys.length);
const bad=[];let n=0;
for(const k of keys){const r=(res.resources||res)[k];
  const base=`/r/${k}`;
  const a=await call(tok,'GET',`${base}?limit=5`); n++;
  if(a.s!==200){bad.push([k,'list',a.s,String(a.x).slice(0,120)]);continue}
  const rows=a.d.rows||[];
  // search
  for(const q of ["a","'","%","_","\\","x y",";--","é"]){const s=await call(tok,'GET',`${base}?q=${encodeURIComponent(q)}&limit=5`);n++;if(s.s!==200)bad.push([k,'q='+q,s.s,String(s.x).slice(0,120)])}
  // sort by every field
  const fields=(r.fields||[]).map(f=>f.name||f.key).filter(Boolean);
  for(const f of fields.slice(0,40)){const s=await call(tok,'GET',`${base}?sort=${f}&dir=desc&limit=3`);n++;if(s.s!==200)bad.push([k,'sort='+f,s.s,String(s.x).slice(0,120)])}
  // filters by each field with a sample value
  if(rows[0]) for(const f of fields.slice(0,40)){const v=rows[0][f];if(v===null||v===undefined||typeof v==='object')continue;const s=await call(tok,'GET',`${base}?${encodeURIComponent(f)}=${encodeURIComponent(v)}&limit=3`);n++;if(s.s!==200)bad.push([k,'filter '+f,s.s,String(s.x).slice(0,120)])}
  // bad params
  for(const qs of ['page=0','page=-3','page=abc','limit=0','limit=99999','sort=nonexistent;drop','dir=sideways','sort=%00']){const s=await call(tok,'GET',`${base}?${qs}`);n++;if(s.s>=500)bad.push([k,qs,s.s,String(s.x).slice(0,120)])}
  const c=await call(tok,'GET',`${base}?format=csv&limit=5`);n++;if(c.s!==200)bad.push([k,'csv',c.s,String(c.x).slice(0,120)]);
}
console.log('requests',n,'problems',bad.length);for(const b of bad.slice(0,60))console.log(b.join(' | '));
})();

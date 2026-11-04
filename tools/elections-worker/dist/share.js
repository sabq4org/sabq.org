const LOGO=new Image();LOGO.src="/sabq-logo-full-white.svg";
let SH={t:null,id:null,sz:"1200x675",blob:null,url:null};
function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
function txt(c,s,x,y,size,col="#fff",wt=700,align="right"){c.font=`${wt} ${size}px Tajawal`;c.fillStyle=col;c.textAlign=align;c.fillText(s,x,y);}
function fit(c,s,max,size,wt=700){c.font=`${wt} ${size}px Tajawal`;while(c.measureText(s).width>max&&s.length>3)s=s.slice(0,-2);return s;}
function pbar(c,x,y,w,h,parts){c.fillStyle="#334155";rr(c,x,y,w,h,h/2);let cx=x+w;c.save();c.beginPath();c.roundRect(x,y,w,h,h/2);c.clip();
 for(const [v,col] of parts){const pw=w*v;c.fillStyle=col;c.fillRect(cx-pw,y,pw,h);cx-=pw;}c.restore();}
function raceBlock(c,r,X,Y,W,s){const R=X+W;txt(c,fit(c,label(r),W*.62,30*s),R,Y,30*s);
 const st=r.winner?`فوز ${PN[r.winner]}${r.flip?" · تحوّل":""}`:(r.status==="too_early"||!r.votes?"مبكر جداً":"قيد الفرز");txt(c,st,X,Y,22*s,r.winner?COL[r.winner]:"#cbd5e1",700,"left");
 let y=Y+16*s;for(const k of r.c.slice(0,r._n||3)){y+=40*s;txt(c,fit(c,(k.w?"✔ ":"")+(k.n||"—")+` (${PN[k.p]})`,W*.6,24*s),R,y,24*s,"#fff",k.w?800:500);
  txt(c,`${k.pct}%  ·  ${nf.format(k.v)}`,X,y,24*s,"#e2e8f0",700,"left");pbar(c,X,y+9*s,W,8*s,[[k.pct/100,COL[k.p]]]);}
 txt(c,`الفرز المتوقع ${r.eevp!=null?Math.round(r.eevp)+"%":"—"}${r.calledAt?` · أُعلن ${tf.format(new Date(r.calledAt))} بتوقيت الرياض (${r.calledBy.map(x=>SRC[x]||x).join("، ")})`:""}`,R,y+40*s,18*s,"#94a3b8",500);return y+52*s;}
async function renderCard(t,id,sz){const [W,H]=sz.split("x").map(Number);const cv=document.createElement("canvas");cv.width=W;cv.height=H;const c=cv.getContext("2d");c.direction="rtl";
 await document.fonts.load("800 40px Tajawal");await document.fonts.load("500 20px Tajawal");if(!LOGO.complete)await new Promise(r=>LOGO.onload=LOGO.onerror=r);
 const s=W/1200,P=56*s;c.fillStyle="#0f172a";c.fillRect(0,0,W,H);c.fillStyle="#4cbcfd";c.fillRect(0,0,W,10*s);
 const lh=78*s,lw=LOGO.naturalWidth?lh*LOGO.naturalWidth/LOGO.naturalHeight:150*s;try{c.drawImage(LOGO,P,24*s,lw,lh);}catch{}
 txt(c,"الانتخابات النصفية الأمريكية 2026",W-P,72*s,34*s,"#fff",800);
 let y=150*s;const X=P,CW=W-2*P;
 if(t==="balance"){txt(c,"ميزان القوى",W-P,y,44*s,"#4cbcfd",800);y+=30*s;
  const rows=[["senate","مجلس الشيوخ"],["house","مجلس النواب"],["governor","حكام الولايات"]];const gap=H>W?250*s:70*s;
  for(const [o,n] of rows){const b=DATA.offices[o]?.balance,rs=races(o);let D,R,T;
   if(o==="governor"){D=rs.filter(r=>r.winner==="D").length;R=rs.filter(r=>r.winner==="R").length;T=rs.length;}else{D=b.D.seats;R=b.R.seats;T=b.total;}
   y+=gap*.5;txt(c,n,W-P,y,30*s);txt(c,o==="governor"?`حُسم ${D+R} من ${T}`:`الأغلبية ${o==="senate"?51:218}`,X,y,22*s,"#94a3b8",500,"left");
   y+=56*s;txt(c,String(D),W-P,y,52*s,"#5aa2ff",800);txt(c,String(R),X,y,52*s,"#ff6b7d",800,"left");txt(c,"ديمقراطيون",W-P-90*s,y-6*s,22*s,"#cbd5e1",500);txt(c,"جمهوريون",X+90*s,y-6*s,22*s,"#cbd5e1",500,"left");
   y+=20*s;pbar(c,X,y,CW,20*s,[[D/T,COL.D]]);c.save();c.beginPath();c.roundRect(X,y,CW,20*s,10*s);c.clip();c.fillStyle=COL.R;c.fillRect(X,y,CW*R/T,20*s);c.restore();
   if(o!=="governor"){c.fillStyle="#fff";c.fillRect(X+CW/2-1.5*s,y-6*s,3*s,32*s);}y+=gap*.3;}}
 else if(t==="state"){txt(c,AR[id]||id,W-P,y,48*s,"#4cbcfd",800);y+=20*s;
  const rs=["senate","governor"].flatMap(o=>races(o).filter(r=>r.st===id));const hs=races("house").filter(r=>r.st===id);
  if(hs.length){const w=k=>hs.filter(r=>r.winner===k).length,l=k=>hs.filter(r=>!r.winner&&lead(r)===k).length;y+=46*s;
   txt(c,`مجلس النواب (${hs.length} دوائر): فاز د ${w("D")} · ج ${w("R")} — متقدّم د ${l("D")} · ج ${l("R")}`,W-P,y,24*s,"#e2e8f0",700);}
  const max=H>W?4:2;for(const r of rs.slice(0,max)){y+=60*s;txt(c,ON[r.o],W-P,y-26*s,18*s,"#4cbcfd",700);r._n=2;y=raceBlock(c,r,X,y+8*s,CW,s);delete r._n;}
  if(!rs.length&&!hs.length){y+=60*s;txt(c,"لا سباقات في هذه الولاية",W-P,y,28*s,"#cbd5e1");}}
 else{const r=["senate","house","governor"].flatMap(races).find(x=>x.id===id);if(r){txt(c,ON[r.o],W-P,y,30*s,"#4cbcfd",800);r._n=H>W?6:Math.min(4,Math.floor((H-260*s)/(48*s))-1);y=raceBlock(c,r,X,y+60*s,CW,s*(H>W?1.1:1));delete r._n;}}
 c.fillStyle="#1e293b";c.fillRect(0,H-64*s,W,64*s);
 txt(c,(DATA.demo?"⚠ بيانات تجريبية — ليست نتائج حقيقية":"المصدر: أسوشيتد برس (AP)"),W-P,H-24*s,20*s,DATA.demo?"#ff8a8a":"#cbd5e1",500);
 txt(c,"sabq.org · "+dtf.format(new Date(DATA.fetchedAt))+" الرياض",X,H-24*s,20*s,"#94a3b8",500,"left");
 return new Promise(r=>cv.toBlob(r,"image/png"));}
async function openShare(t,id){SH={...SH,t,id};document.getElementById("shm").hidden=false;await paintShare();}
async function paintShare(){if(!DATA)return;SH.blob=await renderCard(SH.t,SH.id,SH.sz);if(SH.url)URL.revokeObjectURL(SH.url);SH.url=URL.createObjectURL(SH.blob);document.getElementById("shimg").src=SH.url;document.getElementById("shmsg").textContent="";}
const fname=()=>`sabq-midterms-${SH.t}${SH.id?"-"+SH.id:""}-${SH.sz}.png`;
document.getElementById("shx").onclick=()=>document.getElementById("shm").hidden=true;
document.querySelectorAll("[data-sz]").forEach(b=>b.onclick=()=>{SH.sz=b.dataset.sz;document.querySelectorAll("[data-sz]").forEach(x=>x.classList.toggle("on",x===b));paintShare();});
document.getElementById("shdl").onclick=()=>{const a=document.createElement("a");a.href=SH.url;a.download=fname();a.click();};
document.getElementById("shcp").onclick=async()=>{const u=SH.t==="balance"?location.origin+"/":linkFor(SH.t,SH.id);try{await navigator.clipboard.writeText(u);document.getElementById("shmsg").textContent="نُسخ الرابط: "+u;}catch{prompt("الرابط:",u);}};
document.getElementById("shsh").onclick=async()=>{const u=SH.t==="balance"?location.origin+"/":linkFor(SH.t,SH.id);const f=new File([SH.blob],fname(),{type:"image/png"});
 try{if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:"نتائج الانتخابات النصفية — سبق",url:u});else if(navigator.share)await navigator.share({title:"نتائج الانتخابات النصفية — سبق",url:u});else document.getElementById("shcp").click();}catch(e){}};

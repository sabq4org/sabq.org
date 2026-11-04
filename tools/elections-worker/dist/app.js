const AR={AL:"ألاباما",AK:"ألاسكا",AZ:"أريزونا",AR:"أركنساس",CA:"كاليفورنيا",CO:"كولورادو",CT:"كونيتيكت",DE:"ديلاوير",FL:"فلوريدا",GA:"جورجيا",HI:"هاواي",ID:"أيداهو",IL:"إلينوي",IN:"إنديانا",IA:"آيوا",KS:"كانساس",KY:"كنتاكي",LA:"لويزيانا",ME:"مين",MD:"ماريلاند",MA:"ماساتشوستس",MI:"ميشيغان",MN:"مينيسوتا",MS:"ميسيسيبي",MO:"ميزوري",MT:"مونتانا",NE:"نبراسكا",NV:"نيفادا",NH:"نيوهامبشر",NJ:"نيوجيرسي",NM:"نيومكسيكو",NY:"نيويورك",NC:"كارولاينا الشمالية",ND:"داكوتا الشمالية",OH:"أوهايو",OK:"أوكلاهوما",OR:"أوريغون",PA:"بنسلفانيا",RI:"رود آيلاند",SC:"كارولاينا الجنوبية",SD:"داكوتا الجنوبية",TN:"تينيسي",TX:"تكساس",UT:"يوتا",VT:"فيرمونت",VA:"فرجينيا",WA:"واشنطن",WV:"فرجينيا الغربية",WI:"ويسكونسن",WY:"وايومنغ",DC:"واشنطن العاصمة"};
const NAME2ST={"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC"};
const PN={D:"ديمقراطي",R:"جمهوري",I:"مستقل/آخر"},ON={senate:"مجلس الشيوخ",house:"مجلس النواب",governor:"حاكم الولاية"};
const SRC={ap:"أسوشيتد برس",nyt:"نيويورك تايمز"};
const nf=new Intl.NumberFormat("ar-SA-u-nu-latn");
const tf=new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory",{timeZone:"Asia/Riyadh",hour:"2-digit",minute:"2-digit",hour12:false});
const dtf=new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory",{timeZone:"Asia/Riyadh",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
const KEY={senate:["GA","MI","NC","ME","OH","TX","IA","NH","AK","MN","NE","FL"],governor:["AZ","GA","MI","WI","PA","NV","KS","NY"]};
let DATA=null,OFF="senate",SEL=null,REFRESH=300,left=REFRESH,states,path=d3.geoPath();
const COL={D:"#1f6fd1",R:"#d7263d",I:"#8a6bbf",Dl:"#a9c9f2",Rl:"#f2a9b1",Il:"#cdbfe6",none:"#e5e9ef",noel:"#f5f6f8"};
const races=o=>DATA?.offices?.[o]?.races||[];
const lead=r=>r.c[0]&&r.c[0].v>0?r.c[0].p:null;
const label=r=>r.o==="house"?`${AR[r.st]||r.sn} — ${r.dist?("الدائرة "+r.dist):"دائرة عامة"}`:(AR[r.st]||r.sn)+(r.o==="senate"&&races("senate").filter(x=>x.st===r.st).length>1?" (انتخاب خاص)":"");
function statusTag(r){if(r.winner)return`<span class="tag ${r.winner}">فوز ${PN[r.winner]}</span>`+(r.flip?`<span class="tag flip">تحوّل</span>`:"");
 if(r.status==="too_early"||!r.votes)return`<span class="tag">مبكر جداً</span>`;return`<span class="tag">قيد الفرز</span>`;}
function raceCard(r){const top=r.c.slice(0,r.o==="house"?3:4);
 return`<div class="race${r.id===SELRACE?" hl":""}" id="r-${r.id}"><h4><span>${label(r)}</span><span>${statusTag(r)} <button class="sh" data-share="race" data-id="${r.id}" title="مشاركة">⤴</button></span></h4>${top.map(c=>`<div class="cand"><span class="nm"><i class="dot ${c.p}"></i><span class="${c.w?"w":""}">${c.n||"—"}${c.inc?" <small>(شاغل المقعد)</small>":""}</span></span><span class="v">${nf.format(c.v)}</span><span class="pct">${c.pct}%</span><div class="pb"><span style="width:${c.pct}%;background:${COL[c.p]}"></span></div></div>`).join("")}
 <div class="meta">الفرز المتوقع: ${r.eevp!=null?Math.round(r.eevp)+"%":"—"} · إجمالي الأصوات ${nf.format(r.votes)}${r.calledAt?` · أُعلن ${tf.format(new Date(r.calledAt))} (${r.calledBy.map(s=>SRC[s]||s).join("، ")})`:""}${r.upd?` · آخر تحديث ${tf.format(new Date(r.upd))}`:""}</div></div>`;}
function balance(){const el=d3.select("#bal");el.html("");
 for(const [o,t] of [["senate","مجلس الشيوخ"],["house","مجلس النواب"],["governor","حكام الولايات"]]){
  const b=DATA.offices[o]?.balance;const rs=races(o);
  const ld={D:0,R:0,I:0};rs.forEach(r=>{if(!r.winner){const l=lead(r);if(l)ld[l]++;}});
  let D,R,I,total,need,sub;
  if(o==="governor"){const hold=b?{D:b.D.noElection,R:b.R.noElection}:{D:0,R:0};D=rs.filter(r=>r.winner==="D").length;R=rs.filter(r=>r.winner==="R").length;I=rs.filter(r=>r.winner==="I").length;total=rs.length||36;need=null;sub=`فائزون من ${rs.length} سباقاً هذا العام`;}
  else{D=b.D.seats;R=b.R.seats;I=b.I.seats;total=b.total;need=b.toWin;sub=`الأغلبية: ${o==="senate"?"51 (أو 50 + نائب الرئيس)":"218"}`;}
  const w=x=>(100*x/total)+"%";
  el.append("div").attr("class","card bb").html(`<h3><span>${t} <button class="sh" data-share="balance">⤴</button></span><small>${sub}</small></h3>
  <div class="nums"><span class="D">${D}</span><span class="R">${R}</span></div>
  <div class="bar"><span class="D" style="width:${w(D)}"></span><span class="Dl" style="width:${w(ld.D)}"></span><span class="I" style="width:${w(I)}"></span><span style="flex:1"></span><span class="Rl" style="width:${w(ld.R)}"></span><span class="R" style="width:${w(R)}"></span>${o!=="governor"?'<i class="mid"></i>':""}</div>
  <small>ديمقراطيون ${D} مقعداً + ${ld.D} متقدّم · جمهوريون ${R} + ${ld.R} متقدّم${I?` · مستقلون ${I}`:""}</small>
  <small>${o!=="governor"?`يحتاج الديمقراطيون ${Math.max(0,need.D-D)} والجمهوريون ${Math.max(0,need.R-R)} للأغلبية · `:""}لم يُحسم ${rs.filter(r=>!r.winner).length} من ${rs.length}</small>`);}}
function stateFill(st){const rs=races(OFF).filter(r=>r.st===st);if(!rs.length)return COL.noel;
 if(OFF==="house"){const w={D:0,R:0,I:0};rs.forEach(r=>{const p=r.winner||lead(r);if(p)w[p]+=r.winner?1:.5});const t=w.D+w.R+w.I;if(!t)return COL.none;return d3.interpolateRgb(COL.R,COL.D)(w.D/(w.D+w.R||1));}
 const r=rs[0];if(r.winner)return COL[r.winner];const l=lead(r);return l?COL[l+"l"]:COL.none;}
const FIPS={"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","11":"DC","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};
let CDS=null,HMODE="district",SELRACE=null,ZT=d3.zoomIdentity;const proj=d3.geoAlbersUsa().scale(1300).translate([487.5,305]),cpath=d3.geoPath(proj);
const cdRace=f=>{const st=FIPS[f.properties.STATEFP],n=+f.properties.CD119FP;return races("house").find(r=>r.st===st&&(r.dist===n||(n===0||n===98)&&(!r.dist)))};
const raceFill=r=>{if(!r)return COL.none;if(r.winner)return COL[r.winner];const l=lead(r);return l?COL[l+"l"]:COL.none};
const zoom=d3.zoom().scaleExtent([1,12]).on("zoom",e=>{ZT=e.transform;d3.select("#zg").attr("transform",ZT);d3.selectAll("#zg path").attr("stroke-width",1/ZT.k)});
function zoomTo(st){const svg=d3.select("#map");const f=st&&(HMODE==="district"&&OFF==="house"?CDS.filter(c=>FIPS[c.properties.STATEFP]===st):[]);
 if(!f||!f.length){svg.transition().duration(600).call(zoom.transform,d3.zoomIdentity);return;}
 const [[x0,y0],[x1,y1]]=cpath.bounds({type:"FeatureCollection",features:f});const k=Math.min(12,.85/Math.max((x1-x0)/975,(y1-y0)/610));
 svg.transition().duration(700).call(zoom.transform,d3.zoomIdentity.translate(487.5,305).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2));}
function drawMap(){const svg=d3.select("#map");if(!svg.select("#zg").size()){svg.append("g").attr("id","zg");svg.call(zoom);}const zg=d3.select("#zg");
 const dm=OFF==="house"&&HMODE==="district"&&CDS;document.getElementById("hmode").style.display=OFF==="house"?"flex":"none";
 zg.selectAll("path.cd").data(dm?CDS:[]).join("path").attr("class","cd").attr("d",cpath).attr("fill",f=>raceFill(cdRace(f))).classed("sel",f=>{const r=cdRace(f);return r&&r.id===SELRACE})
 .on("click",(e,f)=>{const r=cdRace(f);const st=FIPS[f.properties.STATEFP];if(SEL!==st){SEL=st;zoomTo(st);}SELRACE=r?r.id:null;drawMap();drawPanel();link();})
 .selectAll("title").data(f=>[f]).join("title").text(f=>{const r=cdRace(f);return r?label(r):AR[FIPS[f.properties.STATEFP]]});
 zg.selectAll("path.stb").data(dm?states:[]).join("path").attr("class","stb").attr("d",path).attr("fill","none").attr("pointer-events","none").attr("stroke","#0f172a").attr("stroke-width",1.2/ZT.k);
 zg.selectAll("path.st").data(dm?[]:states).join("path").attr("class","st").attr("d",path)
 .attr("fill",d=>stateFill(NAME2ST[d.properties.name])).classed("sel",d=>NAME2ST[d.properties.name]===SEL)
 .on("click",(e,d)=>{SEL=NAME2ST[d.properties.name];SELRACE=null;drawMap();drawPanel();link();if(innerWidth<900)document.getElementById("panel").scrollIntoView({behavior:"smooth"});})
 .selectAll("title").data(d=>[d]).join("title").text(d=>AR[NAME2ST[d.properties.name]]||d.properties.name);
 d3.select("#legend").html(OFF==="house"&&!dm?`<span><i style="background:${COL.D}"></i>غالبية ديمقراطية</span><span><i style="background:${COL.R}"></i>غالبية جمهورية</span><span>اللون = حصة الدوائر المحسومة/المتقدَّم فيها</span>`
 :`<span><i style="background:${COL.D}"></i>فوز ديمقراطي</span><span><i style="background:${COL.Dl}"></i>تقدّم ديمقراطي</span><span><i style="background:${COL.R}"></i>فوز جمهوري</span><span><i style="background:${COL.Rl}"></i>تقدّم جمهوري</span><span><i style="background:${COL.none}"></i>لا نتائج بعد</span><span><i style="background:${COL.noel};border:1px solid #ddd"></i>لا سباق</span>`);}
function drawPanel(){const p=document.getElementById("panel");if(!SEL){p.innerHTML='<p class="hint">اضغط على أي ولاية لعرض التفاصيل</p>';return;}
 const rs=["senate","governor","house"].flatMap(o=>races(o).filter(r=>r.st===SEL)).sort((a,b)=>(a.o!==OFF)-(b.o!==OFF));
 if(SELRACE){const i=rs.findIndex(r=>r.id===SELRACE);if(i>0)rs.unshift(rs.splice(i,1)[0]);}
 p.innerHTML=`<h2 style="margin:4px 0 8px;display:flex;justify-content:space-between;align-items:center">${AR[SEL]||SEL}<span>${OFF==="house"&&HMODE==="district"?'<button class="sh" data-reset>⤢ الخريطة كاملة</button> ':''}<button class="sh" data-share="state" data-id="${SEL}">مشاركة الولاية ⤴</button></span></h2>`+(rs.length?rs.map(r=>`<div class="meta" style="font-weight:700">${ON[r.o]}</div>`+raceCard(r)).join(""):"<p class='hint'>لا سباقات في هذه الولاية</p>");}
function pathMaj(){const out=[];for(const o of ["senate","house"]){const b=DATA.offices[o]?.balance;if(!b)continue;const rs=races(o).filter(r=>!r.winner);
 const lD=rs.filter(r=>lead(r)==="D").length,lR=rs.filter(r=>lead(r)==="R").length;const nD=Math.max(0,b.toWin.D-b.D.seats),nR=Math.max(0,b.toWin.R-b.R.seats);
 out.push(`<div class="pathrow"><span>${ON[o]} — متبقٍّ ${rs.length}</span><span><b class="D">د: يحتاج ${nD}</b> · <b class="R">ج: يحتاج ${nR}</b></span></div><div class="meta">يتقدّم الديمقراطيون في ${lD} والجمهوريون في ${lR} من السباقات غير المحسومة. ${nD>rs.length?"لم يعد بإمكان الديمقراطيين بلوغ الأغلبية.":""}${nR>rs.length?"لم يعد بإمكان الجمهوريين بلوغ الأغلبية.":""}${b.D.winner?"<b>✔ الديمقراطيون حسموا الأغلبية</b>":""}${b.R.winner?"<b>✔ الجمهوريون حسموا الأغلبية</b>":""}</div>`);}
 document.getElementById("path").innerHTML=out.join("")||"—";}
function flips(){const f=["senate","house","governor"].flatMap(o=>races(o).filter(r=>r.flip));const s=o=>DATA.offices[o]?.balance;
 const sum=["senate","house"].map(o=>s(o)?`${ON[o]}: د +${s(o).D.flips} · ج +${s(o).R.flips}`:"").join(" — ");
 document.getElementById("flips").innerHTML=`<div class="meta" style="font-size:13px">${sum}</div>`+(f.length?f.map(r=>`<div class="pathrow"><span>${ON[r.o]} — ${label(r)}</span><b class="${r.winner}">→ ${PN[r.winner]}</b></div>`).join(""):"<p class='hint'>لا مقاعد متحوّلة معلنة حتى الآن</p>");}
function keyRaces(){const k=OFF==="house"?races("house").filter(r=>/toss|lean/.test(r.rating||"")).slice(0,12):races(OFF).filter(r=>(KEY[OFF]||[]).includes(r.st)||/toss|lean/.test(r.rating||""));
 document.getElementById("key").innerHTML=k.map(raceCard).join("")||"<p class='hint'>—</p>";}
function calls(){const c=["senate","governor","house"].flatMap(o=>races(o).filter(r=>r.winner&&r.calledAt)).sort((a,b)=>b.calledAt.localeCompare(a.calledAt)).slice(0,80);
 document.getElementById("calls").innerHTML=c.map(r=>{const w=r.c.find(x=>x.w);return`<li><time>${tf.format(new Date(r.calledAt))}</time><i class="dot ${r.winner}"></i><span><b>${w?.n||""}</b> (${PN[r.winner]}) يفوز — ${ON[r.o]}، ${label(r)}${r.flip?' <span class="tag flip">تحوّل</span>':""} <small style="color:#515c67">· ${r.calledBy.map(s=>SRC[s]||s).join("، ")}</small></span></li>`}).join("")||"<li>لا إعلانات بعد</li>";}
function render(){if(!DATA)return;const demo=DATA.demo;
 const sb=document.getElementById("srcbar");sb.className="srcbar"+(demo?" demo":"");
 sb.textContent=demo?"⚠ بيانات تجريبية — مصدر البيانات الحي غير متاح حالياً، الأرقام المعروضة ليست نتائج حقيقية":"";sb.hidden=!demo;
 document.getElementById("srcf").textContent=demo?"بيانات تجريبية":"أسوشيتد برس (AP)";
 document.getElementById("updf").textContent=dtf.format(new Date(DATA.fetchedAt));document.getElementById("upd").textContent="آخر تحديث: "+dtf.format(new Date(DATA.fetchedAt));
 balance();drawMap();drawPanel();if(FIRST){FIRST=false;if(SEL)zoomTo(SEL);if(SELRACE)setTimeout(()=>document.getElementById("r-"+SELRACE)?.scrollIntoView({block:"center"}),300);}pathMaj();flips();keyRaces();calls();}
async function load(){try{let r=await fetch((window.__BASE||"")+"/api/results",{cache:"no-store"});let d=await r.json();
 if(d.demo){const s=await (await fetch((window.__BASE||"")+"/sample.json")).json();d={...s,demo:true,error:d.error};}DATA=d;render();}catch(e){console.warn("load failed",e);}left=REFRESH;}
setInterval(()=>{left--;document.getElementById("next").textContent=`التحديث التالي خلال ${Math.floor(left/60)}:${String(left%60).padStart(2,"0")} (كل 5 دقائق)`;if(left<=0)load();},1000);
document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x===b));OFF=b.dataset.o;zoomTo(null);drawMap();keyRaces();link();});
Promise.all([d3.json((window.__BASE||"")+"/vendor/states.json"),d3.json((window.__BASE||"")+"/vendor/cd119.json")]).then(([us,cd])=>{states=topojson.feature(us,us.objects.states).features;CDS=topojson.feature(cd,cd.objects.cb_2024_us_cd119_20m).features;
 const q=new URLSearchParams(location.search);if(q.get("office")&&ON[q.get("office")]){OFF=q.get("office");document.querySelectorAll("#tabs button").forEach(x=>x.classList.toggle("on",x.dataset.o===OFF));}
 if(q.get("state"))SEL=q.get("state").toUpperCase();if(q.get("race"))SELRACE=q.get("race");if(q.get("map")==="states")HMODE="state";FIRST=true;load();});
let FIRST=false;
function link(){const q=new URLSearchParams();q.set("office",OFF);if(SEL)q.set("state",SEL);if(SELRACE)q.set("race",SELRACE);if(OFF==="house"&&HMODE!=="district")q.set("map","states");history.replaceState(null,"","?"+q);}
const linkFor=(t,id)=>{const r=t==="race"&&["senate","house","governor"].flatMap(races).find(x=>x.id===id);const q=new URLSearchParams();
 if(r){q.set("office",r.o);q.set("state",r.st);q.set("race",r.id);}else if(t==="state"){q.set("office",OFF);q.set("state",id);}return location.origin+(window.__BASE||"")+"/?"+q;};
document.querySelectorAll("#hmode button").forEach(b=>b.onclick=()=>{HMODE=b.dataset.m;document.querySelectorAll("#hmode button").forEach(x=>x.classList.toggle("on",x===b));zoomTo(HMODE==="district"?SEL:null);drawMap();link();});
document.addEventListener("click",e=>{const b=e.target.closest("[data-share]");if(b){e.preventDefault();openShare(b.dataset.share,b.dataset.id);}
 if(e.target.closest("[data-reset]")){SEL=null;SELRACE=null;zoomTo(null);drawMap();drawPanel();link();}});

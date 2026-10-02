const $=id=>document.getElementById(id),cv=$('cv'),ctx=cv.getContext('2d');
const L=1,HX=.6,X0=60,PX=780,BY=196,T=22,GY=282;let DS=.3; // pixels per mm of deflection (simple 0.3, compound 2.5)
let type='simple',loads=[],rows=[],broken=false,bodies=[],reading=null,failInfo=null,A=null,busy=false;
const sx=x=>X0+x*PX,msg=t=>$('msg').textContent=t||'',mix=(a,b,t)=>Math.round(a+(b-a)*t);
const dAt=x=>A?A.defl[Math.round(x*100)]*DS:0;

async function analyze(ls){
 const r=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,loads:ls})});
 if(!r.ok)throw new Error('API '+r.status);return r.json();
}
async function add(){
 if(broken)return msg('The beam has failed. Press Reset to start again.');
 if(busy)return;const W=+$('W').value,x=+$('X').value;
 if(!(W>=.5&&W<=50))return msg('Enter a weight between 0.5 and 50 N.');
 if(!(x>=.05&&x<=.95))return msg('Enter a distance between 0.05 and 0.95 m.');
 msg();busy=true;
 try{
  const a=await analyze(loads.concat({W,x}));loads.push({W,x});A=a;
  if(a.s>=1){failInfo={W,x};return fail()}
  const rf=+(a.init_bal+a.added_bal*(1+(Math.random()-.5)*.04)).toFixed(3),re=+(rf-a.init_bal).toFixed(3);
  rows.push({W,x,ri:+a.init_bal.toFixed(3),rf,re,ra:+a.added_bal.toFixed(3),er:Math.abs((a.added_bal-re)/a.added_bal)*100});
  reading=rf;refresh();
 }catch(e){msg('Python backend not reachable. Run "vercel dev" locally or deploy to Vercel.')}
 finally{busy=false}
}
function refresh(){
 if(!A)return;
 $('tot').textContent=A.total.toFixed(2)+' N';$('mm').textContent=A.M.toFixed(2)+' N·m';
 $('sg').textContent=(A.sigma/1e6).toFixed(1)+' MPa';$('sbar').style.width=Math.min(100,A.s*100)+'%';
 $('tb').innerHTML=rows.length?rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.W.toFixed(2)}</td><td>${r.x.toFixed(2)}</td><td>${r.ri.toFixed(3)}</td><td>${r.rf.toFixed(3)}</td><td>${r.re.toFixed(3)}</td><td>${r.ra.toFixed(3)}</td><td>${r.er.toFixed(2)}</td></tr>`).join(''):'<tr><td colspan="8" class="muted" style="text-align:center">No readings yet. Add a weight to begin.</td></tr>';
 conclusion();draw();
}
function conclusion(){
 let h='<p>Add weights to generate the conclusion.</p>';
 if(rows.length){
  const n=rows.length,mean=rows.reduce((s,r)=>s+r.er,0)/n,l=rows[n-1],d=l.re-l.ra,ok=mean<5;
  const tot=A.self_w+loads.reduce((s,v)=>s+v.W,0)-(broken?failInfo.W:0);
  h=`<p>Over ${n} reading${n>1?'s':''}, the mean percentage error is <b>${mean.toFixed(2)}%</b>. For the latest reading the force residual is ΣF<sub>y</sub> = ${d.toFixed(3)} N and the moment residual about the left support is ΣM = ${(d*A.xb).toFixed(3)} N·m (total load with self-weight: ${tot.toFixed(2)} N).</p>
  <p class="${ok?'ok':'bad'}"><b>${ok?'The beam is in static equilibrium: ΣF = 0 and ΣM = 0 hold within experimental error, so the moment law is verified.':'The residuals are larger than expected (mean error above 5%). Recheck the readings before concluding equilibrium.'}</b></p>`;
 }
 if(broken)h+=`<p class="bad">The beam failed when ${failInfo.W.toFixed(1)} N was added at x = ${failInfo.x.toFixed(2)} m. The conclusion uses only readings recorded before failure.</p>`;
 $('ctext').innerHTML=h;
}
function fail(){
 broken=true;$('alert').style.display='block';const xm=sx(A.xm);
 bodies=[{x:(X0+xm)/2,y:BY+T/2,w:xm-X0,h:T,a:0,vx:-.6,vy:0,va:-.012,c:'#b9814b'},{x:(xm+X0+PX)/2,y:BY+T/2,w:X0+PX-xm,h:T,a:0,vx:.6,vy:0,va:.012,c:'#b9814b'}];
 layout().forEach(b=>bodies.push({...b,a:0,vx:(Math.random()-.5)*3,vy:-Math.random()*2,va:(Math.random()-.5)*.1,c:'#64748b'}));
 crack();refresh();$('sbar').style.width='100%';requestAnimationFrame(fall);
}
function fall(){bodies.forEach(b=>{b.vy+=.35;b.y+=b.vy;b.x+=b.vx;b.a+=b.va});draw();if(bodies.some(b=>b.y<cv.height+120))requestAnimationFrame(fall)}
function crack(){try{const ac=new(window.AudioContext||window.webkitAudioContext)(),n=ac.sampleRate*.5,b=ac.createBuffer(1,n,ac.sampleRate),d=b.getChannelData(0);
 for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,4);
 const s=ac.createBufferSource(),f=ac.createBiquadFilter();s.buffer=b;f.type='highpass';f.frequency.value=700;s.connect(f);f.connect(ac.destination);s.start()}catch(e){}}

// ---- drawing ----
function layout(){const out=[];loads.forEach(l=>{const px=sx(l.x),w=36,h=16+Math.min(l.W,50)*.3;let base=BY+dAt(l.x);
 out.forEach(o=>{if(Math.abs(o.x-px)<w)base=Math.min(base,o.y-o.h/2)});out.push({x:px,y:base-h/2,w,h,t:l.W%1?l.W.toFixed(1):l.W})});return out}
function rect(x,y,w,h,a,fill,txt){ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle=fill;ctx.fillRect(-w/2,-h/2,w,h);ctx.strokeStyle='rgba(30,41,59,.5)';ctx.strokeRect(-w/2,-h/2,w,h);
 if(txt!==undefined){ctx.fillStyle='#fff';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(txt,0,0)}ctx.restore()}
function steel(x,y,w,h,vert){const g=vert?ctx.createLinearGradient(0,y,0,y+h):ctx.createLinearGradient(x,0,x+w,0);
 g.addColorStop(0,'#64748b');g.addColorStop(.5,'#e2e8f0');g.addColorStop(1,'#64748b');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.strokeStyle='#334155';ctx.strokeRect(x,y,w,h)}
function bolt(x,y){ctx.fillStyle='#334155';ctx.beginPath();ctx.arc(x,y,2.5,0,7);ctx.fill()}
function support(x,kind){const top=BY+T;
 steel(x-34,GY-8,68,8,true);bolt(x-26,GY-4);bolt(x+26,GY-4);
 if(kind==='pin'){const g=ctx.createLinearGradient(x-22,0,x+22,0);g.addColorStop(0,'#64748b');g.addColorStop(.5,'#cbd5e1');g.addColorStop(1,'#64748b');
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(x,top+6);ctx.lineTo(x-24,GY-8);ctx.lineTo(x+24,GY-8);ctx.closePath();ctx.fill();ctx.strokeStyle='#334155';ctx.stroke();
  ctx.fillStyle='#e2e8f0';ctx.beginPath();ctx.arc(x,top+6,6,0,7);ctx.fill();ctx.stroke()}
 else{steel(x-14,top+22,28,GY-8-top-22,false);steel(x-26,top+2,52,5,true);
  [-9,9].forEach(o=>{ctx.fillStyle='#cbd5e1';ctx.beginPath();ctx.arc(x+o,top+15,7,0,7);ctx.fill();ctx.strokeStyle='#334155';ctx.stroke()});
  if(kind==='scale'){ctx.fillStyle='#0f172a';ctx.fillRect(x-38,GY+5,76,22);ctx.strokeStyle='#64748b';ctx.strokeRect(x-38,GY+5,76,22);
   ctx.fillStyle='#4ade80';ctx.font='12px ui-monospace,monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((reading??A.init_bal).toFixed(3)+' N',x,GY+16)}}
}
function draw(){
 ctx.clearRect(0,0,cv.width,cv.height);
 const bench=ctx.createLinearGradient(0,GY,0,GY+48);bench.addColorStop(0,'#a8a29e');bench.addColorStop(1,'#78716c');ctx.fillStyle=bench;ctx.fillRect(0,GY,cv.width,48);
 if(!A)return;
 if(broken){bodies.forEach(b=>rect(b.x,b.y,b.w,b.h,b.a,b.c,b.t));return}
 const s=Math.min(1,A.s);
 A.sup.forEach((p,i)=>support(sx(p.x),i===0?'pin':Math.abs(p.x-A.xb)<1e-9?'scale':'roller'));
 const d=A.defl.map(v=>v*DS);
 ctx.beginPath();d.forEach((v,i)=>i?ctx.lineTo(sx(i/100),BY+v):ctx.moveTo(sx(0),BY+v));
 for(let i=100;i>=0;i--)ctx.lineTo(sx(i/100),BY+T+d[i]);ctx.closePath();
 const g=ctx.createLinearGradient(0,BY,0,BY+T);g.addColorStop(0,'#e6bb83');g.addColorStop(.5,'#c9955c');g.addColorStop(1,'#a8743d');
 ctx.fillStyle=g;ctx.fill();ctx.fillStyle=`rgba(220,38,38,${s*.55})`;ctx.fill();ctx.strokeStyle='#6b4423';ctx.lineWidth=1.2;ctx.stroke();
 ctx.strokeStyle='rgba(107,68,35,.35)';ctx.lineWidth=1; // wood grain
 [.3,.55,.8].forEach(f=>{ctx.beginPath();d.forEach((v,i)=>{const y=BY+T*f+v+Math.sin(i*.4+f*9)*.8;i?ctx.lineTo(sx(i/100),y):ctx.moveTo(sx(0),y)});ctx.stroke()});
 if(type==='compound'){const hx=sx(HX),hy=BY+T/2+dAt(HX);steel(hx-4,BY-4+dAt(HX),8,T+8,true);ctx.fillStyle='#e2e8f0';ctx.beginPath();ctx.arc(hx,hy,6,0,7);ctx.fill();ctx.strokeStyle='#334155';ctx.stroke()}
 if(A.s>.7){const n=Math.ceil((A.s-.7)/.3*6),len=T*Math.min(1,(A.s-.7)/.3+.3),im=Math.round(A.xm*100);ctx.strokeStyle='#450a0a';ctx.lineWidth=1.6;
  for(let i=0;i<n;i++){const x=sx(A.xm)+(i-2.5)*9,y=BY+T+d[im];ctx.beginPath();ctx.moveTo(x,y);
   for(let k=1;k<=4;k++)ctx.lineTo(x+(k%2?3:-3)*(1+Math.sin(i*7+k)*.4),y-len*k/4);ctx.stroke()}ctx.lineWidth=1}
 layout().forEach(b=>{const g=ctx.createLinearGradient(b.x-b.w/2,0,b.x+b.w/2,0);g.addColorStop(0,'#475569');g.addColorStop(.45,'#cbd5e1');g.addColorStop(1,'#475569');
  rect(b.x,b.y,b.w,b.h,0,g);ctx.fillStyle='#334155';ctx.fillRect(b.x-5,b.y-b.h/2-5,10,5);ctx.fillStyle='#0f172a';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b.t,b.x,b.y)});
 ctx.fillStyle='#334155';ctx.font='12px system-ui';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText('A (pin)',sx(0)-16,GY+40);if(type==='compound')ctx.fillText('hinge',sx(HX)-14,BY-10);
}
async function reset(){loads=[];rows=[];broken=false;bodies=[];reading=null;failInfo=null;$('alert').style.display='none';msg();$('sbar').style.width='0';
 try{A=await analyze([]);refresh()}catch(e){msg('Python backend not reachable. Run "vercel dev" locally or deploy to Vercel.');draw()}}
function pdf(){
 document.body.classList.add('exp');
 html2pdf().set({margin:8,filename:'beam-experiment-report.pdf',image:{type:'jpeg',quality:.95},html2canvas:{scale:2,backgroundColor:'#eaf2ff'},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['avoid-all']}})
  .from($('report')).save().then(()=>document.body.classList.remove('exp')).catch(()=>{document.body.classList.remove('exp');msg('PDF export failed. Check your internet connection (html2pdf loads from a CDN).')});
}
$('add').onclick=add;$('reset').onclick=reset;$('pdf').onclick=pdf;
$('type').onchange=e=>{type=e.target.value;DS=type==='simple'?.3:2.5;$('ctitle').textContent='Simulation: '+type+' beam';reset()};
['W','X'].forEach(i=>$(i).addEventListener('keydown',e=>{if(e.key==='Enter')add()}));
reset();

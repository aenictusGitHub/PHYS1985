'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const source=fs.readFileSync(path.join(root,'assets/phys1985-mobile-3d.js'),'utf8');
const common=fs.readFileSync(path.join(root,'assets/phys1985-mobile.js'),'utf8');
const context={window:{}};vm.runInNewContext(common,context);vm.runInNewContext(source,context);const mobile=context.window.PhysMobile3D;
const kinds=['fly','butterfly','ladybug','tore'];
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z,norm=a=>Math.hypot(a.x,a.y,a.z);
const near=(a,b,epsilon=1e-8)=>assert(Math.abs(a-b)<epsilon,`${a} != ${b}`);
let previous=null;
for(let i=0;i<=2000;i++){
  const t=i*Math.PI/500,v={x:Math.cos(t),y:Math.sin(t),z:.02*Math.sin(3*t)};
  const frame=mobile.orientation(v,previous);
  for(const a of Object.values(frame))near(norm(a),1);
  near(dot(frame.forward,frame.side),0);near(dot(frame.forward,frame.up),0);near(dot(frame.side,frame.up),0);
  near(dot(frame.forward,v)/norm(v),1);
  if(previous)assert(dot(frame.up,previous.up)>.99,'no vertical-flight roll flip');
  assert.equal(mobile.orientation({x:0,y:0,z:0},frame),frame,'hold pose at rest');
  previous=frame;
}
const reversed=mobile.orientation(Object.fromEntries(Object.entries(previous.forward).map(([k,v])=>[k,-v])),previous);
near(dot(reversed.up,previous.up),1);near(dot(reversed.forward,previous.forward),-1);
for(const kind of kinds)for(const time of [0,.125,.25,2.4]){
  const g=mobile.geometry(kind,time),vertices=g.faces.flatMap(f=>f.points);
  assert(vertices.length>100);assert(vertices.every(p=>Object.values(p).every(Number.isFinite)));
  assert(Math.max(...vertices.map(p=>p.z))-Math.min(...vertices.map(p=>p.z))>4,'body has volume, not a billboard');
}
assert.deepEqual(mobile.geometry('tore',0),mobile.geometry('tore',.125),'wooden Toré has no wing animation');
console.log('PASS 3D geometry, velocity alignment, stable vertical crossings and reversals.');
(async()=>{
 const out=process.env.RESULT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'phys-mobile-3d-'));fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:930},deviceScaleFactor:2});
  await page.setContent('<style>body{font:15px system-ui;color:#25364b;background:#f6f8fb}h1{font-size:20px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}section{background:white;border:1px solid #d7e0e8;border-radius:8px;text-align:center}canvas{width:200px;height:170px;display:block}p{margin:6px}</style><h1>Orientation 3D — dessus, profil, face, dos, éloignement</h1><main></main>');
  await page.addScriptTag({content:common});await page.addScriptTag({content:source});
  const metrics=await page.evaluate(kinds=>{
    const V=(x=0,y=0,z=0)=>({x,y,z}),dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
    const frame=PhysMobile3D.orientation(V(1,0,0));const result=[];
    const views=[['Dessus',V(0,1,0),V(1,0,0),V(0,0,-1),900],['Profil',V(0,0,1),V(1,0,0),V(0,1,0),900],['Face',V(1,0,0),V(0,0,-1),V(0,1,0),900],['Dos',V(-1,0,0),V(0,0,1),V(0,1,0),900],['Loin',V(0,1,0),V(1,0,0),V(0,0,-1),1800]];
    for(const kind of kinds)for(const [label,eyeUnit,right,up,distance]of views){
      const card=document.createElement('section'),title=document.createElement('p'),canvas=document.createElement('canvas');
      title.textContent=kind+' · '+label;canvas.width=400;canvas.height=340;card.append(title,canvas);document.querySelector('main').append(card);
      const ctx=canvas.getContext('2d');ctx.scale(2,2);
      const eye=V(eyeUnit.x*distance,eyeUnit.y*distance,eyeUnit.z*distance);
      const project=p=>{const depth=distance-dot(p,eyeUnit);return depth>5?{x:100+dot(p,right)*550/depth,y:85-dot(p,up)*550/depth,depth}:null;};
      PhysMobile3D.draw(ctx,kind,V(),{frame,time:0,project,eye,light:V(-.45,1,.8),unitScale:5});
      const data=ctx.getImageData(0,0,400,340).data;let left=400,rightEdge=0,top=340,bottom=0;
      for(let y=0;y<340;y++)for(let x=0;x<400;x++)if(data[(y*400+x)*4+3]>20){left=Math.min(left,x);rightEdge=Math.max(rightEdge,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      result.push({kind,label,width:rightEdge-left+1,height:bottom-top+1,pixels:canvas.toDataURL()});
    }return result;
  },kinds);
  for(const kind of kinds){
    const rows=metrics.filter(r=>r.kind===kind),top=rows[0],profile=rows[1],front=rows[2],back=rows[3],far=rows[4];
    assert(new Set(rows.slice(0,4).map(r=>r.pixels)).size===4,kind+' views should be distinct');
    assert(front.height>8&&profile.height>8,kind+' does not vanish end-on');
    assert(far.width<top.width*.6&&far.height<top.height*.6,kind+' perspective gets smaller with distance');
    // The front view retains the lateral wing span, but compresses the dorsal
    // silhouette to its actual thickness (not to an always-facing sprite).
    if(kind!=='tore')assert(front.height<top.height,kind+' heading foreshortens');
  }
  await page.screenshot({path:path.join(out,'perspective-views.png')});
  console.log('PASS camera perspective, front/back/profile visibility and distance scaling.');
  // Playback and shared state: cache construction must not depend on the route
  // taken through time or on the orientation of the camera.
  await page.addInitScript(()=>{
    let original;Object.defineProperty(window,'PhysMobile3D',{get:()=>original,set:value=>{
      original={...value,draw(ctx,kind,position,options){window.__pose=options.frame;return value.draw(ctx,kind,position,options);}};
    }});
  });
  await page.goto('file://'+path.join(root,'cinematique_3d_webapp_fr.html'));await page.waitForFunction(()=>window.PhysShare?.ready);
  await page.selectOption('#mobile-appearance','tore');
  const setTime=t=>page.locator('#time-slider').evaluate((e,t)=>{e.value=String(t);e.dispatchEvent(new Event('input',{bubbles:true}));},t);
  await setTime(3.14);const pose=await page.evaluate(()=>window.__pose);
  for(const preset of ['top-view','front-view','side-view','reset-view']){await page.locator('#'+preset).click();assert.deepEqual(await page.evaluate(()=>window.__pose),pose,'camera must not rotate the mobile physically');}
  await setTime(8);await setTime(3.14);assert.deepEqual(await page.evaluate(()=>window.__pose),pose,'scrubbing is deterministic');
  const link=await page.evaluate(()=>PhysShare.makeLink());await page.goto(link);await page.waitForFunction(()=>window.PhysShare?.ready);
  assert.deepEqual(await page.evaluate(()=>window.__pose),pose,'shared pose is deterministic');
  await page.locator('#viewport').screenshot({path:path.join(out,'app-perspective-tore.png')});
  for(const trajectory of ['lissajous','trefoil']){
    await page.selectOption('#trajectory-select',trajectory);await setTime(0);
    const start=await page.evaluate(()=>window.__pose);
    await setTime(Number(await page.locator('#time-slider').getAttribute('max')));
    const end=await page.evaluate(()=>window.__pose);
    near(dot(start.forward,end.forward),1,1e-5);near(dot(start.up,end.up),1,1e-5);
  }
  const performance=await page.evaluate(()=>{
    const draw=()=>document.querySelector('#mobile-appearance').dispatchEvent(new Event('change',{bubbles:true}));
    const start=performance.now();for(let i=0;i<60;i++)draw();return (performance.now()-start)/60;
  });
  assert(performance<50,'bounded redraw cost');console.log(`PASS pose stability, sharing and redraw (${performance.toFixed(1)} ms). Images: ${out}`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

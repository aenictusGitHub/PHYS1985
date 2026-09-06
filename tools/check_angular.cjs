/* Pure physics plus controller checks. No browser or production dependencies.
 * Set PHYS1985_MATHJAX_ROOT to mathjax-full/js to also check real TeX SVGs. */
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const zip=path.join(__dirname,'..','moment_cinetique_webapp_fr.zip');
const read=file=>execFileSync('unzip',['-p',zip,'moment_cinetique_webapp_fr_source/'+file],{encoding:'utf8'});
const source=read('app.js'),html=read('index.html');
const models=vm.runInNewContext(source.split("if(typeof document")[0]+';RotationModels');
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
near(models.inertia('particle',2,0,.5),.5);near(models.inertia('stool',2,3,.5),4);near(models.inertia('shell',3,0,.5),.5);
assert.throws(()=>models.inertia('unknown',1,0,1));assert.throws(()=>models.inertia('particle',0,0,1));assert.throws(()=>new models.Simulation('shell',{r:NaN}));
for(const model of ['particle','stool','shell'])for(const omega of [-2,0,2]) {
  const sim=new models.Simulation(model,{omega,duration:60}),initial=sim.snapshot();
  sim.advance(3);near(sim.x.theta,omega*3);sim.moveTo(.25);
  for(let i=0;i<180;i++)sim.advance(1/60);
  const contracted=sim.snapshot();near(contracted.r,.25);near(contracted.L,initial.L);near(contracted.I*contracted.omega,initial.L);near(contracted.K,initial.L**2/(2*contracted.I));
  near(contracted.balance,0);assert(contracted.I<initial.I);if(omega)assert(Math.abs(contracted.omega)>Math.abs(omega));
  sim.moveTo(initial.r);sim.advance(3);near(sim.snapshot().omega,omega);near(sim.snapshot().K,initial.K);
  const before=sim.snapshot();sim.setTorque(-.7);sim.advance(4);near(sim.x.L,before.L-2.8);near(sim.snapshot().balance,0);
  const saved=sim.snapshot(),end=sim.end;sim.seek(5.42);near(sim.x.t,5.42);near(sim.snapshot().balance,0);sim.seek(end);near(sim.x.L,saved.L);near(sim.x.theta,saved.theta);
  sim.seek(5.42);const rewind=sim.snapshot();sim.setTorque(.3);sim.advance(.7);near(sim.x.L,rewind.L+.21);near(sim.end,6.12);near(sim.snapshot().balance,0);
  assert.equal(sim.history[0].t,0);for(let i=1;i<sim.history.length;i++)assert(sim.history[i].t>sim.history[i-1].t,'strictly increasing history');
  const L=sim.x.L;sim.setRadius(.4);near(sim.x.L,L);near(sim.snapshot().balance,0);sim.setRadius(100);near(sim.x.r,1.2);sim.setRadius(-1);near(sim.x.r,.25);
}
// Constant-radius torque has an exact solution, including braking and reversal.
for(const hz of [29.97,60,120]) {
  const sim=new models.Simulation('stool',{omega:-1,torque:.7,duration:60}),I=sim.snapshot().I,L0=sim.L0;
  for(let i=0;i<Math.ceil(60*hz);i++)sim.advance(1/hz);
  near(sim.x.t,60,1e-9);near(sim.x.L,L0+.7*60,1e-9);near(sim.x.theta,-60+.7*60**2/(2*I),1e-7);near(sim.snapshot().balance,0,1e-9);
  const end=JSON.stringify(sim.snapshot());sim.advance(1e-13);assert.equal(JSON.stringify(sim.snapshot()),end);
}
// Verify second-order angular integration during a smooth contraction.
function phase(h){const sim=new models.Simulation('particle');sim.moveTo(.25);for(let t=0;t<2-1e-10;t+=h)sim.advance(h);return sim.x.theta;}
assert(Math.abs(phase(1/240)-phase(1/1920))<Math.abs(phase(1/120)-phase(1/1920))*.3);
const initialEdit=new models.Simulation('particle');initialEdit.setRadius(.5);near(initialEdit.snapshot().omega,1.5);near(initialEdit.p.r,.5);assert.equal(initialEdit.history.length,1);
console.log('Angular physics: three inertias, conservation, contraction, rotational energy, torque and reversal, history/branching, convergence, 60-second clocks passed.');

let width=700,frameId=0,typesetCount=0;
const nodes=new Map(),frames=new Map(),errors=[],docEvents={},plots=new Map();
function canvasContext(id){
  let points=[];const strokes=[],circles=[];
  const context=new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>{
    for(const n of args.flat())if(typeof n==='number')assert(Number.isFinite(n),'finite canvas coordinate');
    if(key==='clearRect'){strokes.length=0;circles.length=0;}if(key==='beginPath')points=[];
    if(key==='moveTo'||key==='lineTo')points.push([...args]);if(key==='arc')circles.push([...args]);if(key==='stroke')strokes.push({points,color:target.strokeStyle,width:target.lineWidth});
  };}});plots.set(id,{context,strokes,circles});return context;
}
class Element{
  constructor(tag='span'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.events={};this.classList={add(){}};this.value='';this.hidden=false;this.checked=false;}
  set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
  querySelector(tag){return this.children.find(el=>el.tag===tag);}
  cloneNode(deep){const el=new Element(this.tag);el.attrs={...this.attrs};el.style={...this.style};el.dataset={...this.dataset};if(deep)el.children=this.children.map(c=>typeof c==='string'?c:c.cloneNode(true));return el;}
  addEventListener(k,fn){this.events[k]=fn;}fire(k,args={}){this.events[k]?.({target:this,preventDefault(){},...args});}click(){this.fire('click');}closest(){return null;}
  setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=undefined;}
  getBoundingClientRect(){return {left:0,top:0,width,height:this.id?.startsWith('scene')?(width<420?340:390):250};}
  getContext(){return plots.get(this.id)?.context||canvasContext(this.id);}
}
for(const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
  const el=new Element(match[1]);el.id=match[3];el.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';el.checked=/\bchecked\b/.test(match[2]);el.hidden=/\bhidden\b/.test(match[2]);el.dataset.tex=/\bdata-tex="([^"]*)"/.exec(match[2])?.[1];
}
const $=id=>{assert(nodes.has(id),'missing '+id);return nodes.get(id);};
$('model-select').value='stool';$('chart-select').value='L';$('speed').value='1';
const staticMath=[...html.matchAll(/\bdata-tex="([^"]*)"/g)].map(match=>{const el=new Element();el.dataset.tex=match[1];return el;});
let convertTex;
if(process.env.PHYS1985_MATHJAX_ROOT){
  const root=process.env.PHYS1985_MATHJAX_ROOT;
  const {mathjax}=require(path.join(root,'mathjax.js')), {TeX}=require(path.join(root,'input/tex.js')), {SVG}=require(path.join(root,'output/svg.js'));
  const adaptor=require(path.join(root,'adaptors/liteAdaptor.js')).liteAdaptor();require(path.join(root,'handlers/html.js')).RegisterHTMLHandler(adaptor);
  require(path.join(root,'input/tex/ams/AmsConfiguration.js'));require(path.join(root,'input/tex/newcommand/NewcommandConfiguration.js'));
  const doc=mathjax.document('',{InputJax:new TeX({packages:['base','ams','newcommand']}),OutputJax:new SVG({fontCache:'none'})});
  function convert(n){const el=new Element(n.kind);for(const {name,value}of adaptor.allAttributes(n))el.setAttribute(name,value);el.append(...adaptor.childNodes(n).filter(c=>c.kind!=='#text').map(convert));return el;}
  convertTex=text=>{const out=doc.convert(text,{display:false});assert(!adaptor.outerHTML(out).includes('data-mml-node="merror"'),'valid TeX: '+text);return convert(out);};
}
function typeset(text){typesetCount++;assert(!/[\x00-\x1f]/.test(text),'no accidental TeX escapes');assert(!text.includes('NaN'));if(convertTex)return convertTex(text);const out=new Element('mjx-container'),svg=new Element('svg');svg.setAttribute('viewBox','0 -700 500 722');svg.setAttribute('width','1.131ex');svg.append(new Element('g'));out.append(svg);return out;}
const document={readyState:'complete',getElementById:$,createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelectorAll:()=>staticMath,addEventListener:(event,fn)=>{docEvents[event]=fn;}};
const context={document,window:{devicePixelRatio:1},console:{error:e=>errors.push(e)},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),MathJax:{startup:{promise:Promise.resolve(),document:{updateDocument(){}}},tex2svg:typeset}};
const tick=t=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(t));};
const value=id=>parseFloat($(id).dataset.number);
const input=(id,value)=>{$(id).value=value;$(id).fire('input');};
const labelValue=key=>$('scene-labels').children.find(el=>el.dataset.math===key);
function checkScene(){
  const strokes=plots.get('scene-canvas').strokes,h=width<420?340:390;
  for(const s of strokes)for(const [x,y]of s.points)assert(x>=0&&x<=width&&y>=0&&y<=h,'scene/vector stays inside fixed viewport');
  const L=strokes.filter(s=>s.color==='#7758a6'&&s.width===3);
  if(Math.abs(value('momentum-value'))>.01&&$('show-l').checked){assert.equal(L.length,2);assert.deepEqual(L[0].points[1],L[1].points[1],'L arrowhead at endpoint');assert.equal(Math.sign(L[0].points[0][1]-L[0].points[1][1]),Math.sign(value('momentum-value')));}
}
async function checkUI(){
  vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[]);assert($('loading').hidden);assert.equal(frames.size,0,'no autoplay');
  for(const model of ['particle','stool','shell'])for(const viewport of [240,700]){
    width=viewport;$('model-select').value=model;$('model-select').fire('change');const p=models.definitions[model];
    near(value('radius-value'),p.r);near(value('momentum-value'),models.inertia(model,p.mass,p.base,p.r)*p.omega,.00051);assert.equal($('base-control').hidden,model!=='stool');
    for(const id of ['time-value','radius-value','scene-radius-value','mass-value','base-value','omega-initial-value','torque-value','duration-value','inertia-value','omega-value','momentum-value','energy-value','balance-value']){assert.equal($(id).children.length,1);assert.equal($(id).children[0].tag,'svg');assert(!$(id).dataset.number.split('|')[0].includes(','));}
    input('radius',.6);near(value('omega-value'),p.omega,.00051);const L=value('momentum-value'),I=value('inertia-value');
    $('contract').click();assert.equal($('play').textContent,'Pause');tick(0);for(let i=1;i<=180;i++)tick(i*1000/60);
    $('play').click();near(value('time-value'),3,.011);near(value('radius-value'),.25,.001);near(value('momentum-value'),L,.001);assert(value('inertia-value')<I);near(value('balance-value'),0);checkScene();
    const bodyGeometry=JSON.stringify(plots.get('scene-canvas').circles),physics=['time-value','radius-value','omega-value','momentum-value'].map(id=>$(id).dataset.number);
    for(const id of ['show-l','show-v','show-radius']){$(id).checked=false;$(id).fire('change');}
    assert.equal(JSON.stringify(plots.get('scene-canvas').circles),bodyGeometry);assert.deepEqual(['time-value','radius-value','omega-value','momentum-value'].map(id=>$(id).dataset.number),physics);
    for(const id of ['show-l','show-v','show-radius']){$(id).checked=true;$(id).fire('change');}
    for(const key of ['I','omega','L']){$('chart-select').value=key;$('chart-select').fire('change');assert.deepEqual(['time-value','radius-value','omega-value','momentum-value'].map(id=>$(id).dataset.number),physics);}
    $('history').fire('keydown',{key:'Home'});near(value('time-value'),0);near(value('radius-value'),.6);$('history').fire('keydown',{key:'End'});near(value('time-value'),3,.011);
    $('history').fire('pointerdown',{pointerId:1,clientX:70+(width-94)*1.5/20,button:0});$('history').fire('pointerup',{pointerId:1});near(value('time-value'),1.5,.011);assert.equal($('history').capture,undefined);
    $('expand').click();tick(4000);for(let i=1;i<=150;i++)tick(4000+i*1000/60);$('play').click();near(value('time-value'),4,.011);near(value('radius-value'),1.2);near(value('momentum-value'),L,.001);checkScene();
    input('torque',-2);$('play').click();tick(8000);for(let i=1;i<=420;i++)tick(8000+i*1000/60);$('play').click();assert(value('momentum-value')<0);near(value('balance-value'),0);checkScene();
    $('zero-torque').click();checkScene();assert($('conservation-badge').textContent.includes('conservé'));
    const conserved=value('momentum-value');input('radius',.3);near(value('momentum-value'),conserved,.001);checkScene();
    $('restart').click();near(value('time-value'),0);near(value('radius-value'),.6);near(value('omega-value'),p.omega,.001);near(value('torque-value'),0);
    input('omega-initial',0);$('contract').click();tick(20000);for(let i=1;i<=150;i++)tick(20000+i*1000/60);$('play').click();near(value('omega-value'),0);near(value('momentum-value'),0);checkScene();
    $('reset').click();near(value('radius-value'),p.r);near(value('omega-value'),p.omega);
  }
  // The nearby slider and direct radial dragging remain live while time advances.
  let interactionClock=30000;
  for(const model of ['particle','stool','shell'])for(const viewport of [240,700]){
    width=viewport;$('model-select').value=model;$('model-select').fire('change');
    const clock=interactionClock;interactionClock+=5000;
    const p=models.definitions[model],factor=model==='stool'?2:1,canvas=$('scene-canvas'),h=width<420?340:390,cx=width/2,cy=h*.52,scale=Math.min(width*.32,h*.29)/1.2;
    const eventAt=(x,y,id=7)=>({clientX:x,clientY:y,pointerId:id,button:0});
    near(value('scene-radius-value'),factor*p.r);near(Number($('scene-radius').min),factor*.25);near(Number($('scene-radius').max),factor*1.2);
    assert.equal($('scene-radius-symbol').dataset.math,model==='stool'?'d=2r':'r');
    input('scene-radius',factor*.6);near(value('radius-value'),.6);near(Number($('radius').value),.6);near(value('omega-value'),p.omega,.001);assert.equal(frames.size,0);
    canvas.fire('pointerdown',eventAt(cx+scale*.6+3,cy));assert.equal(canvas.capture,7);
    canvas.fire('pointermove',eventAt(cx+scale*.6+3,cy));near(value('radius-value'),.6); // No jump when caught off-center.
    canvas.fire('pointermove',eventAt(cx+scale*.7+3,cy));near(value('radius-value'),.7);near(value('scene-radius-value'),factor*.7);near(value('omega-value'),p.omega,.001);
    canvas.fire('pointerup',eventAt(cx+scale*.7,cy));assert.equal(canvas.capture,undefined);assert.equal(frames.size,0);
    $('play').click();tick(clock);for(let i=1;i<=60;i++)tick(clock+i*1000/60);
    const L=value('momentum-value');input('scene-radius',factor*.4);near(value('radius-value'),.4);near(value('time-value'),1,.011);near(value('momentum-value'),L,.001);assert.equal($('play').textContent,'Pause');assert.equal(frames.size,1);
    tick(clock+1050);tick(clock+1100);assert(value('time-value')>1.05);const t=value('time-value');
    const mass=plots.get('scene-canvas').circles.find(c=>c[2]===(model==='shell'?5.5:10)),dx=mass[0]-cx,dy=mass[1]-cy;
    canvas.fire('pointerdown',eventAt(mass[0],mass[1]));assert.equal(canvas.capture,7);
    canvas.fire('pointermove',eventAt(cx+2*dx,cy+2*dy,8));near(value('radius-value'),.4); // Ignore a second pointer.
    canvas.fire('pointermove',eventAt(cx+1.5*dx,cy+1.5*dy));near(value('radius-value'),.6);near(value('momentum-value'),L,.001);near(value('time-value'),t);near(value('balance-value'),0);
    tick(clock+1150);tick(clock+1200);assert(value('time-value')>t);assert.equal($('play').textContent,'Pause');
    canvas.fire('pointermove',eventAt(cx+100*dx,cy+100*dy));near(value('radius-value'),1.2);checkScene();
    canvas.fire('pointermove',eventAt(cx,cy));near(value('radius-value'),.25);checkScene();
    canvas.fire('pointercancel',eventAt(cx,cy));assert.equal(canvas.capture,undefined);assert.equal(canvas.style.cursor,'default');
    canvas.fire('pointermove',eventAt(cx+100,cy));near(value('radius-value'),.25);
    $('play').click();assert.equal(frames.size,0);input('scene-radius',factor*.5);near(value('momentum-value'),L,.001);assert.equal($('play').textContent,'Lire');
    const pausedMass=plots.get('scene-canvas').circles.find(c=>c[2]===(model==='shell'?5.5:10));
    canvas.fire('pointerdown',eventAt(pausedMass[0],pausedMass[1]));assert.equal(canvas.capture,7);$('restart').click();assert.equal(canvas.capture,undefined);near(value('radius-value'),.7);near(value('time-value'),0);
    canvas.fire('pointerdown',eventAt(0,0));assert.equal(canvas.capture,undefined);
    canvas.fire('pointerdown',eventAt(cx+scale*.7,cy));assert.equal(canvas.capture,7);canvas.fire('lostpointercapture',{pointerId:7});assert.equal(canvas.capture,undefined);
  }
  // Completion, replay and tab hiding do not strand the play button or clock.
  input('duration',10);$('play').click();tick(0);for(let i=1;i<=605;i++)tick(i*1000/60);near(value('time-value'),10,.001);assert.equal(frames.size,0);assert.equal($('play').textContent,'Lire');
  $('play').click();tick(12000);tick(12050);document.hidden=true;docEvents.visibilitychange();assert.equal(frames.size,0);assert.equal($('play').textContent,'Lire');assert(value('time-value')<1);
  assert.deepEqual(errors,[]);console.log('Angular controllers: all models, initial/live radius, distance slider, continuous mass dragging, pointer cleanup, smooth actions, signed torque, bounded vectors, stable layout, history/branching, reset, clocks and LaTeX baselines passed'+(convertTex?' with real MathJax.':'.'));
}
checkUI().catch(error=>{console.error(error);process.exitCode=1;});

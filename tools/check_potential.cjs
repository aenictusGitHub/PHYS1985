/* Physics and controller regression tests. No browser or production dependency.
 * Optional PHYS1985_MATHJAX_ROOT points to mathjax-full/js for real SVG checks. */
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const zip=path.join(__dirname,'..','potentiel_force_webapp_fr.zip');
const read=file=>execFileSync('unzip',['-p',zip,'potentiel_force_webapp_fr_source/'+file],{encoding:'utf8'});
const source=read('physics.js')+'\n'+read('app.js'),html=read('index.html');
const models=vm.runInNewContext(source.split("if (typeof document")[0]+';PotentialModels');
assert.equal(models.stability(1),'stable');
assert.equal(models.stability(-1),'unstable');
assert.equal(models.stability(0),'inconclusive','Zero curvature does not establish stability');
assert.equal(models.stability(-0),'inconclusive');
assert.throws(()=>models.stability(NaN));
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
for(const model of ['wells','pair','gravity']) {
  const d=models.definitions[model];
  for(const energy of [.2,1,4]) for(const length of [.5,1,2]) {
    for(let i=0;i<=100;i++) {
      const q=d.min+(d.max-d.min)*i/100,s=models.evaluate(model,q,energy,length),h=1e-5;
      const lo=models.evaluate(model,q-h/length,energy,length),hi=models.evaluate(model,q+h/length,energy,length);
      near(s.F,-(hi.U-lo.U)/(2*h),2e-5*Math.max(1,Math.abs(s.F)));
      near(s.curvature,(hi.slope-lo.slope)/(2*h),2e-5*Math.max(1,Math.abs(s.curvature)));
      near(s.slope,-s.F);near(s.position,q*length);
    }
    const equilibria=models.equilibria(model);
    assert.equal(equilibria.length,model==='wells'?3:model==='pair'?1:0);
    for(const eq of equilibria) {
      const s=models.evaluate(model,eq.q,energy,length);near(s.F,0,1e-10);
      const before=models.evaluate(model,eq.q-.001,energy,length),after=models.evaluate(model,eq.q+.001,energy,length);
      assert(eq.stable ? before.F>0&&after.F<0 : before.F<0&&after.F>0);
      assert.equal(s.curvature>0,eq.stable);
      assert.equal(eq.stability,models.stability(s.curvature));
      near(models.quadratic(s,s.position)/energy,s.U/energy,1e-12);
      const offset=.03*length;
      const quadraticLeft=models.quadratic(s,s.position-offset),quadraticRight=models.quadratic(s,s.position+offset);
      near(quadraticLeft/energy,quadraticRight/energy,1e-12,'Horizontal tangent at equilibrium');
      near((quadraticRight-s.U)/energy,.5*s.curvature*offset**2/energy,1e-12);
      if(model==='pair')near(s.U,-energy);
    }
  }
  for(const hz of [29.97,60,120]) {
    let s={q:d.start,direction:1};
    for(let i=0;i<Math.ceil(hz*60);i++) {s=models.sweep(s.q,s.direction,(d.max-d.min)/12/hz,d.min,d.max);assert(s.q>=d.min&&s.q<=d.max);}
  }
}
assert(models.evaluate('pair',1).F>0 && models.evaluate('pair',1.4).F<0);
assert.throws(()=>models.evaluate('pair',0));
assert.throws(()=>models.evaluate('gravity',0));
for(const r of [.1,1,2,10,1e6]){
  const s=models.evaluate('gravity',r,2,3);
  near(s.U,-6/s.position);near(s.F,-6/s.position**2);
  assert(s.U<0&&s.F<0&&s.slope>0,'universal attraction, negative potential');
}
near(models.evaluate('gravity',1e12).U,0,1e-11);
assert.throws(()=>models.evaluate('wells',NaN));
// Atomic distances are real SI values, not metre-sized labels relabelled nm.
const argon=models.definitions.pair,eqArgon=models.equilibria('pair')[0].q;
near(argon.length/1e-9,.3405,1e-12);near(argon.energy/1e-21,1.654,1e-12);
near(models.evaluate('pair',eqArgon).position/1e-9,.3821983274493415,1e-12);
near(models.evaluate('pair',eqArgon).U/argon.energy,-1,1e-12);
const atomicEquilibrium=models.evaluate('pair',eqArgon),atomicOffset=.02*argon.length;
near((models.quadratic(atomicEquilibrium,atomicEquilibrium.position+atomicOffset)-atomicEquilibrium.U)/argon.energy,
  .5*atomicEquilibrium.curvature*atomicOffset**2/argon.energy,1e-12);
for(const energy of [.5e-21,argon.energy,4e-21])for(const length of [.25e-9,argon.length,.5e-9]) {
  for(let i=0;i<=100;i++) {
    const q=argon.min+(argon.max-argon.min)*i/100,h=1e-5;
    const s=models.evaluate('pair',q,energy,length),lo=models.evaluate('pair',q-h,energy,length),hi=models.evaluate('pair',q+h,energy,length);
    near(s.F/(energy/length),-(hi.U-lo.U)/(2*h*energy),2e-5);
    near(s.curvature/(energy/length**2),(hi.slope-lo.slope)/(2*h*energy/length),2e-4);
  }
}
console.log('Potential physics: analytical gradients, curvature, stable/unstable equilibria, pair minimum and bounded sweep passed.');

const plane=vm.runInNewContext(read('physics.js')+';PotentialPlane');
for(const model of Object.keys(plane.definitions))for(const energy of [.2,1,4])for(const length of [.5,1,2]){
  for(let i=0;i<40;i++){
    const x=-1.6+3.2*i/39,y=1.5*Math.sin(i),s=plane.evaluate(model,x,y,energy,length),h=1e-5;
    const xp=plane.evaluate(model,x+h,y,energy,length),xm=plane.evaluate(model,x-h,y,energy,length),yp=plane.evaluate(model,x,y+h,energy,length),ym=plane.evaluate(model,x,y-h,energy,length);
    near(s.Fx,-(xp.U-xm.U)/(2*h*length),1e-6);near(s.Fy,-(yp.U-ym.U)/(2*h*length),1e-6);
    near(s.Hxx,-(xp.Fx-xm.Fx)/(2*h*length),1e-6);near(s.Hyy,-(yp.Fy-ym.Fy)/(2*h*length),1e-6);near(s.Hxy,-(xp.Fy-xm.Fy)/(2*h*length),1e-6);near(s.Hxy,-(yp.Fx-ym.Fx)/(2*h*length),1e-6);
    assert(s.Fx*(-s.Fx)+s.Fy*(-s.Fy)<=0,'force points down the gradient');
  }
  const eq=plane.equilibria(model,energy,length);assert.equal(eq.length,model==='double'?3:1);
  for(const e of eq){near(e.Fx,0);near(e.Fy,0);near(e.eigen[0]*e.eigen[1],e.Hxx*e.Hyy-e.Hxy**2,1e-8);assert.equal(e.stable,model==='bowl'||model==='double'&&e.qx!==0);assert.equal(e.saddle,!e.stable);}
}
const segments=plane.contours(Array.from({length:9},(_,j)=>Array.from({length:9},(_,i)=>i+2*j)),7.5);assert(segments.length);
for(const segment of segments)for(const [x,y]of segment)near(x+2*y,7.5,1e-12);
for(const bad of [['bad',0,0],['bowl',NaN,0],['bowl',0,0,0,1]])assert.throws(()=>plane.evaluate(...bad));
console.log('2D physics: partial derivatives, Hessian, minima/saddles, physical units and contour interpolation passed.');

const heightField=vm.runInNewContext(read('physics.js')+';PotentialSurface');
for(const model of Object.keys(plane.definitions))for(const viewport of [240,640,1100]){
  const m=heightField.mesh(model,2);
  assert.equal(m.triangles.length,3200);
  for(const row of m.vertices)for(const v of row)near(v.u,plane.evaluate(model,v.x,v.y,2).U);
  for(const camera of [heightField.initial,{azimuth:0,elevation:Math.PI/2},{azimuth:2.3,elevation:.18},{azimuth:-2,elevation:1.1}]){
    const pr=heightField.projection(viewport,400,m.low,m.high,camera),scene=heightField.scene(m,pr);
    const forceScale=heightField.forceFactor(m,model,2,1,pr,viewport,400);assert(forceScale>0);
    for(const row of m.vertices)for(const v of row){
      const s=plane.evaluate(model,v.x,v.y,2),tip=pr.project(v.x+forceScale*s.Fx,v.y+forceScale*s.Fy,s.U);
      assert(tip[0]>=28&&tip[0]<=viewport-28&&tip[1]>=28&&tip[1]<=372,'Force endpoint fits without moving or rescaling the surface');
    }
    for(const x of [-1.6,0,1.6])for(const y of [-1.6,0,1.6])for(const u of [pr.base,0,pr.top]){
      const p=pr.project(x,y,u);assert(p.every(Number.isFinite));assert(p[0]>40&&p[0]<viewport-35);assert(p[1]>30&&p[1]<370);
    }
    // A 3D orthogonal change of basis, with one common x/y spatial scale.
    const o=pr.project(0,0,0),a=pr.project(1,0,0),b=pr.project(0,1,0);
    const length=v=>Math.hypot(v[0]-o[0],v[1]-o[1],pr.scale*(v[2]-o[2]));near(length(a),pr.scale);near(length(b),pr.scale);
    // Picking returns the nearest visible surface, never a far-side face.
    for(const f of scene.faces.filter((_,i)=>i%119===0)){
      const p=[0,1,2].map(k=>f.screen.reduce((s,v)=>s+v[k]/3,0)),hit=scene.pick(p[0],p[1]);assert(hit);assert(hit.depth>=p[2]-1e-8);assert(Math.abs(hit.x)<=1.600001&&Math.abs(hit.y)<=1.600001);
    }
    if(camera.elevation===Math.PI/2)for(const [x,y]of [[.3,.7],[-1.2,.2],[1.4,-1.3]]){
      const p=pr.project(x,y,plane.evaluate(model,x,y,2).U),hit=scene.pick(p[0],p[1]);near(hit.x,x);near(hit.y,y);
    }
  }
}
console.log('3D surface: analytical heights, orthographic camera, common spatial scale, bounds and front-surface picking passed.');

const dynamics=vm.runInNewContext(read('physics.js')+';PotentialDynamics');
const harmonic=q=>({u:.5*q[0]**2,a:[-q[0]]});
for(const hz of [30,60,120]){
  const s=dynamics.create([.7],[.2],harmonic);
  for(let i=0;i<hz*20;i++)dynamics.advance(s,1/hz,harmonic,[[-2,2]]);
  near(s.q[0],.7*Math.cos(20)+.2*Math.sin(20),2e-6);near(s.w[0],-.7*Math.sin(20)+.2*Math.cos(20),2e-6);near(dynamics.energy(s,harmonic),s.E0,2e-7);
}
for(const model of ['wells','pair','gravity']){
  const d=models.definitions[model],sample=q=>{const r=models.reduced(model,q[0]);return {u:r.u,a:[-r.du]};},s=dynamics.create([d.start],[0],sample);
  let maxDrift=0;
  for(let i=0;i<1500&&!s.ended;i++){dynamics.advance(s,.02,sample,[[d.min,d.max]]);maxDrift=Math.max(maxDrift,Math.abs(dynamics.energy(s,sample)-s.E0));}
  assert(maxDrift<.0002,model+' conserved energy: '+maxDrift);
  if(model==='gravity'){
    assert(s.ended&&s.w[0]<0);near(s.q[0],d.min,1e-12);
    const ratio=d.min/d.start,t=Math.sqrt(d.start**3/2)*(Math.acos(Math.sqrt(ratio))+Math.sqrt(ratio*(1-ratio)));near(s.t,t,2e-6);
  }else assert(!s.ended,model+' oscillates within the plotted domain');
}
for(const model of Object.keys(plane.definitions)){
  const sample=q=>{const r=plane.reduced(model,...q);return {u:r.u,a:[-r.gx,-r.gy]};},s=dynamics.create([...plane.definitions[model].start],[0,0],sample);
  for(let i=0;i<1000&&!s.ended;i++){dynamics.advance(s,.02,sample,[[-1.6,1.6],[-1.6,1.6]]);assert(Math.abs(dynamics.energy(s,sample)-s.E0)<.0002);}
  if(model==='saddle')assert(s.ended,'Unstable motion stops at the domain edge, without bouncing');
  const eq=plane.equilibria(model)[0],rest=dynamics.create([eq.qx,eq.qy],[0,0],sample);dynamics.advance(rest,2,sample,[[-1.6,1.6],[-1.6,1.6]]);near(rest.q[0],eq.qx);near(rest.q[1],eq.qy);
}
const outward=dynamics.create([2],[1],harmonic);dynamics.advance(outward,.1,harmonic,[[-2,2]]);assert(outward.ended);near(outward.t,0);near(outward.w[0],1);
assert.throws(()=>dynamics.advance(dynamics.create([0],[0],harmonic),NaN,harmonic,[[-2,2]]));
console.log('Particle dynamics: analytic harmonic motion, energy conservation, two-dimensional equilibria, atomic oscillations and exact boundary events passed.');

let width=640,frameId=0,typesetCount=0;
const nodes=new Map(),frames=new Map(),errors=[],docEvents={},plots=new Map();
function canvasContext(id) {
  let points=[];const strokes=[],circles=[],fills=[];
  const context=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    return (...args)=>{
      for(const n of args.flat())if(typeof n==='number')assert(Number.isFinite(n),'finite canvas coordinate');
      if(key==='clearRect'){strokes.length=0;circles.length=0;fills.length=0;}
      if(key==='beginPath')points=[];
      if(key==='moveTo'||key==='lineTo')points.push([...args]);
      if(key==='arc')circles.push([...args]);
      if(key==='setLineDash')target.dash=[...args[0]];
      if(key==='stroke')strokes.push({points,color:target.strokeStyle,width:target.lineWidth,dash:target.dash});
      if(key==='fill')fills.push({points,color:target.fillStyle});
    };
  }});plots.set(id,{context,strokes,circles,fills});return context;
}
class Element {
  constructor(tag='span'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.events={};this.classList={add(){}};this.hidden=false;this.value='';this.checked=false;}
  set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}
  querySelector(tag){return this.children.find(el=>el.tag===tag);}
  cloneNode(deep){const el=new Element(this.tag);el.attrs={...this.attrs};el.style={...this.style};el.dataset={...this.dataset};if(deep)el.children=this.children.map(c=>typeof c==='string'?c:c.cloneNode(true));return el;}
  addEventListener(k,fn){this.events[k]=fn;}fire(k,args={}){this.events[k]?.({target:this,preventDefault(){},...args});}click(){this.fire('click');}
  closest(){return null;}setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=undefined;}
  getBoundingClientRect(){return {left:0,top:0,width,height:['plane-surface','surface-canvas'].includes(this.id)?Math.min(500,Math.max(320,width-20)):['plane-map','plane-canvas'].includes(this.id)?Math.min(460,Math.max(260,width-40)):this.id?.startsWith('stage')?150:this.id?.startsWith('force')?215:255};}
  getContext(){return plots.get(this.id)?.context||canvasContext(this.id);}
}
for(const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const el=new Element(match[1]);el.id=match[3];el.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';
  el.checked=/\bchecked\b/.test(match[2]);el.hidden=/\bhidden\b/.test(match[2]);
  for(const attr of ['min','max','step'])el[attr]=new RegExp('\\b'+attr+'="([^"]*)"').exec(match[2])?.[1]||'';
  el.dataset.tex=/\bdata-tex="([^"]*)"/.exec(match[2])?.[1];
}
const $=id=>{assert(nodes.has(id),'missing '+id);return nodes.get(id);};
const staticMath=[...html.matchAll(/\bdata-tex="([^"]*)"/g)].map(match=>{const el=new Element();el.dataset.tex=match[1];return el;});
$('model-select').value='wells';$('speed').value='1';$('dimension').value='1';$('plane-model').value='bowl';
let convertTex;
if(process.env.PHYS1985_MATHJAX_ROOT) {
  const root=process.env.PHYS1985_MATHJAX_ROOT;
  const {mathjax}=require(path.join(root,'mathjax.js')), {TeX}=require(path.join(root,'input/tex.js')), {SVG}=require(path.join(root,'output/svg.js'));
  const adaptor=require(path.join(root,'adaptors/liteAdaptor.js')).liteAdaptor();
  require(path.join(root,'handlers/html.js')).RegisterHTMLHandler(adaptor);
  require(path.join(root,'input/tex/ams/AmsConfiguration.js'));require(path.join(root,'input/tex/newcommand/NewcommandConfiguration.js'));
  const doc=mathjax.document('',{InputJax:new TeX({packages:['base','ams','newcommand']}),OutputJax:new SVG({fontCache:'none'})});
  function convert(n){const el=new Element(n.kind);for(const {name,value} of adaptor.allAttributes(n))el.setAttribute(name,value);el.append(...adaptor.childNodes(n).filter(c=>c.kind!=='#text').map(convert));return el;}
  convertTex=text=>{const out=doc.convert(text,{display:false});assert(!adaptor.outerHTML(out).includes('data-mml-node="merror"'),'valid TeX: '+text);return convert(out);};
}
function typeset(text) {
  typesetCount++;assert(!/[\x00-\x1f]/.test(text),'no accidental TeX escape control characters');assert(!text.includes('NaN'));
  if(convertTex)return convertTex(text);
  const out=new Element('mjx-container'),svg=new Element('svg'),g=new Element('g');
  svg.setAttribute('viewBox','0 -700 500 722');svg.setAttribute('width','1.131ex');svg.append(g);out.append(svg);return out;
}
const document={readyState:'complete',getElementById:$,createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),
  querySelectorAll:()=>[...nodes.values()].filter(el=>el.dataset.tex).concat(staticMath),addEventListener:(event,fn)=>{docEvents[event]=fn;}};
const context={document,window:{devicePixelRatio:1},console:{error:e=>errors.push(e)},ResizeObserver:class{observe(){}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  MathJax:{startup:{promise:Promise.resolve(),document:{updateDocument(){}}},tex2svg:typeset}};
const tick=t=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(t));};
const value=id=>parseFloat($(id).dataset.number);
const forceArrows=()=>plots.get('stage-canvas').strokes.filter(s=>s.color==='#7758a6'&&s.width===2.5);
const arrowLength=shaft=>Math.abs(shaft.points[1][0]-shaft.points[0][0]);
const parabolas=kind=>plots.get(kind+'-canvas').strokes.filter(s=>s.color==='#2775b6'&&s.width===2.2);
function checkParabola(stable) {
  assert(!$('quadratic-legend').hidden && !$('quadratic-note').hidden);
  assert.equal(parabolas('potential').length,1);
  assert.equal(parabolas('force').length,0,'No approximation on the force curve');
  const p=parabolas('potential')[0],center=plots.get('potential-canvas').circles.at(-1);
  assert.equal(p.points.length,81);
  assert.deepEqual([...p.dash],[6,4]);
  near(p.points[40][0],center[0],1e-5);near(p.points[40][1],center[1],1e-5);
  for (const i of [0,80]) assert(stable?p.points[i][1]<center[1]:p.points[i][1]>center[1]);
  assert(p.points.every(([x])=>x>=64&&x<=width-24));
  const coefficient=(p.points[80][1]-center[1])/(p.points[80][0]-center[0])**2;
  for (const i of [10,25,55,70]) near(p.points[i][1]-center[1],coefficient*(p.points[i][0]-center[0])**2,1e-8);
}
function checkEquilibriumCaptions(model,energy=models.definitions[model].energy,length=models.definitions[model].length) {
  const eq=models.equilibria(model),c=models.definitions[model].coordinate;
  assert.equal($('equilibrium-buttons').children.length,eq.length);
  $('equilibrium-buttons').children.forEach((button,i)=>{
    const curvature=models.evaluate(model,eq[i].q,energy,length).curvature;
    const formula=button.children[2].dataset.math;
    assert(formula.startsWith("U''("+c+"_e)="+curvature.toFixed(3)));
    assert(formula.includes(String.raw`\mathrm{N\,m^{-1}}`));
    assert(formula.endsWith(curvature>0?' > 0':' < 0'));
    assert.equal(button.dataset.stability,eq[i].stability);
  });
}
function checkArrowGeometry(F,model) {
  const forceUnit=model==='pair'?1e-12:1;
  const arrows=forceArrows(),factor=parseFloat($('force-scale-arrow').style.width)/(value('force-scale-value')*forceUnit);
  assert(Number.isFinite(factor)&&factor>0,'positive finite force scale');
  assert.equal(arrows.length,model!=='wells'?4:2);
  for(let i=0;i<arrows.length;i+=2) {
    const [shaft,head]=arrows.slice(i,i+2);
    near(arrowLength(shaft),factor*Math.abs(F),1e-8); // Linear length; no per-force saturation.
    assert.deepEqual(shaft.points[1],head.points[1],'head at endpoint');
    near(Math.sign(shaft.points[1][0]-shaft.points[0][0]),Math.sign(F)*(model!=='wells'&&i===0?-1:1));
    for(const stroke of [shaft,head])for(const [x] of stroke.points)assert(x>=15&&x<=width-15,'arrow stays in the scene');
  }
  if(model!=='wells') {
    near(arrowLength(arrows[0]),arrowLength(arrows[2]));
    if(F<0)assert(arrows[0].points[1][0]+24<arrows[2].points[1][0],'attraction arrows remain distinct');
  }
  return factor;
}
async function checkUI(){
  vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(errors,[]);assert($('loading').hidden);
  for(const model of ['wells','pair','gravity'])for(const viewport of [240,300,640,1100]) {
    width=viewport;$('model-select').value=model;$('model-select').fire('change');
    assert.equal($('body-1').hidden,model==='wells');
    assert.equal($('argon-reference').hidden,model!=='pair');
    assert.equal($('no-equilibrium').hidden,model!=='gravity');
    const c=models.definitions[model].coordinate;
    assert.equal($('equilibrium-condition').dataset.math,"U'("+c+"_e)=0");
    assert.equal($('stability-positive').dataset.math,"U''("+c+"_e)>0");
    assert.equal($('stability-negative').dataset.math,"U''("+c+"_e)<0");
    assert.equal($('stability-zero').dataset.math,"U''("+c+"_e)=0");
    assert($('stability-linear-force').dataset.math.includes("-U''("+c+"_e)"));
    checkEquilibriumCaptions(model);
    let fixedFactor;
    const d=models.definitions[model],u=model==='pair'?{energy:1e-21,length:1e-9,force:1e-12}:{energy:1,length:1,force:1};
    const initialPosition=d.start*d.length/u.length, ys={potential:[],force:[]};
    near(Number($('length-scale').value),d.length/u.length,1e-12);
    near(Number($('energy-scale').value),d.energy/u.energy,1e-12);
    near(value('length-value'),d.length/u.length,1e-12);
    for(const q of [d.min,d.start,d.max,...Array.from({length:31},(_,i)=>d.min+(d.max-d.min)*(i+.37)/31)]) {
      $('position').value=q;$('position').fire('input');const s=models.evaluate(model,q);
      assert($('quadratic-legend').hidden && $('quadratic-note').hidden);
      assert.equal(parabolas('potential').length,0,'Parabola appears only at equilibrium');
      near(value('force-value'),s.F/u.force,.00051);near(value('potential-value'),s.U/u.energy,.00051);near(value('slope-value'),-s.F/u.force,.00051);
      near(value('position-value'),s.position/u.length,.00051);
      for(const kind of ['potential','force'])ys[kind].push(plots.get(kind+'-canvas').circles.at(-1)[1]);
      const factor=checkArrowGeometry(s.F,model);
      for(const layer of ['potential-labels','force-labels']){
        const ticks=$(layer).children.filter(el=>!el.hidden&&parseFloat(el.style.left)===36);
        const zero=ticks.filter(el=>el.dataset.math==='0');assert.equal(zero.length,1);
        assert(ticks.every(el=>el===zero[0]||Math.abs(parseFloat(el.style.top)-parseFloat(zero[0].style.top))>=22),'vertical zero is not overlapped');
      }
      if(fixedFactor===undefined)fixedFactor=factor;else near(factor,fixedFactor,1e-12);
      for(const id of ['position-value','energy-value','length-value','potential-value','slope-value','force-value','force-scale-value']) {
        assert(!$(id).dataset.number.split('|')[0].includes(','),'decimal dots');assert.equal($(id).children.length,1);assert.equal($(id).children[0].tag,'svg','one shared numeric baseline');
      }
    }
    for(const kind of ['potential','force'])assert(Math.max(...ys[kind])-Math.min(...ys[kind])>80,'atomic curves keep a visible vertical range');
    if(model==='pair') {
      assert($('position').attrs['aria-valuetext'].includes('nm'));
      assert($('stage').attrs['aria-label'].includes('pN'));
      assert($('potential-plot').attrs['aria-valuetext'].includes('10^-21 J'));
      assert($('force-scale-value').dataset.number.includes('pN'));
      assert($('potential-value').dataset.number.includes('10^{-21}'));
      assert($('length-value').dataset.number.startsWith('0.3405|'));
    }
    const eq=models.equilibria(model);
    $('equilibrium-buttons').children.forEach((button,i)=>{
      button.click();near(value('force-value'),0);
      assert.equal($('state-badge').textContent,eq[i].stable?'Équilibre stable':'Équilibre instable');
      assert.equal(forceArrows().length,0);
      assert(!$('equilibrium-curvature').hidden);
      assert.equal($('equilibrium-curvature').dataset.math,button.children[2].dataset.math);
      assert($('observation-text').textContent.includes(eq[i].stable?'positive':'négative'));
      checkParabola(eq[i].stable);
      assert($('quadratic-formula').dataset.math.includes("U''("+d.coordinate+"_e)"));
    });
    if(model==='pair') {near(value('position-value'),.382,.0001);near(value('potential-value'),-1.654,.0001);}
    $('restart').click();const old=value('force-value');
    assert($('equilibrium-curvature').hidden,'No equilibrium criterion is applied away from equilibrium');
    assert($('quadratic-note').hidden && parabolas('potential').length===0,'Leave equilibrium: hide parabola');
    $('energy-scale').value=2*d.energy/u.energy;$('energy-scale').fire('input');near(value('force-value'),old*2,.002);
    $('length-scale').value=1.2*d.length/u.length;$('length-scale').fire('input');near(value('force-value'),old*2/1.2,.002);near(value('position-value'),initialPosition*1.2,.001);
    // Changing physical parameters may fit a new scale, but never individual
    // positions. Test extremes, signs and a very small nonzero force as well.
    for(const energy of [Number($('energy-scale').min),Number($('energy-scale').max)])for(const length of [Number($('length-scale').min),Number($('length-scale').max)]) {
      $('energy-scale').value=energy;$('energy-scale').fire('input');
      $('length-scale').value=length;$('length-scale').fire('input');
      checkEquilibriumCaptions(model,energy*u.energy,length*u.length);
      let scale;
      for(const q of [d.min,d.max,d.start,...eq.map(e=>e.q+.0001)]) {
        $('position').value=q;$('position').fire('input');
        const s=models.evaluate(model,q,energy*u.energy,length*u.length);
        near(value('force-value'),s.F/u.force,.00051);near(value('potential-value'),s.U/u.energy,.00051);
        const next=checkArrowGeometry(s.F,model);
        if(scale===undefined)scale=next;else near(next,scale,1e-10);
      }
    }
    $('reset').click();
    const probeBefore=value('position-value');
    $('body-0').fire('keydown',{key:'ArrowRight'});assert(model!=='wells'?value('position-value')<probeBefore:value('position-value')>probeBefore);
    const x=parseFloat($('body-0').style.left);
    $('body-0').fire('pointerdown',{pointerId:1,clientX:x,button:0});$('body-0').fire('pointermove',{pointerId:1,clientX:x+15});$('body-0').fire('pointerup',{pointerId:1});
    assert.equal($('body-0').capture,undefined,'pointer capture is released');
    const beforePlot=value('position-value');
    $('potential-plot').fire('pointerdown',{pointerId:3,clientX:width/2,button:0});
    $('potential-plot').fire('pointermove',{pointerId:3,clientX:width-24});
    $('potential-plot').fire('pointerup',{pointerId:3});
    near(value('position-value'),d.max*d.length/u.length,.001);
    $('force-plot').fire('keydown',{key:'Home'});near(value('position-value'),d.min*d.length/u.length,.001);
    near(plots.get('potential-canvas').circles.at(-1)[0],plots.get('force-canvas').circles.at(-1)[0],1e-12);
    const before=[$('position-value').dataset.number,$('force-value').dataset.number,$('body-0').style.left];
    for(const id of ['tangent','equilibria','forces']) {$(id).checked=false;$(id).fire('change');}
    assert.deepEqual([$('position-value').dataset.number,$('force-value').dataset.number,$('body-0').style.left],before,'display options leave the same physical configuration');
    assert.equal(forceArrows().length,0);
    assert($('force-scale-key').hidden,'hide scale with force vectors');
    for(const id of ['tangent','equilibria','forces']) {$(id).checked=true;$(id).fire('change');}
    assert(!$('force-scale-key').hidden);
    $('restart').click();$('play').click();tick(0);
    for(let i=1;i<=900;i++)tick(i*1000/60);
    assert.equal($('play').textContent,'Pause');assert.equal(frames.size,1);
    assert(Number($('position').value)>=models.definitions[model].min&&Number($('position').value)<=models.definitions[model].max);
    $('play').click();assert.equal(frames.size,0);const paused=$('position-value').dataset.number;tick(20000);assert.equal($('position-value').dataset.number,paused);
    $('restart').click();near(value('position-value'),initialPosition,.001);
  }
  // Switching out of the atomic example must not leak nanometre defaults.
  $('model-select').value='wells';$('model-select').fire('change');near(value('length-value'),1);near(value('energy-value'),1);assert(!$('position-value').dataset.number.includes('nm'));
  $('play').click();document.hidden=true;docEvents.visibilitychange();assert.equal(frames.size,0);assert.equal($('play').textContent,'Balayer');
  document.hidden=false;
  const oldPosition=value('position-value');$('dimension').value='2';$('dimension').fire('change');
  assert($('view-1d').hidden&&$('controls-1d').hidden&&!$('view-2d').hidden&&!$('controls-2d').hidden);assert.equal(frames.size,0);
  const set=(id,v)=>{$(id).value=v;$(id).fire('input');};
  for(const model of Object.keys(plane.definitions))for(const viewport of [240,640,1100]){
    width=viewport;$('plane-model').value=model;$('plane-model').fire('change');let fixedScale;
    for(const [x,y]of [[.7,.4],[-1.6,-1.6],[1.6,1.6],[-1.6,1.6],[0,.6]]){
      set('plane-x',x);set('plane-y',y);const s=plane.evaluate(model,x,y);
      near(value('plane-U'),s.U,.00051);near(value('plane-Fx'),s.Fx,.00051);near(value('plane-Fy'),s.Fy,.00051);near(value('plane-norm'),Math.hypot(s.Fx,s.Fy),.00051);
      const k=parseFloat($('plane-scale-arrow').style.width)/value('plane-scale-value');if(fixedScale===undefined)fixedScale=k;else near(k,fixedScale,1e-9);
      const map=plots.get('plane-canvas'),point=map.circles.at(-1),g=plane.geometry(width,$('plane-map').getBoundingClientRect().height,model==='saddle'?48:0);near(point[0],g.X(x));near(point[1],g.Y(y));
      if(model==='saddle'&&x===.7&&y===.4)assert(k*Math.hypot(s.Fx,s.Fy)>(width<450?13:26),'Saddle force remains clearly visible at a typical non-equilibrium point');
      const head=map.fills.find(f=>f.color==='#7758a6');assert(head);near(head.points[0][0],point[0]+k*s.Fx,1e-8);near(head.points[0][1],point[1]-k*s.Fy,1e-8);
      for(const [px,py]of head.points){assert(px>=0&&px<=width);assert(py>=0&&py<=$('plane-map').getBoundingClientRect().height);}
      assert($('plane-hessian').hidden);
      for(const axis of ['x','y']){assert.equal(parabolas('plane-'+axis).length,0);const zero=$('plane-'+axis+'-labels').children.filter(n=>!n.hidden&&n.dataset.math==='0'&&parseFloat(n.style.left)===37);assert.equal(zero.length,1);}
    }
    $('plane-equilibria').children.forEach((button,i)=>{button.click();near(value('plane-norm'),0);assert(!$('plane-hessian').hidden);assert.equal(parabolas('plane-x').length,1);assert.equal(parabolas('plane-y').length,1);assert(!$('plane-eigenvalues').dataset.math.includes('NaN'));assert($('plane-status').textContent.includes(plane.equilibria(model)[i].stable?'stable':'Col'));});
    assert($('plane-slope-explanation').hidden,'Hide the generic slope sentence at an equilibrium');
    set('plane-x',.7);set('plane-y',.4);set('plane-energy',2);set('plane-length',1.5);const s=plane.evaluate(model,.7,.4,2,1.5);near(value('plane-Fx'),s.Fx,.00051);near(value('plane-Fy'),s.Fy,.00051);near(value('plane-x-value'),1.05);near(value('plane-y-value'),.6);
    const stable=[$('plane-U').dataset.number,$('plane-Fx').dataset.number,$('plane-Fy').dataset.number,...plots.get('plane-canvas').circles.at(-1)];
    $('plane-force').checked=false;$('plane-force').fire('change');assert($('plane-scale-key').hidden);assert(!plots.get('plane-canvas').fills.some(f=>f.color==='#7758a6'));
    $('plane-contours').checked=false;$('plane-contours').fire('change');assert.deepEqual([$('plane-U').dataset.number,$('plane-Fx').dataset.number,$('plane-Fy').dataset.number,...plots.get('plane-canvas').circles.at(-1)],stable);
    $('plane-force').checked=true;$('plane-contours').checked=true;$('plane-force').fire('change');
    const g=plane.geometry(width,$('plane-map').getBoundingClientRect().height,model==='saddle'?48:0),map=$('plane-map');map.fire('pointerdown',{pointerId:27,button:0,clientX:g.X(-.3),clientY:g.Y(.2)});near(value('plane-x-value'),-.45);near(value('plane-y-value'),.3);map.fire('pointermove',{pointerId:27,clientX:g.X(.5),clientY:g.Y(-.4)});near(value('plane-x-value'),.75);near(value('plane-y-value'),-.6);map.fire('pointercancel',{pointerId:27});assert.equal(map.capture,undefined);
    map.fire('keydown',{key:'ArrowUp'});near(value('plane-y-value'),-.57);map.fire('keydown',{key:'Home'});near(value('plane-x-value'),0);near(value('plane-y-value'),0);
    $('plane-x-plot').fire('keydown',{key:'End'});near(value('plane-x-value'),2.4);$('plane-y-plot').fire('keydown',{key:'Home'});near(value('plane-y-value'),-2.4);
    $('plane-reset').click();near(value('plane-energy-value'),1);near(value('plane-length-value'),1);
  }
  assert(!$('plane-slope-explanation').hidden);assert(staticMath.some(el=>el.dataset.tex==='-F_x'));assert(staticMath.some(el=>el.dataset.tex==='-F_y'));
  assert($('plane-surface-card').hidden,'3D surface is optional');
  $('plane-show-surface').checked=true;$('plane-show-surface').fire('change');assert(!$('plane-surface-card').hidden);
  for(const model of Object.keys(plane.definitions))for(const viewport of [240,640,1100]){
    width=viewport;$('plane-model').value=model;$('plane-model').fire('change');
    const before=['plane-U','plane-Fx','plane-Fy'].map(id=>$(id).dataset.number),surfaceEl=$('plane-surface');
    surfaceEl.fire('pointerdown',{pointerId:88,button:0,clientX:width/2,clientY:120});surfaceEl.fire('pointermove',{pointerId:88,clientX:width/2+50,clientY:140});surfaceEl.fire('pointerup',{pointerId:88,clientX:width/2+50,clientY:140});assert.equal(surfaceEl.capture,undefined);assert.deepEqual(['plane-U','plane-Fx','plane-Fy'].map(id=>$(id).dataset.number),before,'Rotating does not select or alter the potential');
    $('surface-reset').click();
    const labels=$('surface-labels').children.filter(el=>!el.hidden);assert(labels.some(el=>el.dataset.math==='0'),'Energy zero is labelled in the perspective view');
    $('surface-top').click();const mesh=heightField.mesh(model,1),pr=heightField.projection(width,surfaceEl.getBoundingClientRect().height,mesh.low,mesh.high,{azimuth:0,elevation:Math.PI/2}),p=pr.project(.32,-.24,plane.evaluate(model,.32,-.24).U);
    surfaceEl.fire('pointerdown',{pointerId:89,button:0,clientX:p[0],clientY:p[1]});surfaceEl.fire('pointerup',{pointerId:89,clientX:p[0],clientY:p[1]});near(value('plane-x-value'),.32);near(value('plane-y-value'),-.24);near(value('plane-U'),plane.evaluate(model,.32,-.24).U,.00051);assert($('surface-point-note').hidden);
    const marker=plots.get('surface-canvas').circles.at(-1);near(marker[0],p[0]);near(marker[1],p[1]);
    const forceScale=heightField.forceFactor(mesh,model,1,1,pr,width,surfaceEl.getBoundingClientRect().height),s=plane.evaluate(model,.32,-.24),tip=pr.project(.32+forceScale*s.Fx,-.24+forceScale*s.Fy,s.U),drawing=plots.get('surface-canvas');
    const head=drawing.fills.find(f=>f.color==='#7758a6');assert(head,'Force appears on the surface');near(head.points[0][0],tip[0]);near(head.points[0][1],tip[1]);
    const shaft=drawing.strokes.find(f=>f.color==='#7758a6'&&f.width===3.5);near(shaft.points[0][0],p[0]);near(shaft.points[0][1],p[1]);
    $('plane-components').checked=false;$('plane-components').fire('change');assert(drawing.fills.some(f=>f.color==='#7758a6'));assert(!drawing.fills.some(f=>['#2775b6','#268576'].includes(f.color)&&f.points.length===4),'Component arrows follow the common option');
    $('plane-force').checked=false;$('plane-force').fire('change');assert(!drawing.fills.some(f=>f.color==='#7758a6'));assert($('surface-force-key').hidden);near(value('plane-U'),s.U,.00051);
    $('plane-force').checked=true;$('plane-components').checked=true;$('plane-force').fire('change');assert(!$('surface-force-key').hidden);
    const after=value('plane-U');surfaceEl.fire('keydown',{key:'ArrowLeft'});near(value('plane-U'),after);surfaceEl.fire('keydown',{key:'Home'});near(value('plane-U'),after);
    surfaceEl.fire('pointerdown',{pointerId:90,button:0,clientX:10,clientY:10});surfaceEl.fire('pointercancel',{pointerId:90});assert.equal(surfaceEl.capture,undefined);near(value('plane-U'),after);
    set('plane-energy',2);set('plane-length',1.5);near(value('plane-U'),2*plane.evaluate(model,.32,-.24).U,.00051);near(value('plane-x-value'),.48);
    $('plane-equilibria').children[0].click();near(value('plane-norm'),0);assert.equal(parabolas('plane-x').length,1);
    assert(!plots.get('surface-canvas').fills.some(f=>f.color==='#7758a6'),'No artificial arrow at zero force');assert.equal($('surface-force-caption').dataset.math,String.raw`\vec F=\vec 0`);
  }
  $('plane-show-surface').checked=false;$('plane-show-surface').fire('change');assert($('plane-surface-card').hidden);
  console.log('3D controller: optional view, mouse/keyboard rotation, reset/top view, point selection, synchronization and physical scale changes passed.');
  $('dimension').value='1';$('dimension').fire('change');assert(!$('view-1d').hidden&&$('view-2d').hidden);near(value('position-value'),oldPosition);
  console.log('2D controller: point/cuts/force synchronization, linear arrows, stability, independent scales, keyboard, drag and 1D return passed.');
  // Real motion is independent of the exploratory sweep, and shares one clock
  // and the same selected point in every view.
  width=640;$('model-select').value='wells';$('model-select').fire('change');
  set('motion-mass',2);set('motion-v0',.4);const x0=value('position-value'),E0=value('motion-energy');
  near(value('motion-kinetic'),.16);$('motion-play').click();tick(0);for(let i=1;i<=120;i++)tick(i*1000/60);
  assert.equal($('motion-play').textContent,'Pause');assert.equal(frames.size,1);assert(Math.abs(value('position-value')-x0)>.01);near(value('motion-time'),2,.02);near(value('motion-energy'),E0,.002);
  $('motion-play').click();const pausedX=value('position-value'),pausedT=value('motion-time');assert.equal(frames.size,0);tick(5000);near(value('position-value'),pausedX);near(value('motion-time'),pausedT);
  $('motion-play').click();tick(6000);tick(6016);$('motion-play').click();assert(value('motion-time')>pausedT,'Pause resumes without resetting time');
  $('motion-restart').click();near(value('position-value'),x0);near(value('motion-time'),0);near(value('motion-kinetic'),.16);
  $('motion-play').click();tick(0);tick(20);$('position').value=.4;$('position').fire('input');assert.equal(frames.size,0);near(value('motion-time'),0);$('motion-play').click();document.hidden=true;docEvents.visibilitychange();assert.equal(frames.size,0);document.hidden=false;
  for(const model of ['pair','gravity']){
    $('model-select').value=model;$('model-select').fire('change');const start=value('position-value');assert($('motion-mass').hidden);near(value('motion-kinetic'),0);
    $('motion-play').click();tick(0);for(let i=1;i<=30;i++)tick(i*1000/60);$('motion-play').click();
    assert(value('position-value')<start,'Attraction drives the separation, not the sweep');near(value('motion-time'),model==='pair'?.5:50,.02);
    $('motion-restart').click();near(value('position-value'),start);near(value('motion-time'),0);
  }
  $('dimension').value='2';$('dimension').fire('change');$('plane-model').value='bowl';$('plane-model').fire('change');
  $('plane-show-surface').checked=true;$('plane-show-surface').fire('change');set('motion-mass',1);set('motion-v0',.3);set('motion-angle',90);
  const initialXY=[value('plane-x-value'),value('plane-y-value')];near(value('motion-kinetic'),.045);$('motion-play').click();tick(0);for(let i=1;i<=60;i++)tick(i*1000/60);
  const trajectory=plots.get('plane-canvas').strokes.find(s=>s.color==='#8495a7');assert(trajectory&&trajectory.points.length>30);assert(plots.get('surface-canvas').strokes.some(s=>s.color==='#8495a7'));
  const g=plane.geometry(width,$('plane-map').getBoundingClientRect().height);near(trajectory.points[0][0],g.X(initialXY[0]));near(trajectory.points[0][1],g.Y(initialXY[1]));
  const movingT=value('motion-time');$('surface-top').click();assert.equal($('motion-play').textContent,'Pause');near(value('motion-time'),movingT,1e-9);
  $('motion-play').click();$('motion-restart').click();near(value('plane-x-value'),initialXY[0]);near(value('plane-y-value'),initialXY[1]);
  $('plane-model').value='saddle';$('plane-model').fire('change');set('plane-x',0);set('plane-y',1.5);set('motion-v0',3);set('motion-angle',90);$('motion-play').click();tick(0);tick(50);
  assert.equal(frames.size,0);assert.equal($('motion-play').textContent,'Lire');near(value('plane-y-value'),1.6,.001);assert($('motion-status').textContent.includes('bord'));$('motion-play').click();assert.equal(frames.size,0);
  $('motion-restart').click();near(value('plane-y-value'),1.5);near(value('motion-time'),0);
  $('motion-play').click();$('dimension').value='1';$('dimension').fire('change');assert.equal(frames.size,0,'Switching dimensions pauses motion');
  console.log('Dynamics UI: physical play/pause/resume, initial velocity and mass, restart, atomic/gravity clocks, synchronized trajectory, camera interaction and boundary stop passed.');
  assert.deepEqual(errors,[]);
  console.log('Potential controllers: synchronized plots, arrows, equilibria, scales, pointer/keyboard input, display options, numeric baselines and continuous sweep passed'+(convertTex?' with real MathJax SVG.':'.'));
}
checkUI().catch(error=>{console.error(error);process.exitCode=1;});

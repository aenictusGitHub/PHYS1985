/* Physics and controller regression tests. No browser or production dependency.
 * Optional PHYS1985_MATHJAX_ROOT points to mathjax-full/js for real SVG checks. */
const assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const zip=path.join(__dirname,'..','potentiel_force_webapp_fr.zip');
const read=file=>execFileSync('unzip',['-p',zip,'potentiel_force_webapp_fr_source/'+file],{encoding:'utf8'});
const source=read('app.js'),html=read('index.html');
const models=vm.runInNewContext(source.split("if (typeof document")[0]+';PotentialModels');
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
for(const model of ['wells','pair']) {
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
    assert.equal(equilibria.length,model==='wells'?3:1);
    for(const eq of equilibria) {
      const s=models.evaluate(model,eq.q,energy,length);near(s.F,0,1e-10);
      const before=models.evaluate(model,eq.q-.001,energy,length),after=models.evaluate(model,eq.q+.001,energy,length);
      assert(eq.stable ? before.F>0&&after.F<0 : before.F<0&&after.F>0);
      assert.equal(s.curvature>0,eq.stable);
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
assert.throws(()=>models.evaluate('wells',NaN));
console.log('Potential physics: analytical gradients, curvature, stable/unstable equilibria, pair minimum and bounded sweep passed.');

let width=640,frameId=0,typesetCount=0;
const nodes=new Map(),frames=new Map(),errors=[],docEvents={},plots=new Map();
function canvasContext(id) {
  let points=[];const strokes=[],circles=[];
  const context=new Proxy({}, {get(target,key){
    if(key in target)return target[key];
    return (...args)=>{
      for(const n of args.flat())if(typeof n==='number')assert(Number.isFinite(n),'finite canvas coordinate');
      if(key==='clearRect'){strokes.length=0;circles.length=0;}
      if(key==='beginPath')points=[];
      if(key==='moveTo'||key==='lineTo')points.push([...args]);
      if(key==='arc')circles.push([...args]);
      if(key==='stroke')strokes.push({points,color:target.strokeStyle,width:target.lineWidth});
    };
  }});plots.set(id,{context,strokes,circles});return context;
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
  getBoundingClientRect(){return {left:0,top:0,width,height:this.id?.startsWith('stage')?150:this.id?.startsWith('force')?215:255};}
  getContext(){return plots.get(this.id)?.context||canvasContext(this.id);}
}
for(const match of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
  const el=new Element(match[1]);el.id=match[3];el.value=/\bvalue="([^"]*)"/.exec(match[2])?.[1]||'';
  el.checked=/\bchecked\b/.test(match[2]);el.hidden=/\bhidden\b/.test(match[2]);
  el.dataset.tex=/\bdata-tex="([^"]*)"/.exec(match[2])?.[1];
}
const $=id=>{assert(nodes.has(id),'missing '+id);return nodes.get(id);};
$('model-select').value='wells';$('speed').value='1';
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
  querySelectorAll:()=>[...nodes.values()].filter(el=>el.dataset.tex),addEventListener:(event,fn)=>{docEvents[event]=fn;}};
const context={document,window:{devicePixelRatio:1},console:{error:e=>errors.push(e)},ResizeObserver:class{observe(){}},
  requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
  MathJax:{startup:{promise:Promise.resolve(),document:{updateDocument(){}}},tex2svg:typeset}};
const tick=t=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(t));};
const value=id=>parseFloat($(id).dataset.number);
const forceArrows=()=>plots.get('stage-canvas').strokes.filter(s=>s.color==='#7758a6'&&s.width===2.5);
async function checkUI(){
  vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(errors,[]);assert($('loading').hidden);
  for(const model of ['wells','pair'])for(const viewport of [300,640]) {
    width=viewport;$('model-select').value=model;$('model-select').fire('change');
    assert.equal($('body-1').hidden,model!=='pair');
    for(const q of [models.definitions[model].min,models.definitions[model].start,models.definitions[model].max]) {
      $('position').value=q;$('position').fire('input');const s=models.evaluate(model,q);
      near(value('force-value'),s.F,.00051);near(value('potential-value'),s.U,.00051);near(value('slope-value'),-s.F,.00051);
      const arrows=forceArrows();assert.equal(arrows.length,model==='pair'?4:2);
      for(let i=0;i<arrows.length;i+=2){const [shaft,head]=arrows.slice(i,i+2);assert.deepEqual(shaft.points[1],head.points[1],'head at endpoint');near(Math.sign(shaft.points[1][0]-shaft.points[0][0]),Math.sign(s.F)*(model==='pair'&&i===0?-1:1));}
      if(model==='pair')near(Math.abs(arrows[0].points[1][0]-arrows[0].points[0][0]),Math.abs(arrows[2].points[1][0]-arrows[2].points[0][0]));
      for(const id of ['position-value','energy-value','length-value','potential-value','slope-value','force-value']) {
        assert(!$(id).dataset.number.split('|')[0].includes(','),'decimal dots');assert.equal($(id).children.length,1);assert.equal($(id).children[0].tag,'svg','one shared numeric baseline');
      }
    }
    const eq=models.equilibria(model);
    $('equilibrium-buttons').children.forEach((button,i)=>{button.click();near(value('force-value'),0);assert($('state-badge').textContent.includes(eq[i].stable?'stable':'instable'));assert.equal(forceArrows().length,0);});
    $('restart').click();const old=value('force-value');
    $('energy-scale').value='2';$('energy-scale').fire('input');near(value('force-value'),old*2,.002);
    $('length-scale').value='2';$('length-scale').fire('input');near(value('force-value'),old,.002);near(value('position-value'),models.definitions[model].start*2,.001);
    $('reset').click();
    const probeBefore=value('position-value');
    $('body-0').fire('keydown',{key:'ArrowRight'});assert(model==='pair'?value('position-value')<probeBefore:value('position-value')>probeBefore);
    const x=parseFloat($('body-0').style.left);
    $('body-0').fire('pointerdown',{pointerId:1,clientX:x,button:0});$('body-0').fire('pointermove',{pointerId:1,clientX:x+15});$('body-0').fire('pointerup',{pointerId:1});
    assert.equal($('body-0').capture,undefined,'pointer capture is released');
    const beforePlot=value('position-value');
    $('potential-plot').fire('pointerdown',{pointerId:3,clientX:width/2,button:0});
    $('potential-plot').fire('pointermove',{pointerId:3,clientX:width-24});
    $('potential-plot').fire('pointerup',{pointerId:3});
    near(value('position-value'),models.definitions[model].max,.001);
    $('force-plot').fire('keydown',{key:'Home'});near(value('position-value'),models.definitions[model].min,.001);
    near(plots.get('potential-canvas').circles.at(-1)[0],plots.get('force-canvas').circles.at(-1)[0],1e-12);
    const before=[$('position-value').dataset.number,$('force-value').dataset.number,$('body-0').style.left];
    for(const id of ['tangent','equilibria','forces']) {$(id).checked=false;$(id).fire('change');}
    assert.deepEqual([$('position-value').dataset.number,$('force-value').dataset.number,$('body-0').style.left],before,'display options leave the same physical configuration');
    assert.equal(forceArrows().length,0);
    for(const id of ['tangent','equilibria','forces']) {$(id).checked=true;$(id).fire('change');}
    $('restart').click();$('play').click();tick(0);
    for(let i=1;i<=900;i++)tick(i*1000/60);
    assert.equal($('play').textContent,'Pause');assert.equal(frames.size,1);
    assert(Number($('position').value)>=models.definitions[model].min&&Number($('position').value)<=models.definitions[model].max);
    $('play').click();assert.equal(frames.size,0);const paused=$('position-value').dataset.number;tick(20000);assert.equal($('position-value').dataset.number,paused);
    $('restart').click();near(value('position-value'),models.definitions[model].start,.001);
  }
  $('play').click();document.hidden=true;docEvents.visibilitychange();assert.equal(frames.size,0);assert.equal($('play').textContent,'Balayer');
  assert.deepEqual(errors,[]);
  console.log('Potential controllers: synchronized plots, arrows, equilibria, scales, pointer/keyboard input, display options, numeric baselines and continuous sweep passed'+(convertTex?' with real MathJax SVG.':'.'));
}
checkUI().catch(error=>{console.error(error);process.exitCode=1;});

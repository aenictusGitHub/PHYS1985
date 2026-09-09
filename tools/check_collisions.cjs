/* Controller adapter, not browser visual QA. Optional real MathJax conversion. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const zip=path.join(__dirname,'..','collisions_webapp_fr.zip');
const readSource=file=>execFileSync('unzip',['-p',zip,'collisions_webapp_fr_source/'+file],{encoding:'utf8'});
const source=readSource('physics.js')+'\n'+readSource('app.js'),html=readSource('index.html');
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
let width=700,frameId=0,clock=0;const nodes=new Map(),frames=new Map(),plots=new Map(),errors=[],events={},tools=new Map();
function canvasContext(id){let points=[];const strokes=[],fills=[],operations=[];const context=new Proxy({}, {get(target,key){if(key in target)return target[key];return (...args)=>{for(const n of args.flat())if(typeof n==='number')assert(Number.isFinite(n),'finite geometry');if(key==='clearRect'){strokes.length=0;fills.length=0;operations.length=0;}if(key==='beginPath')points=[];if(key==='moveTo'||key==='lineTo'||key==='arc')points.push([...args]);if(key==='createRadialGradient')return {type:'radial',args,stops:[],addColorStop(offset,color){this.stops.push([offset,color]);}};if(key==='stroke'){const item={points,color:target.strokeStyle,width:target.lineWidth};strokes.push(item);operations.push(item);}if(key==='fill'){const item={points,color:target.fillStyle};fills.push(item);operations.push(item);}};}});plots.set(id,{context,strokes,fills,operations});return context;}
class Element{
  constructor(tag='span'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.events={};this.classList={add(){}};this.value='';this.hidden=false;this.checked=false;}
  set id(id){this._id=id;nodes.set(id,this);}get id(){return this._id;}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k];}querySelector(tag){return this.children.find(el=>el.tag===tag);}
  cloneNode(deep){const el=new Element(this.tag);el.attrs={...this.attrs};el.style={...this.style};el.dataset={...this.dataset};if(deep)el.children=this.children.map(c=>typeof c==='string'?c:c.cloneNode(true));return el;}
  addEventListener(k,fn){this.events[k]=fn;}fire(k,args={}){this.events[k]?.({target:this,preventDefault(){},...args});}click(){this.fire('click');}closest(){return null;}
  setPointerCapture(id){this.capture=id;}hasPointerCapture(id){return this.capture===id;}releasePointerCapture(){this.capture=undefined;}
  getBoundingClientRect(){
    if(this.className?.startsWith('plot-label')){
      const text=this.dataset.math||'',w=text.includes('=')?68:text.includes('V_C')?44:30,h=32;
      return {left:parseFloat(this.style.left)-w/2,top:parseFloat(this.style.top)-h/2,width:w,height:h};
    }
    return {left:0,top:0,width,height:this.id?.startsWith('scene')?(width<=480?345:385):255};
  }
  getContext(){return plots.get(this.id)?.context||canvasContext(this.id);}
}
for(const m of html.matchAll(/<([\w-]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const el=new Element(m[1]);el.id=m[3];el.value=/\bvalue="([^"]*)"/.exec(m[2])?.[1]||'';el.checked=/\bchecked\b/.test(m[2]);el.hidden=/\bhidden\b/.test(m[2]);}
const $=id=>{assert(nodes.has(id),'missing '+id);return nodes.get(id);};$('dimension').value='line';$('chart-select').value='energy';$('vectors').value='velocity';$('speed').value='1';
const staticMath=[...html.matchAll(/\bdata-tex="([^"]*)"/g)].map(m=>{const el=new Element();el.dataset.tex=m[1];return el;});
let convertTex;
if(process.env.PHYS1985_MATHJAX_ROOT){
  const root=process.env.PHYS1985_MATHJAX_ROOT,{mathjax}=require(path.join(root,'mathjax.js')),{TeX}=require(path.join(root,'input/tex.js')),{SVG}=require(path.join(root,'output/svg.js')),adaptor=require(path.join(root,'adaptors/liteAdaptor.js')).liteAdaptor();require(path.join(root,'handlers/html.js')).RegisterHTMLHandler(adaptor);require(path.join(root,'input/tex/ams/AmsConfiguration.js'));require(path.join(root,'input/tex/newcommand/NewcommandConfiguration.js'));
  const doc=mathjax.document('',{InputJax:new TeX({packages:['base','ams','newcommand']}),OutputJax:new SVG({fontCache:'none'})});
  function convert(n){const el=new Element(n.kind);for(const {name,value}of adaptor.allAttributes(n))el.setAttribute(name,value);el.append(...adaptor.childNodes(n).filter(c=>c.kind!=='#text').map(convert));return el;}
  convertTex=text=>{const out=doc.convert(text,{display:false});assert(!adaptor.outerHTML(out).includes('data-mml-node="merror"'),'valid TeX: '+text);return convert(out);};
}
function typeset(text){assert(!/[\x00-\x1f]/.test(text));assert(!text.includes('NaN'));if(convertTex)return convertTex(text);const out=new Element('mjx-container'),svg=new Element('svg');svg.setAttribute('viewBox','0 -700 500 722');svg.setAttribute('width','1.131ex');svg.append(new Element('g'));out.append(svg);return out;}
const document={readyState:'complete',getElementById:$,createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),querySelectorAll:()=>staticMath,addEventListener:(name,fn)=>events[name]=fn,modelContext:{registerTool(tool){assert(!tools.has(tool.name));tools.set(tool.name,tool);}}};
const context={document,window:{devicePixelRatio:1,addEventListener:(name,fn)=>events[name]=fn},AbortController,console:{error:e=>errors.push(e),warn:e=>errors.push(e)},ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),MathJax:{startup:{promise:Promise.resolve(),document:{updateDocument(){}}},tex2svg:typeset}};

const value=id=>parseFloat($(id).dataset.number),input=(id,v)=>{$(id).value=v;$(id).fire('input');};
const change=(id,v)=>{$(id).value=v;$(id).fire('change');};
const tick=()=>{clock+=1000/60;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(clock));};
function advance(seconds){tick();for(let i=0;i<Math.ceil(seconds*60);i++)tick();}
const read=()=>tools.get('read_collision_experiment').execute({});
function assertClearSceneLabels(fixtureBalls){
  const items=$('scene-labels').children.filter(el=>!el.hidden&&el.dataset.sceneAnnotation).map(el=>({
    name:el.dataset.sceneAnnotation,x:parseFloat(el.style.left),y:parseFloat(el.style.top),
    hw:Number(el.dataset.layoutWidth)/2,hh:Number(el.dataset.layoutHeight)/2,
  }));
  const balls=fixtureBalls||plots.get('scene-canvas').fills.filter(p=>p.color?.type==='radial').map(p=>p.points[0]);
  for(let i=0;i<items.length;i++){
    const a=items[i];
    assert(a.x-a.hw>=7&&a.x+a.hw<=width-7,'Annotation stays inside viewport: '+a.name);
    for(const b of items.slice(i+1)){
      assert(Math.abs(a.x-b.x)>=a.hw+b.hw+8||Math.abs(a.y-b.y)>=a.hh+b.hh+8,
        'Overlapping annotations: '+a.name+' / '+b.name+' at '+JSON.stringify(read().state));
    }
    for(const b of balls){
      const distance=Math.hypot(Math.max(0,Math.abs(b[0]-a.x)-a.hw),Math.max(0,Math.abs(b[1]-a.y)-a.hh));
      assert(distance>=b[2]+6,'Annotation crosses a sphere: '+a.name);
    }
  }
}
async function main(){
  const instrumented=source.replace('    function drawScene(s){','    window.testSceneLabelLayout=placeSceneLabels;\n    function drawScene(s){');
  vm.runInNewContext(instrumented,context);await new Promise(r=>setImmediate(r));assert.deepEqual(errors,[]);assert($('loading').hidden);assert.equal(frames.size,0);assert.equal(tools.size,3);
  // Reproduce the supplied crop: touching large spheres, v1 near m2, C at contact.
  width=458;
  for(const el of $('scene-labels').children)el.hidden=true;
  const requests=[
    {key:'center',symbol:'C',anchor:[228,194],direction:[0,1],gap:23,color:'#607185'},
    {key:'m1',symbol:'m_1',anchor:[170,194],direction:[0,1],gap:77,color:'#2775b6'},
    {key:'m2',symbol:'m_2',anchor:[286,194],direction:[0,-1],gap:77,color:'#429b88'},
    {key:'vector1',symbol:'\\vec v_1',anchor:[248,194],direction:[0,-1],gap:24,color:'#2775b6'},
    {key:'vector2',symbol:'\\vec v_2',anchor:[364,194],direction:[0,1],gap:24,color:'#429b88'},
  ];
  context.window.testSceneLabelLayout(plots.get('scene-canvas').context,requests,[[170,194],[286,194]],57,[[[170,194],[248,194]],[[286,194],[364,194]]],458,385);
  assertClearSceneLabels([[170,194,57],[286,194,57]]);
  width=700;
  const choose=tools.get('select_collision_example'),jump=tools.get('seek_collision_experiment');
  // Fit the entire selected duration before playback, then keep both the scale
  // and origin fixed, regardless of time, collision mode or display options.
  const camera=()=>{const q=read().state,balls=plots.get('scene-canvas').fills.filter(p=>p.color?.type==='radial').map(p=>p.points[0]),scale=balls[0][2]/.35;return {scale,x:balls[0][0]-q.r1[0]*scale,y:balls[0][1]+q.r1[1]*scale};};
  for(const viewport of [280,700])for(const dimension of ['line','plane'])for(const mode of ['elastic','inelastic','sticking'])for(const example of (dimension==='line'?['target','headon','chase','miss']:['offset','headon','cross','miss']))for(const duration of [2,5,12]){
    width=viewport;choose.execute({dimension,example,mode});input('duration',duration);const opening=camera(),labelHistory=new Map();
    const times=Array.from({length:13},(_,i)=>i*duration/12);if(read().collisionTime!==null&&read().collisionTime<=duration)times.push(read().collisionTime);
    for(const time of times){
      jump.execute({time});assertClearSceneLabels();const current=camera();near(current.scale,opening.scale);near(current.x,opening.x);near(current.y,opening.y);
      const sample=read().state;
      for(const el of $('scene-labels').children.filter(el=>!el.hidden&&el.dataset.sceneAnnotation)){
        const key=el.dataset.sceneAnnotation,body=key==='m1'||key==='vector1'?sample.r1:key==='m2'||key==='vector2'?sample.r2:sample.C;
        const anchor=key==='normal'?[0,0]:[current.x+body[0]*current.scale,current.y-body[1]*current.scale];
        const q=[parseFloat(el.style.left),parseFloat(el.style.top)],previous=labelHistory.get(key);
        if(previous){
          assert.equal(el.dataset.layoutOffset,previous.offset,'No side switching in motion: '+key);
          assert.equal(el.dataset.layoutFixed,previous.fixed,'No changing label dock in motion: '+key);
          assert(Math.hypot(q[0]-previous.q[0],q[1]-previous.q[1])<=Math.hypot(anchor[0]-previous.anchor[0],anchor[1]-previous.anchor[1])+1e-6,'Label movement cannot jump ahead of its body: '+key);
        }
        labelHistory.set(key,{q,anchor,offset:el.dataset.layoutOffset,fixed:el.dataset.layoutFixed});
      }
      const height=width<=480?345:385;
      for(const ball of plots.get('scene-canvas').fills.filter(p=>p.color?.type==='radial').map(p=>p.points[0]))assert(ball[0]-ball[2]>=0&&ball[0]+ball[2]<=width&&ball[1]-ball[2]>=0&&ball[1]+ball[2]<=height,'entire ball remains in the fixed frame');
      if(!(dimension==='plane'&&read().state.stuck)){
        const plot=plots.get('scene-canvas'),balls=plot.fills.filter(p=>p.color?.type==='radial');
        for(const [index,color]of [[0,'#2775b6'],[1,'#429b88']]){
          const shaft=plot.strokes.find(p=>p.color===color&&p.width===2.4&&p.points.length===2);
          if(!shaft)continue;
          near(shaft.points[0][0],balls[index].points[0][0]);near(shaft.points[0][1],balls[index].points[0][1]);
          assert(balls.every(ball=>plot.operations.indexOf(shaft)>plot.operations.indexOf(ball)),'velocities drawn on top of both balls');
          assert(!plot.strokes.some(p=>p.color===color&&p.width===1),'no offset connector for a velocity');
        }
      }
    }
  }
  for(const dimension of ['line','plane']){
    width=700;choose.execute({dimension,example:'miss',mode:'elastic'});input('duration',2);const short=camera();input('duration',12);near(read().state.t,0);assert(camera().scale<short.scale,'longer flight is fitted immediately, before playback');
  }
  for(const viewport of [280,700])for(const dimension of ['line','plane'])for(const mode of ['elastic','inelastic','sticking']){
    width=viewport;choose.execute({dimension,example:dimension==='line'?'target':'offset',mode});input('duration',5);near(value('time-value'),0);assert.equal($('line-controls').hidden,dimension==='plane');assert.equal($('plane-controls').hidden,dimension==='line');assert.equal($('restitution-control').hidden,mode!=='inelastic');
    for(const id of ['mass-1-value','mass-2-value','u1-value','u2-value','speed1-value','speed2-value','phi1-value','phi2-value','offset-value','time-value','timeline-value','K-value','loss-value']){
      assert.equal($(id).children.length,1);assert.equal($(id).children[0].tag,'svg');assert(!$(id).dataset.number.split('|')[0].includes(','));for(const g of $(id).children[0].children)assert(/,0\)$/.test(g.getAttribute('transform')));
    }
    jump.execute({atImpact:'before'});assert(!read().state.after);near(value('loss-value'),0);jump.execute({atImpact:'after'});assert(read().state.after);if(mode==='elastic')near(value('loss-value'),0);else assert(value('loss-value')>0);assert.equal(read().state.stuck,mode==='sticking');
    // All velocity arrows originate at the body center; a welded 2D pair uses C.
    const balls=plots.get('scene-canvas').fills.filter(p=>p.color?.type==='radial').map(p=>p.points[0]);
    const distanceToSegment=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],q=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-q*dx,p[1]-a[1]-q*dy);};
    const arrowScale=Math.min(76,width*.14)/2;
    for(const [i,color]of (dimension==='plane'&&mode==='sticking'?[]:[[1,'#2775b6'],[2,'#429b88']])){
      const v=read().state['v'+i],length=Math.hypot(...v)*arrowScale,shaft=plots.get('scene-canvas').strokes.find(p=>p.color===color&&p.width===2.4&&p.points.length===2);
      if(length<.001){assert(!shaft,'no arrow for zero velocity');continue;}
      assert(shaft,'velocity shaft present');const [a,b]=shaft.points;near(b[0]-a[0],v[0]*arrowScale);near(b[1]-a[1],-v[1]*arrowScale);
      near(a[0],balls[i-1][0]);near(a[1],balls[i-1][1]);
    }
    if(dimension==='plane'&&mode==='sticking'){
      const q=read().state,p=read().parameters,view=camera(),v=q.P.map(x=>x/(p.m1+p.m2));
      const shaft=plots.get('scene-canvas').strokes.find(s=>s.color==='#233449'&&s.width===2.4);
      assert(shaft,'assembly velocity is drawn');near(shaft.points[0][0],view.x+q.C[0]*view.scale);near(shaft.points[0][1],view.y-q.C[1]*view.scale);
      near((shaft.points[1][0]-shaft.points[0][0])/v[0],arrowScale);
      assert(!plots.get('scene-canvas').strokes.some(s=>['#2775b6','#429b88'].includes(s.color)&&s.width===2.4),'individual velocities hidden after welding');
      assert(!$('rotation-info').hidden);near(value('omega-value'),q.omega,.0051);
      assert($('ensemble-velocity-value').dataset.math.includes(v[0].toFixed(2)));
      assert($('v1-after').dataset.math.includes('—')&&$('v2-after').dataset.math.includes('—'));
      assert(!$('ensemble-speed-row').hidden&&!$('ensemble-rotation-row').hidden);
      assert($('scene-labels').children.some(el=>!el.hidden&&el.dataset.math==='\\vec V_C'));
    }
    // Ball centers/radii and gradients remain identical under every display toggle.
    const bodies=()=>JSON.stringify(plots.get('scene-canvas').fills.filter(p=>p.color?.type==='radial')),before=bodies();assert.equal(JSON.parse(before).length,2);
    for(const kind of ['momentum','none','velocity']){change('vectors',kind);assert.equal(bodies(),before);}
    for(const id of ['traces','center','normal','total-momentum']){$(id).checked=!$(id).checked;$(id).fire('change');assert.equal(bodies(),before);}
    for(const kind of ['momentum','energy']){change('chart-select',kind);assert.equal(bodies(),before);}
    const yTicks=$('history-labels').children.filter(el=>!el.hidden&&parseFloat(el.style.left)===(width<420?63:76)-12);
    assert.equal(yTicks.filter(el=>el.dataset.number==='0|').length,1,'one explicit vertical zero');
    const zero=yTicks.find(el=>el.dataset.number==='0|');
    assert(yTicks.every(el=>el===zero||Math.abs(parseFloat(el.style.top)-parseFloat(zero.style.top))>=22),'zero does not overlap adjacent tick labels');
    const chart=plots.get('history-canvas').strokes;
    if(mode!=='elastic')assert(chart.some(p=>p.points.some((a,i)=>i>0&&a[0]===p.points[i-1][0]&&Math.abs(a[1]-p.points[i-1][1])>1)),'vertical energy jump');
    $('restart').click();$('play').click();advance(2);$('play').click();near(read().state.t,2,.018);near(value('time-value'),2,.025);assert(read().state.after);assert.equal(frames.size,0);
    input('mass-1',2.5);near(read().state.t,0);near(value('mass-1-value'),2.5);assert.equal(frames.size,0);
    input('duration',2);$('play').click();advance(2.1);near(read().state.t,2);assert.equal(frames.size,0);assert.equal($('play').textContent,'Lire');
    $('history').fire('keydown',{key:'Home'});near(read().state.t,0);$('history').fire('keydown',{key:'End'});near(read().state.t,2);
    $('history').fire('pointerdown',{pointerId:1,clientX:width/2,button:0});$('history').fire('pointerup',{pointerId:1});assert.equal($('history').capture,undefined);assert(read().state.t>0&&read().state.t<2);
  }
  choose.execute({dimension:'plane',example:'miss',mode:'inelastic'});assert.equal(read().collisionTime,null);assert($('before').disabled);assert($('after').disabled);assert($('comparison-wrap').hidden);assert(!$('no-collision').hidden);
  const old=JSON.stringify(read());for(const input of [{atImpact:'after'},{time:-1},{time:100},{time:1,atImpact:'after'},{}, {time:NaN}])assert.throws(()=>jump.execute(input));
  assert.throws(()=>choose.execute({dimension:'line',example:'offset',mode:'elastic'}));assert.throws(()=>choose.execute({dimension:'plane',example:'offset',mode:'bad'}));assert.equal(JSON.stringify(read()),old,'invalid tool inputs leave state intact');
  // All examples and every initial condition go through the real controls.
  for(const dim of ['line','plane']){change('dimension',dim);for(const example of (dim==='line'?['target','headon','chase','miss']:['offset','headon','cross','miss'])){change('example',example);near(read().state.t,0);if(example!=='miss')assert(read().collisionTime!==null);}}
  for(const [id,v]of [['speed1',3],['speed2',1],['phi1',30],['phi2',-160],['offset',.4],['restitution',.7]]){input(id,v);near(value(id+'-value'),v);near(read().state.t,0);}
  $('play').click();document.hidden=true;events.visibilitychange();assert.equal(frames.size,0);assert.equal($('play').textContent,'Lire');events.pagehide();assert.deepEqual(errors,[]);
  console.log('UI adapter passed: all collision types in 1D/2D, example/settings changes, before/after, playback, seeking, fixed geometry, spherical gradients, instantaneous chart jumps, numeric baselines, optional tool contracts'+(convertTex?' with real MathJax.':'.'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Exercise the real animation loop, not the app's static webdriver preview.
  await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
  // Capture the actual projected reference edges without exposing app state.
  await page.addInitScript(()=>{
    const proto=CanvasRenderingContext2D.prototype;
    for(const method of ['clearRect','beginPath','moveTo','lineTo','stroke']){
      const original=proto[method];
      proto[method]=function(...args){
        if(method==='clearRect'){window.__referenceEdges=[];window.__axisTicks=[];}
        if(method==='beginPath')this.__testPath=[];
        if(method==='moveTo'||method==='lineTo')(this.__testPath??=[]).push({x:args[0],y:args[1]});
        if(method==='stroke'&&this.strokeStyle==='#607089'&&Math.abs(this.lineWidth-1.4)<.001)
          window.__referenceEdges.push(this.__testPath.slice());
        if(method==='stroke'&&this.strokeStyle==='#52627a'&&Math.abs(this.lineWidth-1.3)<.001)
          window.__axisTicks.push(this.__testPath.slice());
        return original.apply(this,args);
      };
    }
  });
  await page.goto(pathToFileURL(path.join(__dirname,'..','cinematique_3d_webapp_fr.html')).href);
  await page.waitForFunction(()=>!document.getElementById('loading-message'));
  await page.locator('#play-button').click();
  await page.locator('#time-slider').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const before=await page.locator('#time-slider').inputValue();
  const labels=()=>page.locator('.axis-math-label').evaluateAll(elements=>elements.filter(el=>!el.hidden).map(el=>{
    const r=el.getBoundingClientRect();return {id:el.id||el.parentElement.id+':'+el.textContent,value:el.querySelector('[data-value]')?.dataset.value,x:r.x,y:r.y,w:r.width,h:r.height};
  }));
  const assertOuterTitles=async(items,box)=>{
    const edges=await page.evaluate(()=>window.__referenceEdges);
    assert.equal(edges.length,12,'All cube edges captured');
    const corners=edges.flat(),normals=[{x:1,y:0},{x:0,y:1},...edges.map(([a,b])=>({x:b.y-a.y,y:a.x-b.x}))];
    for(const title of items.filter(item=>item.id.startsWith('axis-label-'))){
      const x=title.x-box.x,y=title.y-box.y;
      const rect=[{x,y},{x:x+title.w,y},{x,y:y+title.h},{x:x+title.w,y:y+title.h}];
      assert(normals.some(n=>{
        const cube=corners.map(p=>p.x*n.x+p.y*n.y),label=rect.map(p=>p.x*n.x+p.y*n.y);
        return Math.min(...label)>Math.max(...cube)||Math.max(...label)<Math.min(...cube);
      }),title.id+' is entirely outside the projected cube');
    }
  };
  const assertScale=async(distance)=>{
    const box=await page.locator('#viewport').boundingBox();
    const metres=Number(await page.locator('#length-scale-digits').getAttribute('data-value'));
    const bar=await page.locator('#length-scale-bar').boundingBox(),value=await page.locator('.length-scale-value').boundingBox();
    const segment=await page.locator('#length-scale-path').evaluate(el=>el.getBBox().width);
    const expected=metres*2000*.5*box.height/Math.tan(21*Math.PI/180)/distance;
    assert(metres>0&&Math.abs(segment-expected)<.1,'Scale bar is physically calibrated at the center depth');
    assert(Math.abs(bar.width-4-segment)<.1,'Rendered segment is not stretched by CSS');
    assert(value.y>=bar.y+bar.height,'Length is shown beneath the segment');
    assert.equal(await page.locator('.length-scale-title,.length-scale-caption').count(),0,'No prose around the scale bar');
    assert((await page.locator('.length-scale').getAttribute('aria-label')).includes('centre de la vue'));
  };
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   const views=[];
   for(const id of ['front-view','side-view','top-view','reset-view']){
    await page.locator('#'+id).click();
    assert.equal(await page.locator('#time-slider').inputValue(),before,'View changes do not seek');
    assert.equal(await page.locator('#play-button').innerText(),'Lire','View changes do not start playback');
    assert(!(await page.locator('#projection-toggle').isChecked()));
    assert(await page.locator('#full-trail').isChecked());
    const box=await page.locator('#viewport').boundingBox(),toolbar=await page.locator('.viewport-toolbar').boundingBox(),badge=await page.locator('.time-badge').boundingBox();
    assert(toolbar.x>=box.x&&toolbar.x+toolbar.width<=box.x+box.width+1&&toolbar.y>=box.y&&toolbar.y+toolbar.height<=box.y+box.height);
    assert(toolbar.x>=badge.x+badge.width||toolbar.y>=badge.y+badge.height,'Toolbar does not cover time badge');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
    const items=await labels(),intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
    await assertOuterTitles(items,box);
    const expected=id==='front-view'?['x','z']:id==='side-view'?['y','z']:id==='top-view'?['x','y']:['x','y','z'];
    assert.deepEqual(items.filter(x=>x.id.startsWith('axis-label-')).map(x=>x.id.slice(-1)).sort(),expected);
    assert.equal(items.length,expected.length,'Only axis titles remain; no numbers along axes');
    assert.equal(await page.locator('.axis-tick-label,.axis-tick-layer').count(),0);
    const ticks=await page.evaluate(()=>window.__axisTicks);
    assert.equal(ticks.length,3*expected.length,'Three physical marks per visible axis at the initial zoom');
    for(const [a,b] of ticks)assert(Math.abs(Math.hypot(b.x-a.x,b.y-a.y)-10)<1e-6,'Ticks stay visible, including in the top view');
    assert.equal(await page.locator('#length-scale-digits').getAttribute('data-value'),'1');
    await assertScale(13800);
    assert(await page.locator('.length-scale mjx-container').count()>0,'Scale uses mathematical typesetting');
    const scaleBox=await page.locator('.length-scale').boundingBox();
    assert(scaleBox.x>=box.x&&scaleBox.x+scaleBox.width<=box.x+box.width&&scaleBox.y+scaleBox.height<=box.y+box.height);
    for(let i=0;i<items.length;i++){
      const a=items[i];assert(a.x>=box.x&&a.x+a.w<=box.x+box.width+1&&a.y>=box.y&&a.y+a.h<=box.y+box.height+1,'Labels fit in viewport');
      assert(!intersects(a,{x:toolbar.x,y:toolbar.y,w:toolbar.width,h:toolbar.height}));
      assert(!intersects(a,{x:scaleBox.x,y:scaleBox.y,w:scaleBox.width,h:scaleBox.height}),'Scale legend does not cover axis titles');
      for(const b of items.slice(i+1))assert(!intersects(a,b),'Labels do not overlap: '+a.id+'/'+b.id);
    }
    await page.locator('#time-slider').evaluate(el=>{el.value='7';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.deepEqual(await labels(),items,'Axis labels stay fixed during motion');
    assert.deepEqual(await page.locator('.length-scale').boundingBox(),scaleBox,'Length scale stays fixed during motion');
    await page.locator('#time-slider').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},before);
    views.push(await page.locator('#viewport canvas').evaluate(el=>el.toDataURL()));
    if(process.env.SCREENSHOT_DIR)await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`3d-${id}-${width}.png`)});
   }
   assert.equal(new Set(views).size,4,'All four orientations produce distinct views');
   // Camera edits may thin ticks, but must never pile up text or clip it.
   let distance=13800;
   for(const gesture of ['zoom-out','rotate','pan','rotate-back','zoom-in']){
    const box=await page.locator('#viewport').boundingBox();
    const x=box.x+box.width*.52,y=box.y+box.height*.62;
    await page.mouse.move(x,y);
    if(gesture.startsWith('zoom')){
      const delta=gesture==='zoom-out'?480:-300;
      distance=Math.max(5200,Math.min(26000,distance*Math.exp(delta*.0012)));
      await page.mouse.wheel(0,delta);
    }
    else{
      if(gesture==='pan')await page.keyboard.down('Shift');
      await page.mouse.down();await page.mouse.move(x+(gesture==='rotate-back'?-80:45),y+25,{steps:5});await page.mouse.up();
      if(gesture==='pan')await page.keyboard.up('Shift');
    }
    await page.waitForTimeout(100);
    const items=await labels();assert(items.filter(a=>a.id.startsWith('axis-label-')).length>=2);
    await assertOuterTitles(items,box);
    for(let i=0;i<items.length;i++){
      const a=items[i];assert(a.x>=box.x&&a.x+a.w<=box.x+box.width+1&&a.y>=box.y&&a.y+a.h<=box.y+box.height+1,gesture+' bounds');
      for(const b of items.slice(i+1))assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),gesture+' overlap');
    }
    assert(items.every(a=>a.id.startsWith('axis-label-')),'Camera edits never restore numeric labels');
    await assertScale(distance);
    await page.locator('#time-slider').evaluate(el=>{el.value='7';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.deepEqual(await labels(),items,'Labels remain stable after camera edits');
    await page.locator('#time-slider').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},before);
   }
   // The ruler must remain calibrated and contained at both zoom limits;
   // its annotated reference distance may change rather than clipping it.
   for(const delta of [-5000,5000]){
    const box=await page.locator('#viewport').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    distance=Math.max(5200,Math.min(26000,distance*Math.exp(delta*.0012)));
    await page.mouse.wheel(0,delta);await page.waitForTimeout(100);
    await assertScale(distance);
    const ruler=await page.locator('.length-scale').boundingBox();
    assert(ruler.x>=box.x&&ruler.x+ruler.width<=box.x+box.width,'Ruler fits at extreme zoom');
    assert.equal(await page.locator('#time-slider').inputValue(),before);
   }
   await page.locator('#reset-view').click();
  }
  await page.locator('#play-button').click();
  for(const id of ['front-view','side-view','top-view'])await page.locator('#'+id).click();
  assert.equal(await page.locator('#play-button').innerText(),'Pause','View changes preserve playback');
  await page.locator('#play-button').click();
  assert(Number(await page.locator('#time-slider').inputValue())>Number(before));
  // SI readouts must follow the new physical lengths, not just a relabelled ruler.
  await page.locator('#trajectory-select').selectOption('lissajous');
  const read=async(index,field)=>Number(await page.locator('.vector-readout').nth(index).locator('.'+field+'-digits').getAttribute('data-value'));
  assert.equal(await read(0,'component-x'),2);
  assert.equal(await read(0,'component-y'),1);
  assert.equal(await read(0,'component-z'),1);
  assert.equal(await read(1,'magnitude'),1.8);
  assert.equal(await read(2,'component-x'),-.25);
  await page.locator('#trajectory-select').selectOption('mcua');
  await page.locator('#osculating-toggle').check();
  assert.equal(await page.locator('#curvature-digits').getAttribute('data-value'),'1.00');
  await page.locator('#trajectory-select').selectOption('ballistic');
  assert(Math.abs(Number(await page.locator('#time-slider').getAttribute('max'))-10*Math.PI/Math.sqrt(2000))<1e-8);
  assert.equal(await read(1,'magnitude'),4.47);
  assert.equal(await read(2,'magnitude'),9.81);
  assert.equal(await read(0,'component-z'),1);
  await page.locator('#osculating-toggle').uncheck();
  await page.locator('#trajectory-select').selectOption('lissajous');
  await page.waitForFunction(()=>document.querySelector('#trajectory-equations mjx-container'));
  assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: 1 m scale and SI readouts, physical gravity, curvature, exterior x/y/z titles, four 3D views, playback, mobile and MathJax.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

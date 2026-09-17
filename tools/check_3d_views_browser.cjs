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
  // Capture the reference axes and ensure that no cube or grid is drawn.
  await page.addInitScript(()=>{
    const proto=CanvasRenderingContext2D.prototype;
    for(const method of ['clearRect','beginPath','moveTo','lineTo','stroke','fill']){
      const original=proto[method];
      proto[method]=function(...args){
        if(method==='clearRect'){window.__referenceEdges=[];window.__axisTicks=[];window.__axes=[];window.__axisHeads=[];}
        if(method==='beginPath')this.__testPath=[];
        if(method==='moveTo'||method==='lineTo')(this.__testPath??=[]).push({x:args[0],y:args[1]});
        if(method==='stroke'&&['#607089','#9cacbf'].includes(this.strokeStyle))
          window.__referenceEdges.push(this.__testPath.slice());
        if(method==='stroke'&&this.strokeStyle==='#52627a'&&Math.abs(this.lineWidth-1.8)<.001)
          window.__axes.push(this.__testPath.slice());
        if(method==='fill'&&this.fillStyle==='#52627a')window.__axisHeads.push(this.__testPath.slice());
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
  // Full history hides the complete limited-trail control, without resetting
  // the saved duration, seeking or changing playback. Check both layouts.
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    const full=page.locator('#full-trail'),controls=page.locator('#trail-duration-controls'),slider=page.locator('#trail-duration');
    assert(await full.isVisible());
    assert(await full.isChecked());
    assert(!await controls.isVisible());
    assert(!await slider.isVisible());
    assert(await slider.isDisabled());
    await full.uncheck();
    assert(await controls.isVisible());
    assert(await slider.isVisible());
    assert(!await slider.isDisabled());
    await slider.evaluate(el=>{el.value='7';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await full.check();
    assert(!await page.locator('label[for="trail-duration"]').isVisible());
    assert(!await page.locator('#trail-duration-output').isVisible());
    await full.focus();await page.keyboard.press('Space');
    assert(await controls.isVisible());
    assert.equal(await slider.inputValue(),'7');
    assert.equal(await page.locator('#trail-duration-output-digits').getAttribute('data-value'),'7.0');
    await page.keyboard.press('Space');
    assert(!await controls.isVisible());
    assert.equal(await page.locator('#time-slider').inputValue(),before);
    assert.equal(await page.locator('#play-button').innerText(),'Lire');
  }
  const labels=()=>page.locator('.axis-math-label').evaluateAll(elements=>elements.filter(el=>!el.hidden).map(el=>{
    const r=el.getBoundingClientRect();return {id:el.id||el.parentElement.id+':'+el.textContent,value:el.querySelector('[data-value]')?.dataset.value,x:r.x,y:r.y,w:r.width,h:r.height};
  }));
  const assertAxisTitles=async(items,box)=>{
    const {edges,axes,heads}=await page.evaluate(()=>({edges:window.__referenceEdges,axes:window.__axes,heads:window.__axisHeads}));
    assert.equal(edges.length,0,'No cube edges or plane grid remain');
    assert.equal(heads.length,axes.length,'Every visible axis has a positive arrow tip');
    for(let i=0;i<axes.length;i++){
      const [start,end]=axes[i],[tip,,notch]=heads[i];
      assert.equal(heads[i].length,4,'Stylized filled arrowhead');
      assert(Math.abs(Math.hypot(tip.x-end.x,tip.y-end.y)-7)<1e-6,'Shaft overlaps the notch, without a white gap');
      assert(Math.hypot(start.x-tip.x,start.y-tip.y)>Math.hypot(start.x-notch.x,start.y-notch.y),'Head points in the positive direction');
    }
    for(const title of items.filter(item=>item.id.startsWith('axis-label-'))){
      const x=title.x-box.x,y=title.y-box.y,w=title.w,h=title.h;
      for(let i=0;i<axes.length;i++){
        const a=axes[i][0],b=heads[i][0];let lo=0,hi=1;
        for(const [v,delta,min,max] of [[a.x,b.x-a.x,x-1,x+w+1],[a.y,b.y-a.y,y-1,y+h+1]]){
          if(Math.abs(delta)<1e-8){if(v<min||v>max){lo=1;hi=0;}}
          else {const t1=(min-v)/delta,t2=(max-v)/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
        }
        assert(lo>hi,title.id+' does not overlap an axis');
      }
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
    await assertAxisTitles(items,box);
    const expected=id==='front-view'?['x','z']:id==='side-view'?['y','z']:id==='top-view'?['x','y']:['x','y','z'];
    assert.deepEqual(items.filter(x=>x.id.startsWith('axis-label-')).map(x=>x.id.slice(-1)).sort(),expected);
    assert.equal(items.length,expected.length,'Only axis titles remain; no numbers along axes');
    assert.equal(await page.locator('.axis-tick-label,.axis-tick-layer').count(),0);
    const ticks=await page.evaluate(()=>window.__axisTicks);
    assert.equal(await page.evaluate(()=>window.__axes.length),expected.length,'Only the visible Cartesian axes are drawn');
    if(width===390&&id==='reset-view')
      assert(ticks.length>=expected.length&&ticks.length<=2*expected.length,'Mobile clips ticks too close to the arrow tips');
    else assert.equal(ticks.length,2*expected.length,'Marks at 1 and 2 m; no redundant ticks at the common origin');
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
    await assertAxisTitles(items,box);
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
  assert.equal(await read(0,'component-y'),1);
  assert.equal(await read(0,'component-z'),0);
  assert.equal(await read(2,'component-x'),0);
  assert.equal(await read(2,'component-y'),0);
  assert.equal(await read(2,'component-z'),-9.81);
  for(const fraction of [.25,.75,1]){
    await page.locator('#time-slider').evaluate((el,q)=>{el.value=Number(el.max)*q;el.dispatchEvent(new Event('input',{bubbles:true}));},fraction);
    assert.equal(await read(0,'component-y'),1);
    assert.equal(await read(2,'component-z'),-9.81);
  }
  if(process.env.SCREENSHOT_DIR){
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#front-view').click();
    await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'3d-ballistic-negative-z.png')});
  }
  await page.locator('#osculating-toggle').uncheck();
  await page.locator('#trajectory-select').selectOption('lissajous');
  await page.waitForFunction(()=>document.querySelector('#trajectory-equations mjx-container'));
  assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: Cartesian axes without a box, connected arrow tips, stable clear titles, 1 m scale, SI readouts, gravity, curvature, four views, playback, mobile and MathJax.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

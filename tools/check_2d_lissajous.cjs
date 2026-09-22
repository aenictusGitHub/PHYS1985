'use strict';
// Check the real packaged model, including derivatives of the time law (not
// normalized display arrows). Run with BROWSER=1 for tablet/share/language QA.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),zip=path.join(root,'cinematique_2d_webapp_fr.zip');
const entry=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n').find(p=>/^[^/]+\/app\.js$/.test(p));
const source=execFileSync('unzip',['-p',zip,entry],{encoding:'utf8'});
assert(fs.readFileSync(path.join(root,'cinematique_2d_webapp_fr.html'),'utf8').includes(source));
const pure=source.slice(0,source.indexOf("  const viewport = document.getElementById('viewport');"))
 +source.slice(source.indexOf('  function positionAt('),source.indexOf('  function clipToPlot('));
const api=vm.runInNewContext(pure+'return {lissajousParameters,lissajousMotion,getLissajousTables,TRAJECTORIES,derivatives,equationFrame,osculatingGeometry};})();');
const close=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}; tolerance ${tol}`);
const norm=v=>Math.hypot(v.x,v.y);
for(const n of [2,3]) {
const item=api.TRAJECTORIES['lissajous'+n],T=item.duration,modeKey=n===3?'mode3':'mode';
const others=()=>JSON.stringify(Object.entries(api.TRAJECTORIES).filter(([key])=>key!=='lissajous'+n).map(([,trajectory])=>api.derivatives(trajectory,1.3)));
const baseline=others(),periods=[];
for(const mode of ['original','constant-speed']) {
 api.lissajousParameters[modeKey]=mode;periods.push(item.duration);
 let minV=Infinity,maxV=0,minA=Infinity,maxA=0,maxDerivativeError=0,maxJerkError=0,lastPhase=-1;
 for(let i=0;i<4096;i++) {
  const t=(i+.2718)*T/4096,data=api.derivatives(item,t),motion=api.lissajousMotion(t,n),q=motion.q,h=2e-6;
  assert(q>lastPhase,'Phase must increase even at the self-intersection');lastPhase=q;
  close(data.position.x,4+2*Math.cos(q));close(data.position.y,4+2*Math.sin(n*q));
  minV=Math.min(minV,data.speed);maxV=Math.max(maxV,data.speed);
  minA=Math.min(minA,norm(data.acceleration));maxA=Math.max(maxA,norm(data.acceleration));
  assert(data.decompositionDefined);
  const before=api.derivatives(item,t-h),after=api.derivatives(item,t+h);
  for(const axis of ['x','y']) {
   close((after.position[axis]-before.position[axis])/(2*h),data.velocity[axis],2e-6);
   const error=Math.abs((after.velocity[axis]-before.velocity[axis])/(2*h)-data.acceleration[axis]);
   maxDerivativeError=Math.max(maxDerivativeError,error);assert(error<2e-5,mode+': acceleration is the velocity derivative');
   const jerror=Math.abs((after.acceleration[axis]-before.acceleration[axis])/(2*h)-data.jerk[axis]);
   maxJerkError=Math.max(maxJerkError,jerror);assert(jerror<.012,mode+': jerk is the acceleration derivative, away from joins');
   close(data.acceleration[axis],data.tangential[axis]+data.centripetal[axis]);
   close(item.position(t+T)[axis],data.position[axis]);close(item.velocity(t-T)[axis],data.velocity[axis]);
  }
  if(mode==='constant-speed') close(norm(data.tangential),0,1e-12);
  if(mode==='original') {
   close(data.speed,Math.hypot(-Math.sin(.5*t),n*Math.cos(n*.5*t)));
   close(norm(data.acceleration),Math.hypot(-.5*Math.cos(.5*t),-.5*n*n*Math.sin(n*.5*t)));
  }
 }
 if(mode==='constant-speed') {close(maxV-minV,0);close(maxV,api.getLissajousTables(n).speed);assert(maxA-minA>1);}
 for(let i=0;i<=8;i++) {
  const t=i*T/4,data=api.derivatives(item,t),before=api.derivatives(item,t-1e-9),after=api.derivatives(item,t+1e-9);
  assert(data.decompositionDefined);
  // n=3 has a large but finite fourth derivative at quarter-periods.
  for(const axis of ['x','y']) for(const field of ['position','velocity','acceleration','jerk']) close(before[field][axis],after[field][axis],field==='jerk'?3e-5:2e-6);
 }
 const frame=api.equationFrame(item,{x:1.25,y:-2});close(frame.offset.x,2.75);close(frame.offset.y,6);
 assert.equal(others(),baseline,'Other sixteen trajectories must not change');
 console.log('PASS model n='+n,mode,{speed:[minV,maxV],acceleration:[minA,maxA],maxDerivativeError,maxJerkError});
}
assert(periods.every(period=>period===4*Math.PI));
}

if(process.env.BROWSER==='1') (async()=>{
 const {chromium,webkit,firefox}=require('playwright');
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]) {
  const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try { for(const lang of ['fr','en']) {
   const context=await browser.newContext({viewport:{width:834,height:1194},hasTouch:true}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
   await page.goto(pathToFileURL(path.join(root,'cinematique_2d_webapp_fr.html')).href+'?lang='+lang);
   await page.waitForFunction(()=>window.PhysShare?.ready);
   if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
   assert.equal((await page.locator('label:has(#full-trail)').innerText()).trim(),lang==='fr'?'Trajectoire complète':'Full trajectory');
   assert(await page.locator('#trail-duration-controls').isHidden());
   await page.locator('#full-trail').uncheck();
   assert(await page.locator('#trail-duration-controls').isVisible());
   await page.locator('#full-trail').check();
   assert(await page.locator('#trail-duration-controls').isHidden());
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
   assert.deepEqual(await page.locator('#lissajous-parameterization option').evaluateAll(es=>es.map(e=>e.value)),['original','constant-speed']);
   assert.equal(await page.locator('#lissajous-caveat').count(),0);
   const input=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
   const magnitude=async(index)=>Number(await page.locator('.vector-readout').nth(index).locator('.magnitude-digits').getAttribute('data-value'));
   for(const n of [2,3]) {
   await page.selectOption('#trajectory-select','lissajous'+n);
   assert(await page.locator('#lissajous-controls').isVisible());
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
   for(const mode of ['constant-speed','original']) {
    await page.evaluate(async()=>{const s=PhysShare.capture();s.data.origin={x:1,y:2};s.data.view={xmin:-1,xmax:9,ymin:-1,ymax:9};await PhysShare.restore(s);});
    await page.selectOption('#lissajous-parameterization',mode);
    assert.equal(await page.locator('#time-slider').inputValue(),'0');
    assert.equal(await page.locator('#play-button').innerText(),lang==='fr'?'Lire':'Play');
    await page.waitForFunction(()=>document.querySelector('#trajectory-equations mjx-container'));
    assert(!(await page.locator('#warning-badge').isVisible()));
    for(const t of [.4,1.2,3.8,8.4,16.2]) {
     await input('time-slider',t);
     if(mode==='constant-speed') close(await magnitude(1),api.getLissajousTables(n).speed,.006);
     assert(!(await page.locator('#warning-badge').isVisible()));
    }
    const snapshot=await page.evaluate(()=>PhysShare.capture());
    assert.deepEqual(snapshot.data.origin,{x:1,y:2});assert.deepEqual(snapshot.data.view,{xmin:-1,xmax:9,ymin:-1,ymax:9});
    const url=await page.evaluate(()=>PhysShare.makeLink()),next=await context.newPage();
    await next.goto(url);await next.waitForFunction(()=>window.PhysShare?.ready);
    assert.equal(await next.locator('#lissajous-parameterization').inputValue(),mode);
    const restored=await next.evaluate(()=>PhysShare.capture());assert.deepEqual(restored,snapshot);
    assert.equal(await next.locator('#play-button').innerText(),lang==='fr'?'Lire':'Play');await next.close();
    await page.selectOption('#trajectory-select','lissajous'+(n===2?3:2));
    assert(await page.locator('#lissajous-controls').isVisible());
    assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original','Each Lissajous keeps an independent setting');
    await page.selectOption('#trajectory-select','mc');assert(!(await page.locator('#lissajous-controls').isVisible()));
    await page.selectOption('#trajectory-select','lissajous'+n);assert.equal(await page.locator('#lissajous-parameterization').inputValue(),mode);
    assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
    for(const width of [834,512,390]) {
     await page.setViewportSize({width,height:900});
     assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
     assert(await page.locator('#lissajous-parameterization').evaluate(el=>el.getBoundingClientRect().width<=el.parentElement.getBoundingClientRect().width+1));
    }
    if(process.env.SCREENSHOT_DIR) {
     await page.setViewportSize({width:1280,height:950});
     await input('time-slider',16.2);
     await page.locator('#lissajous-parameterization').scrollIntoViewIfNeeded();
     await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${name}-${lang}-n${n}-${mode}.png`)});
    }
   }
   }
   await page.selectOption('#lissajous-parameterization','constant-speed');
   await page.evaluate(async()=>{const old=PhysShare.capture();delete old.data.lissajous;delete old.controls['lissajous-parameterization'];await PhysShare.restore(old);});
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original','Old shared links keep original motion');
   await page.evaluate(async()=>{const old=PhysShare.capture();old.data.lissajous={mode:'constant-speed'};await PhysShare.restore(old);});
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original','n=3 stays original for links predating its parameterization');
   await page.selectOption('#trajectory-select','lissajous2');
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'constant-speed','Old n=2 setting is preserved');
   await page.evaluate(async()=>{const old=PhysShare.capture();old.data.lissajous={mode:'constant-acceleration'};old.controls['lissajous-parameterization']='constant-acceleration';await PhysShare.restore(old);});
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original','Retired experimental mode falls back to original');
   await page.selectOption('#trajectory-select','lissajous3');
   await page.locator('#play-button').click();
   await page.selectOption('#lissajous-parameterization','constant-speed');
   assert.equal(await page.locator('#play-button').innerText(),'Pause','Changing the law keeps playback active');
   await page.waitForTimeout(150);
   assert(Number(await page.locator('#time-slider').inputValue())>0,'New time law actually animates');
   await page.locator('#play-button').click();
   assert.deepEqual(errors,[]);await context.close();console.log('PASS browser',name,lang,'touch/tablet, narrow layout, TeX, switches, sharing and old links');
  }} finally {await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

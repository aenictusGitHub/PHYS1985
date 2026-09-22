'use strict';
// Test the packaged spatial time laws, then optionally browser/tablet/sharing UI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),zip=path.join(root,'cinematique_3d_webapp_fr.zip');
const entry=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n').find(p=>/^[^/]+\/app\.js$/.test(p));
const source=execFileSync('unzip',['-p',zip,entry],{encoding:'utf8'});
assert(fs.readFileSync(path.join(root,'cinematique_3d_webapp_fr.html'),'utf8').includes(source));
const pure=source.slice(0,source.indexOf("  const viewport = document.getElementById('viewport');"));
const api=vm.runInNewContext(pure+'return {lissajousParameters,lissajousMotion,getLissajousTable,TRAJECTORIES,derivatives,osculatingGeometry,jerkDisplayScale};})();');
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} != ${b} (tolerance ${tol})`);
const norm=v=>Math.hypot(v.x,v.y,v.z),key=n=>n===2?'lissajous':'lissajous3';
for(const n of [2,3]) {
 const item=api.TRAJECTORIES[key(n)],T=item.duration,modeKey=n===2?'mode':'mode3',m=1.5*n;
 near(T,n===2?4*Math.PI:8*Math.PI);
 const others=()=>JSON.stringify(Object.entries(api.TRAJECTORIES).filter(([id])=>id!==key(n)).map(([,trajectory])=>api.derivatives(trajectory,1.31)));
 const baseline=others();
 for(const mode of ['original','constant-speed']) {
  api.lissajousParameters[modeKey]=mode;
  let low=Infinity,high=0,maxJerkError=0,previousQ=-1;
  const displayScale=api.jerkDisplayScale(item);
  assert(Number.isFinite(displayScale)&&displayScale>0);
  for(let i=0;i<4096;i++) {
   const t=(i+.3127)*T/4096,h=2e-6,data=api.derivatives(item,t),q=api.lissajousMotion(t,n).q;
   assert(q>previousQ);previousQ=q;
   near(data.position.x,1+Math.cos(q));near(data.position.y,1+Math.sin(n*q));near(data.position.z,1+Math.sin(m*q));
   low=Math.min(low,data.speed);high=Math.max(high,data.speed);
   const before=api.derivatives(item,t-h),after=api.derivatives(item,t+h);
   for(const axis of ['x','y','z']) {
    near((after.position[axis]-before.position[axis])/(2*h),data.velocity[axis],2e-6);
    near((after.velocity[axis]-before.velocity[axis])/(2*h),data.acceleration[axis],2e-5);
    const error=Math.abs((after.acceleration[axis]-before.acceleration[axis])/(2*h)-data.jerk[axis]);
    maxJerkError=Math.max(maxJerkError,error);assert(error<.002);
    near(data.acceleration[axis],data.tangential[axis]+data.normal[axis]);
    for(const field of ['position','velocity','acceleration','jerk']) {
     assert(Number.isFinite(data[field][axis]));near(item[field](t+T)[axis],data[field][axis],2e-7);near(item[field](t-T)[axis],data[field][axis],2e-7);
    }
   }
   if(mode==='constant-speed') near(norm(data.tangential),0,1e-11);
   else near(data.speed,.5*Math.hypot(Math.sin(q),n*Math.cos(n*q),m*Math.cos(m*q)));
  }
  if(mode==='constant-speed') {
   near(high-low,0,1e-12);near(high,api.getLissajousTable(n).speed);
   // Independent Simpson integration of the full 3D speed (not screen distance).
   const count=65536,du=(n===2?2:4)*Math.PI/count;
   let length=0;
   for(let i=0;i<=count;i++){const u=i*du;length+=(i===0||i===count?1:i%2?4:2)*Math.hypot(Math.sin(u),n*Math.cos(n*u),m*Math.cos(m*u));}
   near(high,length*du/(3*T),1e-9);
  } else assert(high-low>.2);
  for(const t of [0,T/4,T/2,T,2*T]) {
   const before=api.derivatives(item,t-1e-9),after=api.derivatives(item,t+1e-9);
   for(const field of ['position','velocity','acceleration','jerk'])for(const axis of ['x','y','z'])near(before[field][axis],after[field][axis],1e-5);
  }
  if(n===3) {
   const p=item.position(T/11),half=item.position(T/11+T/2);
   near(p.x,half.x);near(p.y,half.y);near(p.z+half.z,2);
   assert(Math.abs(p.z-half.z)>.1,'The 9/2 z frequency must not be truncated to the XY period');
  }
  assert.equal(others(),baseline,'Other trajectories and the other Lissajous setting remain unchanged');
  near(api.jerkDisplayScale(item),displayScale);
  console.log('PASS 3D n='+n,mode,{speed:[low,high],period:T,maxJerkError});
 }
}

if(process.env.BROWSER==='1') (async()=>{
 const {chromium,webkit,firefox}=require('playwright');
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]) {
  const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
  try {for(const lang of ['fr','en']) {
   const context=await browser.newContext({viewport:{width:834,height:1194},hasTouch:true}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>{
    let mobile;
    Object.defineProperty(window,'PhysMobile3D',{get:()=>mobile,set:value=>{
     mobile={...value,draw(ctx,kind,position,options){window.__lissajousPose=options.frame;return value.draw(ctx,kind,position,options);}};
    }});
   });
   await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
   await page.goto(pathToFileURL(path.join(root,'cinematique_3d_webapp_fr.html')).href+'?lang='+lang);
   await page.waitForFunction(()=>window.PhysShare?.ready);
   if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
   assert.equal((await page.locator('label:has(#full-trail)').innerText()).trim(),lang==='fr'?'Trajectoire complète':'Full trajectory');
   assert(await page.locator('#trail-duration-controls').isHidden());
   await page.locator('#full-trail').uncheck();
   assert(await page.locator('#trail-duration-controls').isVisible());
   await page.locator('#full-trail').check();
   assert(await page.locator('#trail-duration-controls').isHidden());
   assert.deepEqual(await page.locator('#lissajous-parameterization option').evaluateAll(es=>es.map(e=>e.value)),['original','constant-speed']);
   const input=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
   await page.selectOption('#mobile-appearance','fly');
   for(const n of [2,3]) {
    await page.selectOption('#trajectory-select',key(n));
    assert(await page.locator('#lissajous-controls').isVisible());
    assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
    await page.locator('#space-grid-toggle').check();
    for(const mode of ['constant-speed','original']) {
     await page.locator('#side-view').click();
     const camera=await page.evaluate(()=>PhysShare.capture().data.camera);
     await page.selectOption('#lissajous-parameterization',mode);
     assert.equal(await page.locator('#time-slider').inputValue(),'0');
     near(Number(await page.locator('#time-slider').getAttribute('max')),n===2?8*Math.PI:16*Math.PI);
     assert.deepEqual(await page.evaluate(()=>PhysShare.capture().data.camera),camera);
     assert.equal(await page.locator('#play-button').innerText(),lang==='fr'?'Lire':'Play');
     await page.waitForFunction(()=>document.querySelector('#trajectory-equations mjx-container'));
     for(const t of [0,.4,2.7,8.4,16.2]) {
      await input('time-slider',t);
      if(mode==='constant-speed')near(Number(await page.locator('.vector-readout').nth(1).locator('.magnitude-digits').getAttribute('data-value')),api.getLissajousTable(n).speed,.006);
     }
     const pose=await page.evaluate(()=>window.__lissajousPose);
     const snapshot=await page.evaluate(()=>PhysShare.capture()),url=await page.evaluate(()=>PhysShare.makeLink()),next=await context.newPage();
     await next.goto(url);await next.waitForFunction(()=>window.PhysShare?.ready);
     assert.equal(await next.locator('#lissajous-parameterization').inputValue(),mode);
     assert.deepEqual(await next.evaluate(()=>PhysShare.capture()),snapshot);
     assert.deepEqual(await next.evaluate(()=>window.__lissajousPose),pose,'Pose cache must follow the chosen time law, including after sharing');
     assert.equal(await next.locator('#play-button').innerText(),lang==='fr'?'Lire':'Play');await next.close();
     await page.selectOption('#trajectory-select',key(n===2?3:2));
     assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
     await page.selectOption('#trajectory-select','mcua');assert(!(await page.locator('#lissajous-controls').isVisible()));
     await page.selectOption('#trajectory-select',key(n));assert.equal(await page.locator('#lissajous-parameterization').inputValue(),mode);
     assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
     for(const width of [834,512,390]) {
      await page.setViewportSize({width,height:900});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
     }
     if(process.env.SCREENSHOT_DIR) {
      await page.setViewportSize({width:1280,height:950});await page.locator('#reset-view').click();await input('time-slider',16.2);
      await page.locator('#lissajous-parameterization').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${name}-${lang}-n${n}-${mode}.png`)});
     }
    }
   }
   await page.selectOption('#lissajous-parameterization','constant-speed');
   await page.evaluate(async()=>{const old=PhysShare.capture();delete old.data.lissajous;delete old.controls['lissajous-parameterization'];await PhysShare.restore(old);});
   assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
   await page.selectOption('#trajectory-select','lissajous');assert.equal(await page.locator('#lissajous-parameterization').inputValue(),'original');
   await page.selectOption('#lissajous-parameterization','constant-speed');await page.selectOption('#trajectory-select','lissajous3');
   await page.locator('#play-button').click();await page.selectOption('#lissajous-parameterization','constant-speed');
   assert.equal(await page.locator('#play-button').innerText(),'Pause');await page.waitForTimeout(150);
   assert(Number(await page.locator('#time-slider').inputValue())>0);await page.locator('#play-button').click();
   assert.deepEqual(await page.evaluate(()=>PhysShare.capture().data.lissajous),{mode:'constant-speed',mode3:'constant-speed'});
   assert.deepEqual(errors,[]);await context.close();console.log('PASS 3D browser',name,lang,'two laws, independent settings, playback, camera, grid, tablet, TeX, sharing and old links');
  }} finally {await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

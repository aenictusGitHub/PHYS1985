'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..'),zip=path.join(root,'cinematique_2d_webapp_fr.zip');
const entry=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).split('\n').find(p=>/^[^/]+\/app\.js$/.test(p));
const source=execFileSync('unzip',['-p',zip,entry],{encoding:'utf8'});
assert(fs.readFileSync(path.join(root,'cinematique_2d_webapp_fr.html'),'utf8').includes(source));
const pure=source.slice(0,source.indexOf("  const viewport = document.getElementById('viewport');"))
 +source.slice(source.indexOf('  function positionAt('),source.indexOf('  function clipToPlot('));
const app=vm.runInNewContext(pure+'return {mcParameters,TRAJECTORIES,derivatives,osculatingGeometry,equationFrame,jerkDisplayScale,circularDuration};})();');
const close=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const mc=app.TRAJECTORIES.mc;
assert.equal(app.TRAJECTORIES.mcu,undefined);assert.equal(app.TRAJECTORIES.mcua,undefined);
assert(mc.closed);close(mc.duration,2*Math.PI);
const originalOthers=JSON.stringify(Object.entries(app.TRAJECTORIES).filter(([key])=>key!=='mc').map(([,item])=>app.derivatives(item,1)));
const scaleJ=app.jerkDisplayScale(mc);
for(const R of [.25,.5,2,3])for(const omega0 of [.1,.5,1,2])for(const alpha of [-.2,-.05,0,.02,.2]){
 Object.assign(app.mcParameters,{R,omega:omega0,alpha});
 assert.equal(mc.closed,alpha===0);
 const duration=app.circularDuration();assert(Number.isFinite(duration)&&duration>0);
 const angleTravel=alpha<0&&duration>omega0/(-alpha)
  ?omega0**2/(-2*alpha)+(-alpha)/2*(duration-omega0/(-alpha))**2
  :omega0*duration+.5*alpha*duration**2;
 close(angleTravel,4*Math.PI);
 close(mc.closed?2*mc.duration:mc.duration,duration);
 for(let i=0;i<=64;i++){
  const t=duration*i/64,omega=omega0+alpha*t,phase=omega0*t+.5*alpha*t*t;
  const data=app.derivatives(mc,t),p={x:data.position.x-4,y:data.position.y-4};
  close(p.x,R*Math.cos(phase));close(p.y,R*Math.sin(phase));
  close(Math.hypot(p.x,p.y),R);close(data.speed,R*Math.abs(omega));
  close(Math.hypot(data.acceleration.x,data.acceleration.y),R*Math.hypot(omega**2,alpha));
  close(Math.hypot(data.jerk.x,data.jerk.y),R*Math.hypot(omega**3,3*omega*alpha));
  close(p.x*data.velocity.x+p.y*data.velocity.y,0);
  close(data.acceleration.x,-(omega**2)*p.x-alpha*p.y);close(data.acceleration.y,-(omega**2)*p.y+alpha*p.x);
  close(Math.hypot(data.tangential.x,data.tangential.y),R*Math.abs(alpha));
  for(const axis of ['x','y'])close(data.acceleration[axis],data.tangential[axis]+data.centripetal[axis]);
  const c=app.osculatingGeometry(data);assert(c.defined);close(c.radius,R);close(c.center.x,4);close(c.center.y,4);
 }
 if(alpha<0&&omega0/(-alpha)<=duration){
  const stopped=app.derivatives(mc,omega0/(-alpha));assert(!stopped.decompositionDefined);
  close(stopped.speed,0);close(Math.hypot(stopped.acceleration.x,stopped.acceleration.y),R*Math.abs(alpha));
  assert(!app.osculatingGeometry(stopped).defined,'Osculating circle is undefined at the instant of rest');
 }
 const frame=app.equationFrame(mc,{x:1.25,y:2.5});close(frame.offset.x,2.75);close(frame.offset.y,1.5);
 assert.equal(app.jerkDisplayScale(mc),scaleJ,'Jerk scale stays fixed when parameters change');
 assert.equal(JSON.stringify(Object.entries(app.TRAJECTORIES).filter(([key])=>key!=='mc').map(([,item])=>app.derivatives(item,1))),originalOthers);
}
console.log('PASS: unified circular law, constant angular acceleration, speed, jerk, exact decomposition, two-turn duration, reversal, stopping singularity and isolation from the other 16 trajectories.');

const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
  await page.goto(pathToFileURL(path.join(root,'cinematique_2d_webapp_fr.html')).href);
  await page.waitForFunction(()=>!document.getElementById('loading-message'));
  if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
  assert(!(await page.locator('#mc-controls').isVisible()));
  const options=await page.locator('#trajectory-select option').evaluateAll(els=>els.map(el=>({value:el.value,text:el.textContent})));
  assert.equal(options.length,17);assert(options.some(o=>o.value==='mc'&&o.text==='Mouvement circulaire (MC)'));
  assert.equal(options[options.findIndex(o=>o.value==='mc')+1].value,'ballistic','Ballistic motion is directly below MC');
  assert(!options.some(o=>['mcu','mcua'].includes(o.value)));
  const set=async(id,value)=>page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const read=async(index,field)=>Number(await page.locator('.vector-readout').nth(index).locator('.'+field+'-digits').getAttribute('data-value'));
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   await page.locator('#trajectory-select').selectOption('mc');
   await page.waitForFunction(()=>document.querySelector('#trajectory-equations mjx-container'));
   await page.locator('#mc-reset').click();
   assert(await page.locator('#mc-controls').isVisible());
   assert.equal(await page.locator('#mc-radius').inputValue(),'2');
   assert.equal(await page.locator('#mc-omega').inputValue(),'1');
   assert.equal(await page.locator('#mc-alpha').inputValue(),'0');
   assert.equal(await page.locator('#mc-regime').innerText(),'Mouvement circulaire uniforme');
   await page.locator('#osculating-toggle').check();
   await page.locator('#toggle-tangential').check();
   const testValues=async(R,omega)=>{
    assert.equal(await page.locator('#mc-radius-digits').getAttribute('data-value'),R.toFixed(2));
    assert.equal(await page.locator('#mc-omega-digits').getAttribute('data-value'),omega.toFixed(2));
    for(const [key,value] of [['R',R],['omega',omega],['alpha',0],['tmax',4*Math.PI/omega]])
     assert.equal(await page.locator(`[data-mc-value="${key}"]`).getAttribute('data-value'),value.toFixed(2));
    close(Number(await page.locator('#time-slider').getAttribute('max')),4*Math.PI/omega);
    close(await read(1,'magnitude'),R*omega,.006);close(await read(2,'magnitude'),R*omega**2,.006);
    assert.equal(await read(3,'magnitude'),0);
    assert.equal(await page.locator('#curvature-digits').getAttribute('data-value'),R.toFixed(2));
   };
   for(const [R,omega] of [[2,.5],[.25,.1],[3,2],[1.5,1.25]]){
    await set('mc-radius',R);await set('mc-omega',omega);
    assert.equal(await page.locator('#time-slider').inputValue(),'0','New parameters restart the motion');
    assert.equal(await page.locator('#play-button').innerText(),'Lire','Parameter changes preserve pause');
    await testValues(R,omega);
    await set('time-slider',Math.PI/(2*omega));
    const t=Number(await page.locator('#time-slider').inputValue());
    close(await read(0,'component-x'),4+R*Math.cos(omega*t),.006);
    close(await read(0,'component-y'),4+R*Math.sin(omega*t),.006);
    await testValues(R,omega);
   }
   await page.locator('#trajectory-equations mjx-container').first().evaluate(el=>el.dataset.stable='yes');
   await page.locator('#mc-radius').evaluate(el=>{for(let i=0;i<=55;i++){el.value=String(.25+i*.05);el.dispatchEvent(new Event('input',{bubbles:true}));}});
   assert.equal(await page.locator('#trajectory-equations mjx-container').first().getAttribute('data-stable'),'yes','Scrubbing updates numbers without retypesetting equations');
   assert.equal(await page.locator('[data-mc-value="R"]').getAttribute('data-value'),'3.00');
   await page.locator('#trajectory-select').selectOption('lissajous2');
   assert(!(await page.locator('#mc-controls').isVisible()));
   await set('time-slider',0);close(await read(1,'magnitude'),2);close(await read(2,'magnitude'),.5,.01);
   await page.locator('#trajectory-select').selectOption('mc');
   assert.equal(await page.locator('#mc-radius').inputValue(),'3','Parameters survive trajectory switches');
   await page.locator('#mc-reset').click();await testValues(2,1);
   for(const alpha of [.02,.2,-.2]){
    await set('mc-alpha',alpha);
    assert.equal(await page.locator('#time-slider').inputValue(),'0');
    assert.equal(await page.locator('#mc-alpha-digits').getAttribute('data-value'),alpha.toFixed(2));
    assert.equal(await page.locator('[data-mc-value="alpha"]').getAttribute('data-value'),alpha.toFixed(2));
    assert((await page.locator('#mc-regime').innerText()).startsWith('Mouvement circulaire uniformément accéléré'));
    assert(!(await page.locator('#mc-period-symbol').isVisible()));
    assert(await page.locator('#mc-duration-symbol').isVisible());
    const max=Number(await page.locator('#time-slider').getAttribute('max'));
    assert.equal(await page.locator('#mc-period-digits').getAttribute('data-value'),max.toFixed(2));
    assert.equal(await page.locator('[data-mc-value="tmax"]').getAttribute('data-value'),max.toFixed(2));
    for(const t of [0,max*.25,max*.9,max]){
     await set('time-slider',t);const actual=Number(await page.locator('#time-slider').inputValue()),omega=1+alpha*actual,phase=actual+.5*alpha*actual**2;
     close(await read(0,'component-x'),4+2*Math.cos(phase),.006);close(await read(0,'component-y'),4+2*Math.sin(phase),.006);
     close(await read(1,'magnitude'),2*Math.abs(omega),.006);close(await read(2,'magnitude'),2*Math.hypot(omega**2,alpha),.006);
     close(await read(3,'magnitude'),2*Math.abs(alpha),.006);
    }
   }
   await set('mc-alpha',0);
   assert.equal(await page.locator('#mc-regime').innerText(),'Mouvement circulaire uniforme');
   assert(await page.locator('#mc-period-symbol').isVisible());assert(!(await page.locator('#mc-duration-symbol').isVisible()));
   await testValues(2,1);
   await page.locator('#mc-radius').focus();await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('#mc-radius').inputValue(),'2.05');
   await page.locator('#play-button').click();await set('mc-alpha',.05);
   assert.equal(await page.locator('#play-button').innerText(),'Pause');
   await page.waitForTimeout(100);assert(Number(await page.locator('#time-slider').inputValue())>0);
   await page.locator('#play-button').click();
   await page.locator('#mc-reset').click();await set('time-slider',8);
   assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.locator('#mc-controls').scrollIntoViewIfNeeded();
   if(process.env.SCREENSHOT_DIR){
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`mc-${width}.png`),fullPage:true});
    await set('mc-alpha',.1);await set('time-slider',2);await page.locator('#mc-controls').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`mc-accelerated-${width}.png`),fullPage:true});
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: unified MC option, three controls, uniform/nonperiodic labels, changing acceleration, reversal, live equations and playback, keyboard and mobile layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

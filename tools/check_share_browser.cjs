/* Run with NODE_PATH containing Playwright; accepts a directory of standalone apps. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const names=(process.env.APPS||'cinematique_2d,cinematique_3d,collisions,energie_mecanique,equilibres_statiques,frottements_solides,moment_cinetique,potentiel_force,poulies,puissance_travail').split(',');
let passes=0;
const diff=(a,b,p='')=>{
  if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a))?[]:[p+': '+a+' != '+b];
  if(a===b)return [];if(!a||!b||typeof a!=='object'||typeof b!=='object')return [p+': '+JSON.stringify(a)+' != '+JSON.stringify(b)];
  return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>diff(a[k],b[k],p+'.'+k));
};
async function roundtrip(page,browser,label){
  const url=await page.evaluate(()=>PhysShare.makeLink());
  const before=await page.evaluate(url=>PhysShare.decode(new URL(url).hash.split('=')[1]),url);
  const next=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];next.on('pageerror',e=>errors.push(e.message));
  // Exercise normal startup too: kinematics otherwise pauses automatically in WebDriver.
  await next.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
  try{
    await next.goto(url);await next.waitForFunction(()=>window.PhysShare?.ready&&document.querySelector('.phys-share-status')?.textContent, {timeout:25000});
    const text=await next.locator('.phys-share-status').innerText();assert.match(text,process.env.LANGUAGE==='en'?/restored/:/restaurée/,label+': '+text);
    const after=await next.evaluate(()=>PhysShare.capture());let differences=diff(before,after);
    assert.deepEqual(differences,[],label+' round-trip');
    assert.equal(await next.getByRole('button',{name:'Pause',exact:true}).count(),0,label+' transport must be paused');
    await next.waitForTimeout(250);assert.deepEqual(diff(after,await next.evaluate(()=>PhysShare.capture())),[],label+' must stay paused');
    assert.deepEqual(errors,[],label+' JavaScript errors');passes++;console.log('PASS '+label+' ('+url.length+' characters)');
  }finally{await next.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 let failed=0;
 try{for(const name of names){const page=await browser.newPage({viewport:{width:1440,height:1000}});try{
   page.on('pageerror',e=>console.error(name+': '+e.message));await page.goto('file://'+path.join(root,name+'_webapp_fr.html')+'?lang='+(process.env.LANGUAGE||'fr'));
   await page.waitForFunction(()=>window.PhysShare?.ready,{timeout:25000});
   await roundtrip(page,browser,name+' default');
   const select=async(id,value)=>{await page.selectOption('#'+id,value);await page.waitForTimeout(30);};
   const input=async(id,value)=>page.evaluate(({id,value})=>{const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},{id,value});
   const toggle=async id=>page.evaluate(id=>{const e=document.getElementById(id);e.checked=!e.checked;e.dispatchEvent(new Event('change',{bubbles:true}));},id);
   if(name==='cinematique_2d'){
     const id=await page.evaluate(()=>document.querySelector('select[id*="trajectory"]').id);
     for(const choice of await page.locator('#'+id+' option').evaluateAll(es=>es.map(e=>e.value))){await select(id,choice);await input('time-slider',1.7);await roundtrip(page,browser,name+' '+choice);}
     await page.evaluate(async()=>{const s=PhysShare.capture();s.data.origin={x:2.3,y:-1.7};s.data.view={xmin:-2,xmax:9,ymin:-1,ymax:10};await PhysShare.restore(s);});await roundtrip(page,browser,name+' translated origin and view');
   }else if(name==='cinematique_3d'){
     const id=await page.evaluate(()=>document.querySelector('select[id*="trajectory"]').id);
     for(const choice of await page.locator('#'+id+' option').evaluateAll(es=>es.map(e=>e.value))){await select(id,choice);await input('time-slider',1.7);await roundtrip(page,browser,name+' '+choice);}
     await page.evaluate(async()=>{const s=PhysShare.capture();s.data.camera.yaw=1.25;s.data.camera.pitch=Math.PI/2;s.data.camera.distance*=.85;await PhysShare.restore(s);});await toggle('full-trail');await roundtrip(page,browser,name+' top view and short trail');
   }else if(name==='collisions'){
     for(const dim of ['line','plane'])for(const mode of ['elastic','inelastic','sticking']){await select('dimension',dim);await select('mode',mode);await input('timeline',2.8);await roundtrip(page,browser,name+' '+dim+' '+mode);}
   }else if(name==='energie_mecanique'){
     for(const model of ['anharmonic','simple-pendulum','pendulum','gravity']){await select('model-select',model);await input('time-slider',2.33);await roundtrip(page,browser,name+' '+model);}
     await select('model-select','anharmonic');await toggle('friction-toggle');await page.waitForTimeout(80);await input('time-slider',3.2);await roundtrip(page,browser,name+' damped');
   }else if(name==='equilibres_statiques'){
     await input('phi1',35);await input('phi2',-115);await toggle('full-forces');await page.click('#play');await page.waitForTimeout(180);await roundtrip(page,browser,name+' oblique forces while playing');
   }else if(name==='frottements_solides'){
     await select('model-select','incline');await input('angle',35);await page.waitForTimeout(180);await input('mu-static',.7);await input('angle',-40);await page.waitForTimeout(180);await roundtrip(page,browser,name+' live friction/angle history');
     await select('model-select','horizontal');await select('force-mode','ramp');await page.click('#play');await page.waitForTimeout(180);await roundtrip(page,browser,name+' force ramp');
   }else if(name==='moment_cinetique'){
     for(const model of ['particle','shell','stool']){await select('model-select',model);await page.click('#play');await page.waitForTimeout(120);await input('torque',1.2);await page.click('#contract');await page.waitForTimeout(120);await roundtrip(page,browser,name+' '+model+' live torque/radius');}
   }else if(name==='potentiel_force'){
     await page.locator('#equilibrium-settings > summary').click();await page.locator('#equilibrium-buttons button').nth(1).click();await roundtrip(page,browser,name+' open equilibria and maximum parabola');
     await page.locator('#equilibrium-settings > summary').click();await roundtrip(page,browser,name+' folded equilibria and maximum parabola');
     for(const model of ['pair','gravity']){await select('model-select',model);await page.click('#motion-play');await page.waitForTimeout(120);await roundtrip(page,browser,name+' '+model+' moving');}
     await page.click('#dimension-toggle');await page.click('#dimension-2');await select('plane-model','double');await toggle('plane-show-surface');await input('motion-v0',1.2);await input('motion-angle',45);await page.locator('.motion-settings > summary').click();await page.click('#motion-play');await page.waitForTimeout(160);await roundtrip(page,browser,name+' surface, initial conditions open and moving particle');
   }else if(name==='poulies'){
     for(const model of ['fixed','mobile','atwood']){await select('model',model);await page.click('#play');await page.waitForTimeout(120);await roundtrip(page,browser,name+' '+model+' playing');}
   }else if(name==='puissance_travail'){
     for(const mode of ['paths','integrals']){await select('motion-mode',mode);await select('path-field','gravity');await input('path-strength',6);await input('path-time',3.2);await roundtrip(page,browser,name+' '+mode);}
   }
   await page.evaluate(()=>{for(const e of document.querySelectorAll('input[type="checkbox"]')){if(!e.disabled){e.checked=!e.checked;e.dispatchEvent(new Event('change',{bubbles:true}));}}});
   await page.waitForTimeout(100);await roundtrip(page,browser,name+' alternate display options');
 }catch(e){failed++;console.error('FAIL '+name+': '+e.message);}finally{await page.close();}}
 }finally{await browser.close();}console.log(passes+' configuration round-trips, '+failed+' failed apps.');if(failed)process.exitCode=1;
})();

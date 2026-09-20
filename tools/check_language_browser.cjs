/* Offline bilingual UI, configuration preservation and tablet layout regression. */
const {chromium,webkit,firefox}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const names=(process.env.APPS||'cinematique_2d,cinematique_3d,collisions,energie_mecanique,equilibres_statiques,frottements_solides,moment_cinetique,potentiel_force,poulies,puissance_travail').split(',');
const expected=['2D kinematics','3D kinematics','Collisions','Mechanical energy','Equilibrium and rotation','Dry friction','Angular momentum','Potential energy and force','Pulleys','Work and power'];
const englishTitles=Object.fromEntries('cinematique_2d,cinematique_3d,collisions,energie_mecanique,equilibres_statiques,frottements_solides,moment_cinetique,potentiel_force,poulies,puissance_travail'.split(',').map((x,i)=>[x,expected[i]]));
const wait=page=>page.waitForFunction(()=>window.PhysShare?.ready&&!document.querySelector('#phys-language')?.disabled&&document.querySelector('#phys-language'),null,{timeout:35000});
function comparable(state){
  // Status messages are localized; physical state and controls must be unchanged.
  const copy=JSON.parse(JSON.stringify(state));
  const clean=o=>{if(!o||typeof o!=='object')return;for(const k of Object.keys(o)){if(/message|status|notice/i.test(k)&&typeof o[k]==='string')delete o[k];else clean(o[k]);}};clean(copy);return copy;
}
async function switchLanguage(page,lang){
  await Promise.all([page.waitForURL(url=>url.searchParams.get('lang')===lang),page.selectOption('#phys-language',lang)]);
  await wait(page);
  await page.waitForFunction(lang=>document.documentElement.lang===lang&&document.querySelector('.phys-share-status')?.textContent,lang);
}
(async()=>{
 const engine=process.env.BROWSER||'chromium';
 const browser=await ({chromium,webkit,firefox}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 let failures=0,passes=0;const audit={};
 try{for(const name of names){const context=await browser.newContext({viewport:{width:1024,height:768},hasTouch:engine!=='firefox'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('file://'+path.join(root,name+'_webapp_fr.html')+'?lang=fr');await wait(page);
   assert.equal(await page.getAttribute('html','lang'),'fr');
   // Switch from a non-default example, changed parameter and display option.
   await page.evaluate(()=>{
    const select=[...document.querySelectorAll('select:not(#phys-language)')].find(e=>e.offsetWidth&&!e.disabled&&e.options.length>1);
    if(select){const choice=[...select.options].find(e=>!e.disabled&&e.value!==select.value);if(choice){select.value=choice.value;select.dispatchEvent(new Event('change',{bubbles:true}));}}
    const range=[...document.querySelectorAll('input[type=range]')].find(e=>e.offsetWidth&&!e.disabled);
    if(range){range.value=Number(range.min||0)+.4*(Number(range.max||100)-Number(range.min||0));range.dispatchEvent(new Event('input',{bubbles:true}));}
    const checkbox=[...document.querySelectorAll('input[type=checkbox]')].find(e=>e.offsetWidth&&!e.disabled);
    if(checkbox){checkbox.checked=!checkbox.checked;checkbox.dispatchEvent(new Event('change',{bubbles:true}));}
   });
   const before=await page.evaluate(async()=>{const url=await PhysShare.makeLink();const state=await PhysShare.decode(new URL(url).hash.split('=')[1]);await PhysShare.restore(state);return PhysShare.capture();});
   await switchLanguage(page,'en');
   assert.equal(await page.locator('h1').innerText(),englishTitles[name]);
   assert.equal(await page.locator('#share-configuration').innerText(),'Share');
   const after=await page.evaluate(()=>PhysShare.capture());
   assert.deepEqual(comparable(after),comparable(before),name+' physical state and controls');
   assert.ok(!('phys-language' in after.controls),'language must not become a physical control');
   await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>PhysShare.capture()),after,'opens paused');
   assert.equal(new URL(await page.evaluate(()=>PhysShare.makeLink())).searchParams.get('lang'),'en');
   assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0,'valid maths');
   for(const width of [1024,768,512]){
    await page.setViewportSize({width,height:768});await page.waitForTimeout(40);
    const layout=await page.evaluate(()=>{const s=document.getElementById('phys-language'),r=s.getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,h:r.height,right:r.right};});
    assert.ok(layout.scroll<=layout.width+2,name+' overflow at '+width+': '+JSON.stringify(layout));
    assert.ok(layout.h>=44&&layout.right<=width+1,'touch-friendly selector');
   }
   audit[name]=await page.evaluate(()=>({text:document.body.innerText,attributes:[...document.querySelectorAll('[aria-label]')].map(e=>e.getAttribute('aria-label'))}));
   if(process.env.SHOTS){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(process.env.SHOTS,name+'-en.png')});}
   await switchLanguage(page,'fr');assert.notEqual(await page.locator('#share-configuration').innerText(),'Share');
   assert.deepEqual(comparable(await page.evaluate(()=>PhysShare.capture())),comparable(before),'switch back preserves state');
   if(name==='cinematique_2d'){
    // A saved preference applies to another app; explicit URLs take precedence.
    await page.evaluate(()=>localStorage.setItem('phys1985-language','en'));
    await page.goto('file://'+path.join(root,'cinematique_3d_webapp_fr.html'));await wait(page);
    assert.equal(await page.getAttribute('html','lang'),'en');
    await page.goto('file://'+path.join(root,'cinematique_3d_webapp_fr.html')+'?lang=fr');await wait(page);
    assert.equal(await page.getAttribute('html','lang'),'fr');
   }
   assert.deepEqual(errors,[],'JavaScript errors');
   passes++;console.log('PASS '+engine+' '+name);
  }catch(error){failures++;console.error('FAIL '+engine+' '+name+': '+error.stack);}
  finally{await context.close();}
 }}finally{await browser.close();}
 if(process.env.AUDIT)fs.writeFileSync(process.env.AUDIT,JSON.stringify(audit,null,2));
 console.log(passes+' bilingual apps passed, '+failures+' failed.');if(failures)process.exitCode=1;
})();

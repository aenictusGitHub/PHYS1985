/* Genuine browser zoom, verified by both layout viewport and devicePixelRatio.
 * A temporary normal profile is required: Chrome settings cannot open in incognito.
 * No changes to the user's Chrome profile. Optional SCREENSHOT_DIR keeps visual evidence.
 */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const apps={
 cinematique_2d:{select:'trajectory-select',values:['ballistic','mc','butterfly']},
 cinematique_3d:{select:'trajectory-select',values:['ballistic','mcua','butterfly']},
 collisions:{select:'dimension',values:['line','plane']},
 energie_mecanique:{select:'model-select',values:['anharmonic','pendulum','gravity']},
 equilibres_statiques:{},frottements_solides:{select:'model-select',values:['incline','stack']},
 moment_cinetique:{select:'model-select',values:['particle','shell']},
 potentiel_force:{select:'model-select',values:['pair','gravity']},
 poulies:{select:'model',values:['fixed','atwood']},
 puissance_travail:{select:'motion-mode',values:['paths','integrals']}
};
const input=(page,id,value)=>page.evaluate(({id,value})=>{const e=document.getElementById(id);if(!e)throw Error('Missing '+id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},{id,value});
async function screenshot(page,filename){
 const cdp=await page.context().newCDPSession(page);
 try{const {data}=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(filename,Buffer.from(data,'base64'));}finally{await cdp.detach();}
}
async function inspect(page,label){
 const issues=await page.evaluate(()=>{
   const issues=[],visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
   const d=document.documentElement;if(d.scrollWidth>d.clientWidth+2)issues.push('page overflow '+d.scrollWidth+'/'+d.clientWidth);
   for(const e of document.querySelectorAll('.control-panel'))if(e.scrollWidth>e.clientWidth+2)issues.push('sidebar overflow '+e.scrollWidth+'/'+e.clientWidth);
   if(document.querySelector('mjx-merror,[data-mml-node="merror"]'))issues.push('MathJax error');
   // Detect actual clipping, while permitting an explicitly scrollable formula.
   for(const svg of document.querySelectorAll('.equation svg,mjx-container[display="true"] > svg')){
     if(!visible(svg)||svg.closest('.plot-label,.chart-label'))continue;
     const b=svg.getBoundingClientRect();let e=svg.parentElement;
     for(;e&&e!==document.body;e=e.parentElement){
       const s=getComputedStyle(e),r=e.getBoundingClientRect();
       if(['auto','scroll'].includes(s.overflowX)&&e.scrollWidth>e.clientWidth+1)break;
       if(['hidden','clip'].includes(s.overflowX)&&(b.left<r.left-2||b.right>r.right+2)){issues.push('clipped formula in '+(e.id||e.className));break;}
     }
   }
   const annotations=[...document.querySelectorAll('[data-scene-annotation],#scene-labels [data-label-key]')].filter(e=>visible(e)&&(e.dataset.sceneAnnotation||['mass','m1','m2','F','P','N','f','f1','f2','v1','v2'].includes(e.dataset.labelKey))).map(e=>({key:e.dataset.sceneAnnotation||e.dataset.labelKey,r:e.getBoundingClientRect()}));
   for(let i=0;i<annotations.length;i++)for(let j=i+1;j<annotations.length;j++){
     const a=annotations[i],b=annotations[j];
     if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1)issues.push('overlapping symbols '+a.key+'/'+b.key);
   }
   const canvas=document.getElementById('scene-canvas');
   if(document.body.dataset.app==='collisions'&&canvas){const scene=canvas.getBoundingClientRect();
     for(const a of annotations)for(const [x,y,r] of window.__testBodies||[]){
       const cx=scene.left+x,cy=scene.top+y,dx=Math.max(a.r.left-cx,0,cx-a.r.right),dy=Math.max(a.r.top-cy,0,cy-a.r.bottom);
       if(Math.hypot(dx,dy)<r+2)issues.push('symbol covers a sphere '+a.key);
     }
   }
   for(const canvas of document.querySelectorAll('canvas')){if(visible(canvas)){const b=canvas.getBoundingClientRect();if(b.width<100||b.height<60)issues.push('unusable canvas '+canvas.id);}}
   return [...new Set(issues)];
 });
 if(issues.length&&process.env.SCREENSHOT_DIR)await screenshot(page,path.join(process.env.SCREENSHOT_DIR,label.replace(/[^\w-]/g,'_')+'.png'));
 assert.deepEqual(issues,[],label);return 1;
}
(async()=>{
 if(process.env.SCREENSHOT_DIR)fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
 const browser=await chromium.launchPersistentContext('',{headless:true,viewport:{width:1440,height:1000},executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 let cases=0,failures=0;
 try{
  const settings=await browser.newPage();await settings.goto('chrome://settings/appearance');
  for(const [zoom,width] of [[1,1440],[1.5,1440],[2,1440],[2,780]]){
   await settings.evaluate(z=>new Promise(resolve=>chrome.settingsPrivate.setDefaultZoom(z,resolve)),zoom);
   for(const [app,config] of Object.entries(apps).filter(([name])=>!process.env.APPS||process.env.APPS.split(',').includes(name))){
    const page=await browser.newPage();await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const p=CanvasRenderingContext2D.prototype,clear=p.clearRect,arc=p.arc,fill=p.fill;
      p.clearRect=function(...a){if(this.canvas.id==='scene-canvas')window.__testBodies=[];return clear.apply(this,a);};
      p.arc=function(x,y,r,...a){this.__lastTestArc=[x,y,r];return arc.call(this,x,y,r,...a);};
      p.fill=function(...a){if(this.canvas.id==='scene-canvas'&&this.fillStyle instanceof CanvasGradient&&this.__lastTestArc)(window.__testBodies||=[]).push(this.__lastTestArc);return fill.apply(this,a);};
    });
    try{
     await page.goto('file://'+path.join(root,app+'_webapp_fr.html')+'?lang='+(process.env.LANGUAGE||'fr'));await page.waitForFunction(()=>window.PhysShare?.ready,{timeout:25000});
     const metrics=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));assert(Math.abs(metrics.width-width/zoom)<2,'native layout zoom');assert(Math.abs(metrics.dpr-zoom)<.01,'native DPR zoom');
     const prefix=app+'-'+zoom+'x-'+width;
     cases+=await inspect(page,prefix+'-default');
     const selector=config.select?.startsWith('trajectory')?await page.evaluate(()=>document.querySelector('select[id*="trajectory"]').id):config.select;
     for(const choice of config.values||[]){
      await page.selectOption('#'+selector,choice);await page.waitForTimeout(30);
      cases+=await inspect(page,prefix+'-'+choice);
     }
     if(app==='collisions'){
      for(const dim of ['line','plane'])for(const mode of ['elastic','inelastic','sticking']){
       await page.selectOption('#dimension',dim);await page.selectOption('#mode',mode);
       const tc=await page.evaluate(()=>{const s=PhysShare.capture().data;return new CollisionPhysics.Simulation(s.dimension,s.p).tc;});
       assert(Number.isFinite(tc),'fixture must collide');
       for(const t of [Math.max(0,tc-.05),tc,tc+.05,tc+.5,tc+1]){await input(page,'timeline',t);cases+=await inspect(page,prefix+'-'+dim+'-'+mode+'-t'+t);}
      }
     }
     if(app==='equilibres_statiques'){
      await input(page,'d1',.2);await input(page,'d2',.2);await input(page,'phi1',35);await input(page,'phi2',145);await page.check('#full-forces');cases+=await inspect(page,prefix+'-forces-near-pivot');
     }
     if(app==='frottements_solides'){
       await page.selectOption('#model-select','incline');await input(page,'vector-scale',4);
       for(const angle of [-60,-30,0,30,60]){await input(page,'angle',angle);await page.evaluate(()=>{const e=document.getElementById('play');if(e.textContent==='Pause')e.click();});cases+=await inspect(page,prefix+'-incline-'+angle);}
       await page.selectOption('#model-select','stack');await input(page,'force',24);await page.waitForTimeout(160);await page.evaluate(()=>{const e=document.getElementById('play');if(e.textContent==='Pause')e.click();});cases+=await inspect(page,prefix+'-stack-sliding');
     }
     if(app==='puissance_travail'){
      for(const mode of ['free','paths','integrals']){await page.selectOption('#motion-mode',mode);
       const id=mode==='free'?'force-field-select':'path-field';
       for(const field of await page.locator('#'+id+' option').evaluateAll(es=>es.map(e=>e.value))){await page.selectOption('#'+id,field);cases+=await inspect(page,prefix+'-'+mode+'-'+field);}
      }
     }
     if(app==='potentiel_force'){
      await page.selectOption('#model-select','wells');await page.locator('#equilibrium-settings > summary').click();
      await page.locator('#equilibrium-buttons button').nth(1).click();cases+=await inspect(page,prefix+'-maximum-parabola');
      if(process.env.SCREENSHOT_DIR&&zoom===2&&width===1440){await page.locator('#potential-plot').evaluate(e=>e.scrollIntoView({block:'center'}));await screenshot(page,path.join(process.env.SCREENSHOT_DIR,'potential-parabola-200pct.png'));}
      await page.click('#dimension-toggle');cases+=await inspect(page,prefix+'-dimension-menu-open');
      await page.click('#dimension-2');await page.selectOption('#plane-model','saddle');await page.check('#plane-show-surface');cases+=await inspect(page,prefix+'-saddle-surface');
      await page.locator('#plane-equilibrium-settings > summary').click();await page.locator('#plane-equilibria button').first().click();cases+=await inspect(page,prefix+'-saddle-parabolas');
      await input(page,'motion-v0',2.38);await input(page,'motion-angle',-94);cases+=await inspect(page,prefix+'-initial-velocity');
      await page.locator('.motion-settings > summary').click();cases+=await inspect(page,prefix+'-positions-in-initial-conditions');
     }
     // The sharing panel itself must remain within the sidebar even for long links.
     await page.click('#share-configuration');await page.waitForFunction(()=>document.getElementById('share-configuration-link').value);cases+=await inspect(page,prefix+'-share-open');
     if(process.env.SCREENSHOT_DIR&&zoom===2&&width===1440){
       // Do not pass a CSS-pixel clip: the native zoom surface is in device pixels.
       await screenshot(page,path.join(process.env.SCREENSHOT_DIR,app+'-controls-200pct.png'));
       await page.locator('canvas:visible').first().evaluate(e=>e.scrollIntoView({block:'center'}));
       await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
       await screenshot(page,path.join(process.env.SCREENSHOT_DIR,app+'-scene-200pct.png'));
     }
     assert.deepEqual(errors,[],prefix+' script errors');console.log('PASS '+prefix);
    }catch(error){failures++;console.error('FAIL '+app+' @'+zoom+'x/'+width+': '+error.message);}finally{await page.close();}
   }
  }
 }finally{await browser.close();}
 console.log(cases+' display checks, '+failures+' failed groups.');if(failures)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

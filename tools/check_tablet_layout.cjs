const pw=require('playwright'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const out=process.env.RESULT_DIR||fs.mkdtempSync(require('node:os').tmpdir()+'/phys1985-tablet-layout-');
fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const apps={
 cinematique_2d:'trajectory-select',cinematique_3d:'trajectory-select',collisions:'dimension',energie_mecanique:'model-select',equilibres_statiques:'preset',frottements_solides:'model-select',moment_cinetique:'model-select',potentiel_force:'model-select',poulies:'model',puissance_travail:'motion-mode'
};
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function pause(p){for(const b of await p.locator('button:visible').all())if((await b.innerText()).trim()==='Pause')await b.tap();}
async function inspect(p){return p.evaluate(()=>{
 const issues=[],visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
 const d=document.documentElement;if(d.scrollWidth>d.clientWidth+2)issues.push('page overflow '+d.scrollWidth+'/'+d.clientWidth);
 for(const e of document.querySelectorAll('.control-panel,.visualization-panel'))if(e.scrollWidth>e.clientWidth+2)issues.push('panel overflow '+e.className+' '+e.scrollWidth+'/'+e.clientWidth);
 if(document.querySelector('mjx-merror,[data-mml-node="merror"]'))issues.push('MathJax error');
 for(const svg of document.querySelectorAll('.equation svg,mjx-container[display="true"] > svg')){
  if(!visible(svg)||svg.closest('.plot-label,.chart-label'))continue;
  const b=svg.getBoundingClientRect();for(let e=svg.parentElement;e&&e!==document.body;e=e.parentElement){
   const s=getComputedStyle(e),r=e.getBoundingClientRect();
   if(['auto','scroll'].includes(s.overflowX)&&e.scrollWidth>e.clientWidth+1)break;
   if(['hidden','clip'].includes(s.overflowX)&&(b.left<r.left-2||b.right>r.right+2)){issues.push('clipped formula '+(e.id||e.className));break;}
  }
 }
 for(const c of document.querySelectorAll('canvas'))if(visible(c)){const b=c.getBoundingClientRect();if(b.width<100||b.height<60)issues.push('small canvas '+c.id);}
 const small=[...document.querySelectorAll('button,select,summary,input[type=checkbox]')].filter(visible).map(e=>{
  const box=e.type==='checkbox'?(e.closest('label')||e).getBoundingClientRect():e.getBoundingClientRect();
  return {id:e.id||e.textContent.trim().slice(0,40),w:Math.round(box.width),h:Math.round(box.height)};
 }).filter(b=>b.w<44||b.h<44);
 return {issues:[...new Set(issues)],small,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}};
});}
async function runEngine(engine){
 const browser=await pw[engine].launch({headless:true,...engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}}),results=[];
 try{for(const viewport of [{width:600,height:960},{width:768,height:1024},{width:1024,height:1366},{width:1180,height:820}])for(const [app,select]of Object.entries(apps)){
  const p=await browser.newPage({viewport,hasTouch:true,...engine!=='firefox'?{isMobile:true}:{},deviceScaleFactor:2});p.setDefaultTimeout(7000);
  const row={engine,app,viewport,cases:[],controls:{},errors:[]};p.on('pageerror',e=>row.errors.push(e.message));
  const check=async name=>{await frames(p);const data=await inspect(p);row.cases.push({name,...data});if(data.issues.length)await p.screenshot({path:path.join(out,'screenshots',`${engine}-${app}-${viewport.width}-${name}.png`)});};
  try{
   await p.goto('file://'+path.join(root,app+'_webapp_fr.html'));await p.waitForFunction(()=>window.PhysShare?.ready,{timeout:25000});await pause(p);await check('default');
   const play=p.locator(app==='potentiel_force'?'#motion-play':app.startsWith('cinematique')||app==='puissance_travail'?'#play-button':'#play');
   await play.tap();await p.waitForTimeout(100);row.controls.play=(await play.innerText()).trim()==='Pause';await pause(p);
   const checkbox=p.locator('input[type=checkbox]:visible:not([disabled])').first();
   if(await checkbox.count()){const val=await checkbox.isChecked();await checkbox.tap();row.controls.checkbox=(await checkbox.isChecked())!==val;await checkbox.tap();}
   const slider=p.locator('input[type=range]:visible:not([disabled])').first();
   if(await slider.count()){
    const old=await slider.inputValue(),b=await slider.boundingBox();const frac=await slider.evaluate(e=>(Number(e.value)-Number(e.min))/(Number(e.max)-Number(e.min)));
    await slider.tap({position:{x:b.width*(frac<.5?.8:.2),y:b.height/2}});await frames(p);
    row.controls.slider={id:await slider.getAttribute('id'),before:old,after:await slider.inputValue(),changed:old!==await slider.inputValue()};await pause(p);
   }
   for(const value of await p.locator('#'+select+' option:not([disabled])').evaluateAll(es=>es.map(e=>e.value))){
    await p.selectOption('#'+select,value);await pause(p);await check(value);
   }
   if(app==='potentiel_force'){
    await p.locator('#dimension-toggle').tap();await check('dimension-menu');await p.locator('#dimension-2').tap();
    for(const model of ['bowl','saddle','double']){await p.selectOption('#plane-model',model);await check('plane-'+model);}
    await p.locator('#plane-show-surface').tap();await check('surface');
   }
   await p.locator('#share-configuration').tap();await p.waitForFunction(()=>document.getElementById('share-configuration-link').value);row.controls.share=true;await check('share');
   if(viewport.width===768)await p.screenshot({path:path.join(out,'screenshots',`${engine}-${app}-768-controls.png`)});
  }catch(e){row.failure=e.message;console.error('FAIL',engine,app,viewport.width,e.message.split('\n')[0]);}finally{await p.close();results.push(row);fs.writeFileSync(path.join(out,engine+'-layout.json'),JSON.stringify(results,null,2));}
  console.log(engine,app,viewport.width,row.failure?'ERROR':`${row.cases.length} cases, ${row.cases.filter(c=>c.issues.length).length} layout issues`,JSON.stringify(row.controls));
 }}finally{await browser.close();}
 return results;
}
(async()=>{const engines=(process.env.ENGINES||'chromium,webkit,firefox').split(',');const rows=(await Promise.all(engines.map(runEngine))).flat();
 const failures=rows.filter(r=>r.failure||r.errors.length||!r.controls.play||!r.controls.checkbox||!r.controls.share||!r.controls.slider?.changed||r.cases.some(c=>c.issues.length||c.small.length));
 console.log(`${rows.reduce((n,r)=>n+r.cases.length,0)} layout checks; ${failures.length} failed tablet groups. Results: ${out}`);
 if(failures.length){console.error(JSON.stringify(failures.map(r=>({engine:r.engine,app:r.app,width:r.viewport.width,failure:r.failure,errors:r.errors,cases:r.cases.filter(c=>c.issues.length||c.small.length)})),null,2));process.exitCode=1;}
})().catch(e=>{console.error(e);process.exitCode=1;});

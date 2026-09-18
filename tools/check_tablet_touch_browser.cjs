// Native two-finger input: verify page/scene zoom AND mechanical-state invariance.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const out=process.env.RESULT_DIR||fs.mkdtempSync(require('node:os').tmpdir()+'/phys1985-tablet-touch-');fs.mkdirSync(out,{recursive:true});
const apps={cinematique_2d:['#scene-canvas'],cinematique_3d:['#viewport > canvas'],collisions:['#scene-canvas','#history-canvas'],energie_mecanique:['#scene-canvas','#history-canvas','.mass-handle'],equilibres_statiques:['#scene-canvas'],frottements_solides:['#scene-canvas','#history-canvas','#force-history-canvas'],moment_cinetique:['#scene-canvas','#history-canvas'],potentiel_force:['#potential-canvas','#force-canvas','.body-handle'],poulies:['#scene-canvas','#history-canvas'],puissance_travail:['#scene-canvas','#power-canvas']};
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function pause(p){for(const b of await p.locator('button:visible').all())if((await b.innerText()).trim()==='Pause')await b.tap();}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),results=[];
 try{for(const viewport of [{width:768,height:1024},{width:1180,height:820}])for(const [app,selectors]of Object.entries(apps)){
  if(process.env.APPS&&!process.env.APPS.split(',').includes(app))continue;
  const p=await browser.newPage({viewport,hasTouch:true,isMobile:process.env.MOBILE!=='0',deviceScaleFactor:2});p.setDefaultTimeout(10000);const c=await p.context().newCDPSession(p),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  try{
   await p.goto('file://'+path.join(root,app+'_webapp_fr.html'));await p.waitForFunction(()=>window.PhysShare?.ready);await pause(p);
   const touch=async(type,touchPoints)=>{await c.send('Input.dispatchTouchEvent',{type,touchPoints});await frames(p);};
   const test=async(selector,label=selector,anchor=null)=>{
    await c.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await pause(p);
    const el=p.locator(selector).first();if(!await el.isVisible())return;
    await el.evaluate(e=>e.scrollIntoView({block:'center'}));await frames(p);
    const b=await el.boundingBox(),handle=b.width<100||!!anchor,range=await el.evaluate(e=>e.matches('input[type="range"]'));
    const point=anchor?await p.evaluate(({anchor,w,h})=>{
      const s=PhysShare.capture().data;
      if(anchor.startsWith('force')){const f=StaticsPhysics.solve(s.p,s.motion).forces[Number(anchor.slice(-1))-1];return StaticsPhysics.geometry(w,h).point(f.x,f.y);}
      const sim=new PulleyPhysics.Experiment(s.p);sim.seek(s.t);const g=PulleyPhysics.geometry(s.p,w,h,sim.at().pull);return g[anchor==='pulley-handle'?'handle':'load'];
    },{anchor,w:b.width,h:b.height}):null;
    const cy=point?b.y+point[1]:(Math.max(b.y,20)+Math.min(b.y+b.height,viewport.height-20))/2;
    const cx=point?b.x+point[0]:handle?b.x+b.width/2:Math.max(100,Math.min(viewport.width-110,b.x+b.width*.52));
    const h=handle?65:Math.min(b.width*.15,65);
    // For a handle, the first finger is precisely on it, second on its scene.
    const a={id:1,x:handle?cx:cx-h,y:cy},bb={id:2,x:handle?cx+2*h:cx+h,y:cy};
    if(bb.x>viewport.width-10){bb.x=a.x-2*h;}
    const custom=app.startsWith('cinematique')&&!range;
    const start=await p.evaluate(()=>({data:PhysShare.capture().data,controls:PhysShare.capture().controls,scale:visualViewport.scale}));
    await touch('touchStart',[a]);
    // A small tentative edit before the second finger must also be undone.
    const moved={...a,x:a.x+5,y:a.y+(anchor==='pulley-handle'?5:anchor==='pulley-load'?-5:0)};if(!custom)await touch('touchMove',[moved]);
    if(anchor)assert.notDeepEqual(await p.evaluate(()=>PhysShare.capture().data),start.data,anchor+' first finger really edits the object');
    await touch('touchStart',[custom?a:moved,bb]);
    const center=(a.x+bb.x)/2,side=Math.sign(a.x-bb.x),half=Math.abs(a.x-bb.x)/2;
    let pair;
    for(let i=1;i<=10;i++){
      const distance=half*(1+i/10);
      pair=[{id:1,x:center+side*distance,y:cy},{id:2,x:center-side*distance,y:cy}];
      await touch('touchMove',pair);
    }
    const zoomed=await p.evaluate(()=>({data:PhysShare.capture().data,scale:visualViewport.scale}));
    // Release one finger, move the survivor: never start an object edit mid-pinch.
    await touch('touchEnd',[pair[1]]);await touch('touchMove',[{...pair[0],x:pair[0].x+8}]);await touch('touchEnd',[]);await frames(p);
    const end=await p.evaluate(()=>({data:PhysShare.capture().data,controls:PhysShare.capture().controls,scale:visualViewport.scale}));
    if(custom){
      assert.equal(zoomed.scale,start.scale,'page must not zoom over a custom scene');
      if(app==='cinematique_2d'){assert((zoomed.data.view.xmax-zoomed.data.view.xmin)<(start.data.view.xmax-start.data.view.xmin)*.8);assert.deepEqual(end.data.origin,start.data.origin);}
      else assert(zoomed.data.camera.distance<start.data.camera.distance*.8);
      assert.deepEqual(end.data.state,start.data.state);
    }else{
      assert.deepEqual(end.data,start.data,`${label}: gesture altered physics/view`);
      assert.deepEqual(end.controls,start.controls,`${label}: gesture altered controls`);
      // Native form widgets may consume zoom themselves. Their mandatory
      // invariant is that two fingers must never change a parameter.
      if(!range)assert(zoomed.scale>start.scale+0.05,`${label}: native pinch blocked (${zoomed.scale})`);
    }
    assert.deepEqual(errors,[]);
    results.push({app,viewport,label,scale:zoomed.scale,passed:true});console.log('PASS',app,viewport.width,label);
    await c.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    // No stale capture/lock may swallow the NEXT ordinary one-finger action.
    if(range){
      const field=p.locator(selector).first();await field.scrollIntoViewIfNeeded();
      const old=await field.inputValue(),r=await field.boundingBox(),f=await field.evaluate(e=>(Number(e.value)-Number(e.min))/(Number(e.max)-Number(e.min)));
      await field.tap({position:{x:r.width*(f<.5?.8:.2),y:r.height/2}});assert.notEqual(await field.inputValue(),old,'single-finger slider after pinch');await pause(p);
    }
   };
   for(const selector of selectors)await test(selector);
   if(app==='equilibres_statiques')for(const anchor of ['force1','force2'])await test('#scene-canvas',anchor,anchor);
   if(app==='poulies')for(const anchor of ['pulley-handle','pulley-load'])await test('#scene-canvas',anchor,anchor);
   // The native range UI must not change time/parameters during a pinch either.
   const range=p.locator('input[type=range]:visible:not([disabled])').first();
   if(await range.count())await test('#'+await range.getAttribute('id'),'range');
   if(app==='potentiel_force'){
    await p.locator('#dimension-toggle').tap();await p.locator('#dimension-2').tap();
    await test('#plane-canvas');await test('#plane-x-canvas');await test('#plane-y-canvas');
    await p.locator('#plane-show-surface').tap();await test('#surface-canvas');
   }
   if(app==='puissance_travail'){
    await p.selectOption('#motion-mode','paths');await test('#path-canvas');await test('#path-a');await test('#path-b');await test('#path-work-canvas');
    await p.selectOption('#motion-mode','integrals');await test('#integral-time-canvas');await test('#integral-space-canvas');
   }
  }catch(e){results.push({app,viewport,error:e.message});console.error('FAIL',app,viewport.width,e.stack);}finally{await p.close();fs.writeFileSync(path.join(out,'touch.json'),JSON.stringify(results,null,2));}
 }}finally{await browser.close();}
 const failures=results.filter(r=>r.error);console.log(`${results.filter(r=>r.passed).length} passed pinch checks, ${failures.length} failed groups. Results: ${out}`);if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});

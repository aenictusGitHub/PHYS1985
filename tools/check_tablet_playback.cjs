// A pinch may cancel a tentative edit, but must not leave playback paused.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const targets={collisions:'#history-canvas',energie_mecanique:'#history-canvas',equilibres_statiques:'#scene-canvas',frottements_solides:'#history-canvas',moment_cinetique:'#scene-canvas',potentiel_force:'#potential-canvas',poulies:'#history-canvas',puissance_travail:'#scene-canvas'};
const frames=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
function parameters(d){return d.p||d.parameters||{initial:d.motion.initial,settings:d.motion.settings,energy:d.state.energy,length:d.state.length};}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});let count=0;
 try{for(const [app,target]of Object.entries(targets)){
  const p=await browser.newPage({viewport:{width:1024,height:1366},hasTouch:true,isMobile:true,deviceScaleFactor:2}),c=await p.context().newCDPSession(p),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  try{
   await p.goto('file://'+path.join(root,app+'_webapp_fr.html'));await p.waitForFunction(()=>window.PhysShare?.ready);
   const button=p.locator(app==='potentiel_force'?'#motion-play':app==='puissance_travail'?'#play-button':'#play');
   if((await button.innerText()).trim()!=='Pause')await button.tap();await p.waitForTimeout(120);
   const plot=p.locator(target);await plot.evaluate(e=>e.scrollIntoView({block:'center'}));await frames(p);
   const b=await plot.boundingBox(),cx=b.x+b.width*.55,cy=(Math.max(20,b.y)+Math.min(1340,b.y+b.height))/2;
   const first={id:1,x:cx-60,y:cy},second={id:2,x:cx+60,y:cy};
   const before=await p.evaluate(()=>PhysShare.capture().data);
   const touch=async(type,touchPoints)=>{await c.send('Input.dispatchTouchEvent',{type,touchPoints});await frames(p);};
   await touch('touchStart',[first]);await touch('touchMove',[{...first,x:first.x+5}]);await touch('touchStart',[{...first,x:first.x+5},second]);
   let pair;for(let i=1;i<=8;i++){pair=[{...first,x:first.x-i*8},{...second,x:second.x+i*8}];await touch('touchMove',pair);}
   await touch('touchStart',[...pair,{id:3,x:cx,y:cy+30}]);await touch('touchMove',[...pair,{id:3,x:cx+10,y:cy+30}]);await touch('touchEnd',[{id:3,x:cx+10,y:cy+30}]);
   await touch('touchEnd',[pair[1]]);await touch('touchMove',[{...pair[0],x:pair[0].x-5}]);await touch('touchEnd',[]);
   assert.equal((await button.innerText()).trim(),'Pause',app+' should still be playing');
   assert.deepEqual(parameters(await p.evaluate(()=>PhysShare.capture().data)),parameters(before),app+' parameters unchanged');
   await c.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await button.tap();assert.equal((await button.innerText()).trim(),'Lire');
   const field=p.locator('input[type=range]:visible:not([disabled])').first();await field.scrollIntoViewIfNeeded();
   const old=await field.inputValue(),r=await field.boundingBox(),f=await field.evaluate(e=>(Number(e.value)-Number(e.min))/(Number(e.max)-Number(e.min)));
   await field.tap({position:{x:r.width*(f<.5?.8:.2),y:r.height/2}});assert.notEqual(await field.inputValue(),old,'one-finger control still works');
   assert.deepEqual(errors,[]);console.log('PASS playback, three fingers and next control:',app);count++;
  }finally{await p.close();}
 }}finally{await browser.close();}console.log(count+' playback/gesture checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

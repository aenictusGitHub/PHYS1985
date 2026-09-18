'use strict';
// Native touch events, including capture/cancellation, in tablet-sized Chrome.
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const near=(a,b,tol=1e-4)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const axes=['x','y','z'],plus=(a,b)=>Object.fromEntries(axes.map(k=>[k,a[k]+b[k]]));
const scale=(v,s)=>Object.fromEntries(axes.map(k=>[k,v[k]*s]));
const minus=(a,b)=>plus(a,scale(b,-1)),dot=(a,b)=>axes.reduce((s,k)=>s+a[k]*b[k],0);
const sameCamera=(a,b)=>{for(const k of ['yaw','pitch','distance','fov'])near(a[k],b[k]);for(const k of axes)near(a.target[k],b.target[k]);};
const basis=(c,h)=>{
 const cy=Math.cos(c.yaw),sy=Math.sin(c.yaw),cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
 return {right:{x:cy,y:0,z:-sy},up:{x:-sy*sp,y:cp,z:-cy*sp},forward:{x:-cp*sy,y:-sp,z:-cp*cy},focal:h/2/Math.tan(c.fov/2)};
};
const anchorAt=(c,r,p)=>{const b=basis(c,r.height);return plus(c.target,plus(scale(b.right,(p.x-r.x-r.width/2)*c.distance/b.focal),scale(b.up,(r.y+r.height/2-p.y)*c.distance/b.focal)));};
const project=(point,c,r)=>{
 const b=basis(c,r.height),eye=minus(c.target,scale(b.forward,c.distance)),delta=minus(point,eye),depth=dot(delta,b.forward);
 return {x:r.x+r.width/2+dot(delta,b.right)*b.focal/depth,y:r.y+r.height/2-dot(delta,b.up)*b.focal/depth};
};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{for(const viewport of [{width:1024,height:1366},{width:1180,height:820},{width:768,height:1024}]){
  const page=await browser.newPage({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__wheelDeltas=[];
   document.addEventListener('wheel',e=>{if(e.target.tagName==='CANVAS')window.__wheelDeltas.push(e.deltaY);},{capture:true,passive:true});
  });
  const cdp=await page.context().newCDPSession(page);
  try{
   await page.goto(pathToFileURL(path.join(root,'cinematique_3d_webapp_fr.html')).href);
   await page.waitForFunction(()=>window.PhysShare?.ready&&!document.getElementById('loading-message'));
   if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
   const capture=()=>page.evaluate(()=>PhysShare.capture().data),camera=async()=>(await capture()).camera;
   const box=async()=>{await page.locator('#viewport > canvas').scrollIntoViewIfNeeded();return page.locator('#viewport > canvas').boundingBox();};
   const touch=async(type,points)=>{
    await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   };
   const finger=(id,x,y)=>({id,x,y});
   const reset=async()=>{await page.locator('#reset-view').click();return box();};
   assert.equal(await page.locator('#viewport > canvas').evaluate(e=>getComputedStyle(e).touchAction),'none');
   let r=await box();
   const scaleBefore=await page.evaluate(()=>visualViewport.scale);
   for(const preset of ['reset-view','front-view','side-view','top-view']){
    await page.locator('#'+preset).click();r=await box();
    const before=await capture(),c=before.camera,center={x:r.x+r.width*.43,y:r.y+r.height*.62},h=Math.min(50,r.width*.11);
    const a=finger(1,center.x-h,center.y),b=finger(2,center.x+h,center.y),anchor=anchorAt(c,r,center);
    await touch('touchStart',[a]);await touch('touchStart',[a,b]);
    const shifted={x:center.x+13,y:center.y-9},aa=finger(1,shifted.x-1.5*h,shifted.y),bb=finger(2,shifted.x+1.5*h,shifted.y);
    await touch('touchMove',[aa,bb]);
    let after=await camera();near(after.distance,c.distance/1.5,.01);near(after.yaw,c.yaw);near(after.pitch,c.pitch);
    let screen=project(anchor,after,r);near(screen.x,shifted.x,.001);near(screen.y,shifted.y,.001);
    assert.deepEqual((await capture()).state,before.state,'Pinching changes only the view');
    near(await page.evaluate(()=>visualViewport.scale),scaleBefore);
    await touch('touchMove',[a,b]);sameCamera(await camera(),c);
    // A pure two-finger translation changes the center, not distance/orientation.
    await touch('touchMove',[{...a,x:a.x+10},{...b,x:b.x+10}]);after=await camera();near(after.distance,c.distance,.01);near(after.yaw,c.yaw);near(after.pitch,c.pitch);
    screen=project(anchor,after,r);near(screen.x,center.x+10,.001);near(screen.y,center.y,.001);
    await touch('touchEnd',[{...b,x:b.x+10}]);sameCamera(await camera(),after);
    await touch('touchMove',[{...a,x:a.x+22,y:a.y-7}]);const rotated=await camera();
    near(rotated.yaw,after.yaw-12*.006);near(rotated.pitch,Math.max(-Math.PI/2,Math.min(Math.PI/2,after.pitch-7*.006)));
    near(rotated.distance,after.distance);assert.deepEqual(rotated.target,after.target);
    await touch('touchEnd',[]);assert.equal(await page.locator('#viewport > canvas').evaluate(e=>e.style.cursor),'grab');
   }
   r=await reset();const center={x:r.x+r.width*.45,y:r.y+r.height*.6},h=Math.min(75,r.width*.15),pair=d=>[finger(1,center.x-d,center.y),finger(2,center.x+d,center.y)];
   await touch('touchStart',pair(h));await touch('touchMove',pair(2));near((await camera()).distance,26000);await touch('touchCancel',[]);
   await touch('touchStart',pair(2));await touch('touchMove',pair(h));near((await camera()).distance,5200);await touch('touchEnd',[]);
   // Keep the original pair when a third finger appears; rebase when one leaves.
   r=await reset();const p1=finger(1,center.x-35,center.y),p2=finger(2,center.x+35,center.y),p3=finger(3,center.x,center.y+30);
   await touch('touchStart',[p1,p2]);const beforeThird=await camera();await touch('touchStart',[p1,p2,p3]);
   await touch('touchMove',[p1,p2,{...p3,x:p3.x+17}]);sameCamera(await camera(),beforeThird);
   await touch('touchEnd',[p1]);sameCamera(await camera(),beforeThird);await touch('touchCancel',[]);
   await touch('touchStart',[p1]);await touch('touchMove',[{...p1,x:p1.x+10}]);near((await camera()).yaw,beforeThird.yaw-.06);await touch('touchEnd',[]);
   // Loss of focus or an explicit preset during a gesture must clear its state.
   await touch('touchStart',[p1,p2]);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   const blurred=await camera();await touch('touchMove',[{...p1,x:p1.x-15},{...p2,x:p2.x+15}]);sameCamera(await camera(),blurred);await touch('touchCancel',[]);
   await touch('touchStart',[p1,p2]);await page.locator('#side-view').evaluate(e=>e.click());const aligned=await camera();
   await touch('touchMove',[{...p1,x:p1.x-15},{...p2,x:p2.x+15}]);sameCamera(await camera(),aligned);await touch('touchCancel',[]);
   // The old mouse wheel and shifted drag remain usable after touch cancellation.
   r=await reset();let c=await camera();await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-120);
   await page.waitForFunction(d=>PhysShare.capture().data.camera.distance<d,c.distance);
   const wheelDelta=await page.evaluate(()=>window.__wheelDeltas.reduce((s,v)=>s+v,0));
   near((await camera()).distance,c.distance*Math.exp(wheelDelta*.0012),.01);
   c=await camera();await page.keyboard.down('Shift');await page.mouse.down();await page.mouse.move(center.x+15,center.y+9,{steps:4});await page.mouse.up();await page.keyboard.up('Shift');
   near((await camera()).yaw,c.yaw);near((await camera()).pitch,c.pitch);near((await camera()).distance,c.distance);assert.notDeepEqual((await camera()).target,c.target);
   const saved=await capture(),link=await page.evaluate(()=>PhysShare.makeLink());await page.goto(link);await page.waitForFunction(()=>window.PhysShare?.ready);
   sameCamera(await camera(),saved.camera);assert.deepEqual((await capture()).state,saved.state);assert.equal(await page.locator('#play-button').innerText(),'Lire');
   assert.deepEqual(errors,[]);assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(process.env.SCREENSHOT_DIR){await reset();await touch('touchStart',pair(h));await touch('touchMove',pair(h*1.25));await touch('touchEnd',[]);await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`3d-touch-${viewport.width}.png`)});}
   console.log(`PASS tablet ${viewport.width}×${viewport.height}: four views, anchored pinch/pan, bounds, one/two/three fingers, cancellation, mouse and shared camera.`);
  }finally{await cdp.detach();await page.close();}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

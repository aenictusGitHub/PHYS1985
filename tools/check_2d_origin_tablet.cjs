'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const close=(a,b)=>assert(Math.abs(a-b)<.02,`${a} != ${b}`);
(async()=>{
 for(const name of ['chromium','webkit']){
  const browser=await ({chromium,webkit}[name]).launch(name==='chromium'?{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{headless:true});
  try{
   for(const viewport of [{width:1024,height:1366},{width:1180,height:820},{width:768,height:1024}]){
    const page=await browser.newPage({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:2}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file://'+path.join(root,'cinematique_2d_webapp_fr.html'));
    await page.waitForFunction(()=>window.PhysShare?.ready);
    await page.locator('#move-origin').click();
    await page.locator('#viewport').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>matchMedia('(any-pointer: coarse)').matches));
    const check=async()=>{
     const b=await page.locator('#origin-handle').boundingBox(),p=await page.locator('.origin-point').boundingBox();
     assert(b&&p);close(b.width,b.height);assert(b.width>=44);
     close(p.width,p.height);close(p.width,10);
     close(b.x+b.width/2,p.x+p.width/2);close(b.y+b.height/2,p.y+p.height/2);
    };
    await check();
    const before=await page.evaluate(()=>PhysShare.capture().data);
    const b=await page.locator('#origin-handle').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
    if(name==='chromium'){
     const cdp=await page.context().newCDPSession(page);
     const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));};
     await touch('touchStart',[{id:1,x,y}]);
     for(let i=1;i<=5;i++){await touch('touchMove',[{id:1,x:x+i*10,y:y-i*10}]);await check();}
     await touch('touchEnd',[]);
    }else{
     await page.mouse.move(x,y);await page.mouse.down();
     for(let i=1;i<=5;i++){await page.mouse.move(x+i*10,y-i*10);await check();}
     await page.mouse.up();
    }
    const after=await page.evaluate(()=>PhysShare.capture().data);
    assert.notDeepEqual(after.origin,before.origin);await check();
    assert.deepEqual(errors,[]);
    if(process.env.SCREENSHOT_DIR&&viewport.width===1024)await page.locator('#origin-handle').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'origin-circle-'+name+'.png')});
    console.log(`PASS ${name} ${viewport.width}x${viewport.height}: circular, centred, 44px touch target, drag`);
    await page.close();
   }
   const page=await browser.newPage();
   await page.goto('file://'+path.join(root,'cinematique_3d_webapp_fr.html'));await page.waitForFunction(()=>window.PhysShare?.ready);
   assert.equal(await page.locator('#origin-handle,.origin-controls,#move-origin').count(),0);
   assert.equal(await page.locator('#trajectory-select option[value="mcua"]').textContent(),'Mouvement circulaire');
   await page.selectOption('#trajectory-select','ballistic');assert.equal(await page.locator('#speed-select').inputValue(),'0.5');
   console.log(`PASS ${name}: 3D origin controls removed; menu and slow ballistic retained`);
  }finally{await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

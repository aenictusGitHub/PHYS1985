'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, webkit, firefox} = require('playwright');
const root = path.join(__dirname, '..');
const close = (a,b,tol=1e-8) => assert(Math.abs(a-b)<tol, a+' != '+b);
const capture = page => page.evaluate(()=>PhysShare.capture());
const components = p => [p.speed0*Math.cos(p.angle0*Math.PI/180),p.speed0*Math.sin(p.angle0*Math.PI/180)];
const seek = (page,t) => page.locator('#time-slider').evaluate((el,t)=>{
  el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));
},t);
const frames = page => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function drag(page,dx,dy) {
  const el=page.locator('#initial-velocity-handle');
  await el.scrollIntoViewIfNeeded();
  const box=await el.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();
}
(async()=>{
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit],['firefox',firefox]]) {
    const browser=await engine.launch({headless:true,...(name==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
    try {for(const lang of ['fr','en']){
      const context=await browser.newContext({viewport:{width:919,height:805},hasTouch:true,deviceScaleFactor:2});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(path.join(root,'puissance_travail_webapp_fr.html')).href+'?lang='+lang);
      await page.waitForFunction(()=>window.PhysShare?.ready);
      const original=await capture(page),p=original.data.parameters,v=components(p);
      assert.equal(await page.locator('#initial-speed-slider,#initial-angle-slider').count(),0);
      assert.equal(await page.locator('#initial-angle-output,#initial-angle-output-digits').count(),0);
      assert(await page.locator('#initial-velocity-handle').isVisible());
      const gripSize=await page.locator('#initial-velocity-handle').evaluate(el=>{
        const target=el.getBoundingClientRect(),dot=el.querySelector('span').getBoundingClientRect();
        return {target:target.width,dot:dot.width};
      });
      assert(gripSize.target>=44&&gripSize.dot<=8,'small visible dot retains its touch target');
      assert.equal(await page.locator('#initial-velocity-handle').getAttribute('aria-label'),
        lang==='fr'?'Modifier la vitesse initiale':'Adjust the initial velocity');
      await drag(page,35,-25);
      const edited=await capture(page),next=edited.data.parameters;
      close(components(next)[0],v[0]+35/118);close(components(next)[1],v[1]+25/118);
      close(next.x0,p.x0);close(next.y0,p.y0);close(edited.data.time,0);
      assert.deepEqual(edited.data.view,original.data.view);
      assert.equal(await page.locator('#scenario-select').inputValue(),'custom');
      close(Number(await page.locator('#scene-kinetic-digits').getAttribute('data-value')),.5*p.mass*next.speed0**2,.00051);
      await seek(page,2);
      assert(await page.locator('#initial-velocity-handle').isHidden());
      assert(await page.locator('#initial-velocity-readout').isHidden());
      close(Number(await page.locator('#theorem-readout').getAttribute('data-value')),0,.0001);
      await page.click('#reset-button');
      assert(await page.locator('#initial-velocity-handle').isVisible());
      await page.click('#play-button');
      assert(await page.locator('#initial-velocity-handle').isHidden());
      await page.click('#play-button');await page.click('#reset-button');
      await page.locator('#initial-velocity-handle').focus();await page.keyboard.press('Home');
      close((await capture(page)).data.parameters.speed0,0);
      assert(await page.locator('#initial-velocity-handle').isVisible());
      await drag(page,-20,20);
      const fromZero=components((await capture(page)).data.parameters);
      close(fromZero[0],-20/118);close(fromZero[1],-20/118);
      await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowUp');
      close((await capture(page)).data.parameters.speed0,.01);
      close((await capture(page)).data.parameters.angle0,90);
      await drag(page,-280,0);
      close((await capture(page)).data.parameters.speed0,2);
      // A remains independently draggable, including with zero initial speed.
      await page.locator('#initial-velocity-handle').focus();await page.keyboard.press('Home');
      await page.locator('#scene-viewport').scrollIntoViewIfNeeded();await frames(page);
      const a=await page.locator('#scene-label-a').evaluate(el=>{
        const r=document.getElementById('scene-canvas').getBoundingClientRect();
        return {x:r.left+parseFloat(el.style.left)-10,y:r.top+parseFloat(el.style.top)+11};
      });
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x-15,a.y+15,{steps:3});await page.mouse.up();
      assert.notEqual((await capture(page)).data.parameters.x0,p.x0,
        JSON.stringify({a,hit:await page.evaluate(a=>document.elementFromPoint(a.x,a.y)?.outerHTML?.slice(0,200),a)}));
      close((await capture(page)).data.parameters.speed0,0);
      await page.locator('#initial-velocity-handle').focus();await page.keyboard.press('ArrowRight');
      const saved=await capture(page),shared=await context.newPage();
      await shared.goto(await page.evaluate(()=>PhysShare.makeLink()));
      await shared.waitForFunction(()=>window.PhysShare?.ready);
      assert.deepEqual((await capture(shared)).data.parameters,saved.data.parameters);
      assert(await shared.locator('#initial-velocity-handle').isVisible());await shared.close();
      await page.uncheck('#velocity-toggle');
      assert(await page.locator('#initial-velocity-handle').isVisible());
      await page.selectOption('#motion-mode','paths');
      assert(await page.locator('#initial-velocity-handle').isHidden());
      await page.selectOption('#motion-mode','free');
      assert(await page.locator('#initial-velocity-handle').isVisible());
      for(const width of [390,768,1024]){
        await page.setViewportSize({width,height:1000});await frames(page);
        assert(await page.locator('#initial-velocity-handle').isVisible());
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
      }
      if(name==='chromium'&&lang==='fr'){
        await page.selectOption('#scenario-select','positive');
        await page.setViewportSize({width:919,height:805});await frames(page);
        await page.locator('#scene-viewport').screenshot({path:'/private/tmp/work-initial-velocity.png'});
      }
      assert.deepEqual(errors,[]);
      await context.close();
      console.log('PASS initial velocity',name,lang,'drag, keyboard, zero, bounds, t=0, energy, position A, sharing and layout');
    }}finally{await browser.close();}
  }
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:768,height:1024},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    await page.goto(pathToFileURL(path.join(root,'puissance_travail_webapp_fr.html')).href);
    await page.waitForFunction(()=>window.PhysShare?.ready);
    const grip=page.locator('#initial-velocity-handle');await grip.scrollIntoViewIfNeeded();await frames(page);
    const b=await grip.boundingBox(),a={id:1,x:b.x+b.width/2,y:b.y+b.height/2},second={id:2,x:a.x-100,y:a.y};
    const initial=await capture(page),cdp=await page.context().newCDPSession(page);
    const touch=async(type,touchPoints)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints});await frames(page);};
    await touch('touchStart',[a]);await touch('touchMove',[{...a,x:a.x+10,y:a.y-10}]);
    assert.notEqual((await capture(page)).data.parameters.speed0,initial.data.parameters.speed0);
    await touch('touchStart',[{...a,x:a.x+10,y:a.y-10},second]);
    let pair;
    for(let i=1;i<=10;i++){
      pair=[{...a,x:a.x+10+i*4,y:a.y-10},{...second,x:second.x-i*4}];
      await touch('touchMove',pair);
    }
    await touch('touchEnd',[]);
    assert.deepEqual((await capture(page)).data,initial.data,'pinch restores the provisional edit');
    assert(await page.evaluate(()=>visualViewport.scale>1.05),'native pinch remains available on the handle');
    await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await frames(page);await grip.scrollIntoViewIfNeeded();
    const fresh=await grip.boundingBox(),f={id:3,x:fresh.x+22,y:fresh.y+22};
    await touch('touchStart',[f]);await touch('touchMove',[{...f,x:f.x-12,y:f.y-12}]);await touch('touchEnd',[]);
    assert.notEqual((await capture(page)).data.parameters.speed0,initial.data.parameters.speed0);
    console.log('PASS native touch velocity edit, pinch rollback, page zoom and subsequent drag');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

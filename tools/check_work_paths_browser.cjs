/* Optional real-browser smoke/visual checks. Requires Playwright + Chrome. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const proto=CanvasRenderingContext2D.prototype;
      for(const name of ['clearRect','beginPath','moveTo','stroke','arc']){
        const original=proto[name];proto[name]=function(...args){
          if(this.canvas.id==='path-canvas'){
            if(name==='clearRect')this.canvas.testVectors={arrows:[],bodies:[]};
            if(name==='beginPath')this.testOrigin=null;
            if(name==='moveTo'&&!this.testOrigin)this.testOrigin=args;
            if(name==='arc'&&args[2]===7)this.canvas.testVectors?.bodies.push(args.slice(0,2));
            if(name==='stroke'&&['#7758a6','#d9683b'].includes(this.strokeStyle))
              this.canvas.testVectors?.arrows.push({origin:this.testOrigin,color:this.strokeStyle});
          }
          return original.apply(this,args);
        };
      }
    });
    await page.goto(pathToFileURL(path.join(__dirname,'..','puissance_travail_webapp_fr.html')).href);
    await page.waitForFunction(()=>document.getElementById('loading-message').hidden);
    assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
    await page.selectOption('#motion-mode','paths');
    await page.locator('#path-visualization').waitFor({state:'visible'});
    const number=async id=>Number(await page.locator('#'+id).getAttribute('data-value'));
    assert(Math.abs(await number('path-loop-work'))>1);
    const seek=async t=>page.locator('#path-time').evaluate((el,t)=>{el.value=String(t);el.dispatchEvent(new Event('input',{bubbles:true}));},t);
    const vectorCounts=async count=>{
      const rendered=await page.locator('#path-canvas').evaluate(el=>el.testVectors);
      for(const color of ['#7758a6','#d9683b']){
        const arrows=rendered.arrows.filter(a=>a.color===color);assert.equal(arrows.length,count);
        if(count)for(const body of rendered.bodies)assert(arrows.some(a=>Math.hypot(a.origin[0]-body[0],a.origin[1]-body[1])<1e-6),'Vectors originate at both particle centers');
      }
    };
    await seek(3);await vectorCounts(2);
    const legend=await page.locator('#path-vector-legend').boundingBox();
    await seek(6);await vectorCounts(2);assert.deepEqual(await page.locator('#path-vector-legend').boundingBox(),legend,'Legend must not follow the particles');
    await page.uncheck('#path-show-vectors');await vectorCounts(0);assert(!(await page.locator('#path-vector-legend').isVisible()));
    await page.check('#path-show-vectors');await vectorCounts(2);
    await page.selectOption('#path-experiment','loop');await seek(3);await vectorCounts(1);
    await page.selectOption('#path-experiment','compare');
    await page.click('#path-play');await page.waitForTimeout(500);assert(await number('path-time-value')>0);await page.click('#path-play');
    await page.click('#path-end');assert.equal(await number('path-time-value'),10);
    await page.selectOption('#path-field','central');assert(Math.abs(await number('path-loop-work'))<.001);
    assert.equal(await number('path-w1'),await number('path-w2'));
    await page.selectOption('#path-field','vortex');
    await page.selectOption('#path-experiment','loop');await page.click('#path-end');
    const forward=await number('path-current-wloop');await page.check('#path-reverse');await page.click('#path-end');
    assert.equal(await number('path-current-wloop'),-forward);
    assert.equal(await number('path-loop-work'),-forward);
    await page.locator('#path-duration').evaluate(el=>{el.value='20';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('#path-end');assert.equal(await number('path-time-value'),20);assert.equal(await number('path-current-wloop'),-forward);
    await page.selectOption('#path-experiment','compare');
    await page.locator('#path-a').focus();const before=await number('path-w1');await page.keyboard.press('ArrowRight');assert.notEqual(await number('path-w1'),before);
    await page.click('#path-defaults');
    for(const field of ['gravity','periodic','cellular','central','vortex']){
      await page.selectOption('#path-field',field);
      await page.click('#path-end');
      assert(Number.isFinite(await number('path-w1')));
      assert.equal(await page.locator('#path-field-formula > div:visible').count(),1);
      assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
    }
    await page.locator('#path-bend').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await number('path-w1'),await number('path-w2'));
    assert((await page.locator('#path-conclusion').textContent()).includes('ne suffit pas'));
    await page.click('#path-defaults');
    const label=await page.locator('#path-b').boundingBox();await page.mouse.move(label.x+label.width/2,label.y+label.height/2);await page.mouse.down();await page.mouse.move(label.x+label.width/2-25,label.y+label.height/2+20,{steps:4});await page.mouse.up();
    assert.notEqual(await number('path-w1'),before);
    await page.click('#path-defaults');
    await page.locator('#path-time').evaluate(el=>{el.value='7';el.dispatchEvent(new Event('input',{bubbles:true}));});
    if(process.env.SCREENSHOT_DIR)await page.locator('#path-visualization').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'work-paths-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(120);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No mobile horizontal overflow');
    const mobileLegend=await page.locator('#path-vector-legend').boundingBox(),scene=await page.locator('#path-viewport').boundingBox();
    assert(mobileLegend.x>=scene.x&&mobileLegend.x+mobileLegend.width<=scene.x+scene.width,'Mobile legend fits within the scene');
    assert(mobileLegend.y+mobileLegend.height<scene.y+86,'Legend occupies reserved space above the plot');
    if(process.env.SCREENSHOT_DIR)await page.locator('#path-visualization').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'work-paths-mobile.png')});
    await page.selectOption('#path-experiment','loop');await page.click('#path-end');
    if(process.env.SCREENSHOT_DIR)await page.locator('#path-visualization').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'work-paths-loop.png')});
    await page.setViewportSize({width:1440,height:1000});
    await page.selectOption('#motion-mode','integrals');
    assert(await page.locator('#integral-time-card').isVisible());assert(await page.locator('#integral-space-card').isVisible());
    assert(!(await page.locator('#path-work-card').isVisible()));assert(!(await page.locator('#path-experiment').isVisible()));
    const checkIntegrals=async()=>{
      assert(Math.abs(await number('integral-wtime')-await number('integral-wspace'))<.0002);
      assert(Number.isFinite(await number('integral-distance')));
      for(const kind of ['time','space'])assert.equal(await page.locator('#integral-'+kind+'-ticks [data-key="zero"]').count(),1);
    };
    for(const field of ['vortex','central','cellular','periodic','gravity'])for(const route of ['0','1','loop']){
      await page.selectOption('#path-field',field);await page.selectOption('#integral-route',route);
      for(const t of [0,5.42,10,20]){await seek(t);await checkIntegrals();}
    }
    await page.selectOption('#path-field','vortex');await page.selectOption('#integral-route','1');await seek(7);await vectorCounts(1);
    if(process.env.SCREENSHOT_DIR)await page.locator('#path-visualization').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'work-integrals-desktop.png')});
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Integral mode mobile width');
    if(process.env.SCREENSHOT_DIR)await page.locator('#path-visualization').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'work-integrals-mobile.png')});
    assert.equal(await page.locator('mjx-merror,[data-mml-node="merror"]').count(),0);
    await page.click('#path-play');await page.waitForTimeout(150);await page.click('#path-play');assert(await number('path-time-value')>7);
    await page.selectOption('#motion-mode','paths');assert(await page.locator('#path-work-card').isVisible());assert(!(await page.locator('#integral-time-card').isVisible()));
    await page.selectOption('#motion-mode','free');assert(await page.locator('#free-visualization').isVisible());assert(!(await page.locator('#path-visualization').isVisible()));
    await page.click('#play-button');await page.waitForTimeout(150);await page.click('#play-button');assert(await number('time-output-digits')>0);
    assert.deepEqual(errors,[]);console.log('PASS: real MathJax, playback, switching modes, contour reversal, duration, dragging/keyboard endpoints, mobile width, free-mode playback.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

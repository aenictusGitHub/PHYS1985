'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'webdriver',{get:()=>false});
    const proto=CanvasRenderingContext2D.prototype;
    for(const method of ['clearRect','beginPath','moveTo','lineTo','stroke','strokeRect']){
      const original=proto[method];
      proto[method]=function(...args){
        if(method==='clearRect')window.__gridLines=[];
        if(method==='beginPath')this.__testPath=[];
        if(method==='moveTo'||method==='lineTo')(this.__testPath??=[]).push({x:args[0],y:args[1]});
        if(method==='stroke'&&this.strokeStyle.replaceAll(' ','')==='rgba(148,168,186,0.2)')
          window.__gridLines.push(this.__testPath.slice());
        if(method==='strokeRect'&&this.strokeStyle==='#bbcbd9')window.__plot=args;
        return original.apply(this,args);
      };
    }
  });
  await page.goto(pathToFileURL(path.join(__dirname,'..','cinematique_2d_webapp_fr.html')).href);
  await page.waitForFunction(()=>!document.getElementById('loading-message'));
  if(await page.locator('#play-button').innerText()==='Pause')await page.locator('#play-button').click();
  const seek=async t=>page.locator('#time-slider').evaluate((el,t)=>{el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));},t);
  const read=async(index,field)=>Number(await page.locator('.vector-readout').nth(index).locator('.'+field+'-digits').getAttribute('data-value'));
  const gridCheck=async(span)=>{
    const data=await page.evaluate(()=>({lines:window.__gridLines,plot:window.__plot}));
    assert(data.lines.length>0,'Metric grid is drawn');
    const [left,top,width,height]=data.plot;
    assert(Math.abs(width-height)<1e-6,'Squares are not distorted');
    for(const axis of ['x','y']){
      const other=axis==='x'?'y':'x';
      const coords=data.lines.filter(p=>p.length===2&&Math.abs(p[0][axis]-p[1][axis])<1e-6&&Math.abs(p[0][other]-p[1][other])>1)
        .map(p=>p[0][axis]).sort((a,b)=>a-b);
      assert(coords.length>=2,'Multiple grid lines captured');
      for(let i=1;i<coords.length;i++)assert(Math.abs(coords[i]-coords[i-1]-width/span)<.01,'Every square represents exactly 1 m');
    }
    const ticks=await page.locator('.axis-tick-label').evaluateAll(els=>els.map(el=>({value:Number(el.querySelector('[data-value]').dataset.value),x:parseFloat(el.style.left)})));
    for(const tick of ticks)assert(Number.isInteger(tick.value),'Axis labels are in metres');
  };
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    await page.locator('#reset-view').click();
    await page.locator('#trajectory-select').selectOption('lissajous2');await seek(0);
    await gridCheck(8);
    assert.equal(await read(0,'component-x'),6);assert.equal(await read(0,'component-y'),4);
    assert.equal(await read(1,'component-y'),2);
    assert(await page.locator('#full-trail').isChecked());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert((await page.locator('label').filter({has:page.locator('#grid-toggle')}).innerText()).includes('1 carré = 1 m'));
    const keys=await page.locator('#trajectory-select option').evaluateAll(els=>els.map(el=>el.value));
    assert.equal(keys.length,17);
    for(const key of keys){
      await page.locator('#trajectory-select').selectOption(key);
      const max=Number(await page.locator('#time-slider').getAttribute('max'));
      await seek(max*.37);await gridCheck(8);
      assert.equal(await page.locator('[data-mml-node="merror"]').count(),0);
    }
    await page.locator('#trajectory-select').selectOption('mcua');
    await page.locator('#osculating-toggle').check();await seek(2);
    assert.equal(await page.locator('#curvature-digits').getAttribute('data-value'),'2.00');
    if(process.env.SCREENSHOT_DIR)await page.locator('#viewport').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`2d-metric-${width}.png`)});
    await page.locator('#trajectory-select').selectOption('ballistic');await seek(0);
    assert.equal(await read(1,'magnitude'),8.94);assert.equal(await read(2,'component-y'),-9.81);
    const duration=Number(await page.locator('#time-slider').getAttribute('max'));
    assert(duration>1.57&&duration<1.59);await seek(duration);assert.equal(await read(0,'component-y'),0);
    await page.locator('#osculating-toggle').uncheck();
    let span=8;
    for(const delta of [450,-700,900]){
      await page.locator('#viewport').scrollIntoViewIfNeeded();
      const box=await page.locator('#viewport').boundingBox();
      await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.mouse.wheel(0,delta);
      span=Math.max(1,Math.min(18,span*Math.exp(delta*.0012)));
      await page.waitForTimeout(100);await gridCheck(span);
    }
    await page.locator('#reset-view').click();await gridCheck(8);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: 2D grid calibration across 17 trajectories, desktop/mobile, zoom, SI readouts, ballistic gravity and MathJax.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
